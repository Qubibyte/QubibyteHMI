const { app, BrowserWindow, ipcMain, protocol, net, session, Menu } = require('electron');
const path = require('path');
const os = require('os');
const http = require('http');
const fs = require('fs').promises;
const fsSync = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { pathToFileURL } = require('url');
const si = require('systeminformation');
const { resolveQubibyteFilePath } = require('./js/qubibyte-protocol');
const {
  normalizeTheme,
  resolveThemeFromUrl,
  getBackgroundColor,
  injectThemeFlashGuard,
  appendThemeQuery
} = require('./js/qubibyte-theme-paint');
const {
  getTimezoneOptions,
  isValidTimezone,
  resolveTimezone,
  ianaToWindowsTimezone
} = require('./js/qubibyte-timezones');
const {
  normalizeTempUnit,
  tempUnavailable,
  formatTemperatureFromValues
} = require('./js/qubibyte-temp-format');

// Configuration
const TESTING_MODE = 1; // Set to 0 for fullscreen production mode (ignored on Raspberry Pi)

// Serve QubibyteWebsite at qubibyte:///… so /images, /fonts, etc. resolve without editing that folder
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'qubibyte',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

function registerQubibyteProtocol() {
  const websiteRoot = path.normalize(path.join(__dirname, 'QubibyteWebsite'));
  const appRoot = path.normalize(__dirname);

  protocol.handle('qubibyte', async (request) => {
    try {
      const filePath = resolveQubibyteFilePath(request.url, websiteRoot, appRoot);
      if (!filePath) {
        console.error('[qubibyte] 404', request.url);
        return new Response(`Not found: ${request.url}`, {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      if (/\.html?$/i.test(filePath)) {
        const theme = resolveThemeFromUrl(request.url, cachedSettings?.theme);
        const isHmi =
          filePath.startsWith(appRoot) && !filePath.startsWith(websiteRoot);
        const html = injectThemeFlashGuard(
          await fs.readFile(filePath, 'utf8'),
          theme,
          isHmi
        );
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Cache-Control': 'no-cache'
          }
        });
      }

      return net.fetch(pathToFileURL(filePath).href);
    } catch (error) {
      console.error('[qubibyte] error', request.url, error);
      return new Response('Internal error', { status: 500 });
    }
  });

  console.log('Registered qubibyte:// protocol →', websiteRoot);
}

// WebGL / Three.js (Bloch spheres, NMR 3D) require GPU or SwiftShader — must run before app.ready
function readGpuAccelEnabled() {
  if (process.env.QUBIBYTE_DISABLE_GPU === '1') return false;
  if (process.env.QUBIBYTE_ENABLE_GPU === '1') return true;

  let enabled = true;

  try {
    const defaults = JSON.parse(
      fsSync.readFileSync(path.join(__dirname, 'config', 'settings.default.json'), 'utf8')
    );
    if (typeof defaults.gpuAccel === 'boolean') enabled = defaults.gpuAccel;
  } catch {
    // bundled defaults missing — keep GPU on
  }

  try {
    const userPath = path.join(app.getPath('userData'), 'settings.json');
    if (fsSync.existsSync(userPath)) {
      const user = JSON.parse(fsSync.readFileSync(userPath, 'utf8'));
      if (typeof user.gpuAccel === 'boolean') enabled = user.gpuAccel;
    }
  } catch {
    // user settings unreadable — keep prior value
  }

  return enabled;
}

const gpuAccelEnabled = readGpuAccelEnabled();

if (!gpuAccelEnabled) {
  console.warn(
    'GPU acceleration disabled — 3D visualizations (Bloch sphere, NMR magnet) will not render. ' +
      'Enable GPU Acceleration in Settings (restart required) or set QUBIBYTE_ENABLE_GPU=1.'
  );
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
} else {
  console.log('GPU acceleration enabled for WebGL / Three.js');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-webgl');
}

// Detect platform
const isRaspberryPi = process.platform === 'linux' &&
  (process.arch === 'arm64' || process.arch === 'arm');
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';
const isMac = process.platform === 'darwin';
const isProduction = isRaspberryPi || !TESTING_MODE;

console.log(`Platform: ${process.platform}, Architecture: ${process.arch}`);
console.log(`Is Raspberry Pi: ${isRaspberryPi}`);
console.log(`Production mode (fullscreen): ${isProduction}`);

let mainWindow;
let currentPage = 'index.html';
let onboardLedOn = false;
let ledBasePath = null;
let cachedSettings = null;

const DEFAULT_SETTINGS = {
  theme: 'dark',
  fullscreen: false,
  showTemp: true,
  tempUnit: 'F',
  timezone: '',
  screenBrightness: 31,
  animationSpeed: '1',
  gpuAccel: true,
  autoStart: false,
  hwIp: '',
  hwPort: '8080',
  onScreenKeyboard: undefined,
  showCursor: undefined,
  hideCursor: undefined,
  touchMultitouch: undefined
};

const CURSOR_HIDE_CSS_KEY = 'qubibyte-hide-cursor';
const CURSOR_SHOW_CSS_KEY = 'qubibyte-show-cursor';
const LABWC_SYSTEM_RC = '/etc/xdg/labwc/rc.xml';
const LEGACY_PLACEHOLDER_IPS = new Set(['192.168.1.100']);
const CURSOR_HIDE_CSS = 'html, body, *, *::before, *::after, canvas, iframe, embed { cursor: none !important; }';

const NETWORK_IFACE_PREFERENCE = ['wlan0', 'eth0', 'end0', 'en0', 'en1', 'enp', 'wlp'];

function detectPrimaryIPv4() {
  const nets = os.networkInterfaces();
  const seen = new Set();
  const candidates = [];

  const addCandidate = (name, net) => {
    if (!net || net.internal || net.family !== 'IPv4') return;
    const address = String(net.address || '').trim();
    if (!address || seen.has(address)) return;
    seen.add(address);
    candidates.push({ name, address });
  };

  for (const preferred of NETWORK_IFACE_PREFERENCE) {
    for (const [name, entries] of Object.entries(nets)) {
      if (preferred.endsWith('p') ? name.startsWith(preferred) : name === preferred) {
        for (const net of entries || []) addCandidate(name, net);
      }
    }
  }

  for (const [name, entries] of Object.entries(nets)) {
    for (const net of entries || []) addCandidate(name, net);
  }

  return candidates[0]?.address || '127.0.0.1';
}

function isPlaceholderHwIp(ip) {
  const value = typeof ip === 'string' ? ip.trim() : '';
  return !value || LEGACY_PLACEHOLDER_IPS.has(value);
}

function resolveHwIp(ip) {
  return isPlaceholderHwIp(ip) ? detectPrimaryIPv4() : String(ip).trim();
}

function resolveOnScreenKeyboard(settings) {
  if (typeof settings?.onScreenKeyboard === 'boolean') {
    return settings.onScreenKeyboard;
  }
  return isRaspberryPi;
}

function resolveShowCursor(settings) {
  if (typeof settings?.showCursor === 'boolean') {
    return settings.showCursor;
  }
  if (typeof settings?.hideCursor === 'boolean') {
    return !settings.hideCursor;
  }
  return !isRaspberryPi;
}

function resolveTouchMultitouch(settings) {
  if (typeof settings?.touchMultitouch === 'boolean') {
    return settings.touchMultitouch;
  }
  return isRaspberryPi;
}

function resolvePlatformSettings(settings) {
  const resolved = { ...settings };
  resolved.onScreenKeyboard = resolveOnScreenKeyboard(resolved);
  resolved.showCursor = resolveShowCursor(resolved);
  resolved.touchMultitouch = resolveTouchMultitouch(resolved);
  delete resolved.hideCursor;
  return resolved;
}

async function getPlatformDefaultSettings() {
  const bundled = await loadBundledDefaults();
  if (isRaspberryPi) {
    return {
      ...bundled,
      fullscreen: true,
      onScreenKeyboard: true,
      showCursor: false,
      touchMultitouch: true
    };
  }
  return {
    ...bundled,
    onScreenKeyboard: false,
    showCursor: true,
    touchMultitouch: false
  };
}

const BRIGHTNESS_MIN_LEVEL = 1;
const BRIGHTNESS_UI_MAX = 31;

function getUserSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function getBundledDefaultsPath() {
  return path.join(__dirname, 'config', 'settings.default.json');
}

async function loadBundledDefaults() {
  try {
    const raw = await fs.readFile(getBundledDefaultsPath(), 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function ensureUserSettingsFile() {
  const userPath = getUserSettingsPath();
  try {
    await fs.access(userPath);
  } catch {
    const defaults = resolvePlatformSettings(await getPlatformDefaultSettings());
    defaults.hwIp = detectPrimaryIPv4();
    await fs.mkdir(path.dirname(userPath), { recursive: true });
    await fs.writeFile(userPath, JSON.stringify(defaults, null, 2), 'utf8');
    console.log(`Created user settings: ${userPath}`);
  }
}

async function loadUserSettings() {
  if (cachedSettings) return cachedSettings;

  await ensureUserSettingsFile();

  try {
    const raw = await fs.readFile(getUserSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    let migrated = false;
    if (isPlaceholderHwIp(parsed.hwIp)) {
      parsed.hwIp = detectPrimaryIPv4();
      migrated = true;
    }
    cachedSettings = resolvePlatformSettings({
      ...(await getPlatformDefaultSettings()),
      ...parsed
    });
    cachedSettings.hwIp = resolveHwIp(cachedSettings.hwIp);
    if (migrated) {
      await fs.mkdir(path.dirname(getUserSettingsPath()), { recursive: true });
      await fs.writeFile(getUserSettingsPath(), JSON.stringify(cachedSettings, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('Error reading user settings, using defaults:', error);
    cachedSettings = resolvePlatformSettings(await getPlatformDefaultSettings());
    cachedSettings.hwIp = resolveHwIp(cachedSettings.hwIp);
  }

  return cachedSettings;
}

function broadcastSettingsUpdated() {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('qubibyte-settings-updated');
    }
  });
}

async function saveUserSettings(settings) {
  const previous = await loadUserSettings();
  const merged = resolvePlatformSettings({ ...previous, ...settings });
  if (isPlaceholderHwIp(merged.hwIp)) {
    merged.hwIp = detectPrimaryIPv4();
  }
  cachedSettings = merged;
  await fs.mkdir(path.dirname(getUserSettingsPath()), { recursive: true });
  await fs.writeFile(getUserSettingsPath(), JSON.stringify(merged, null, 2), 'utf8');
  console.log(`Saved user settings: ${getUserSettingsPath()}`);
  broadcastThemeToAllWindows(merged.theme);
  broadcastSettingsUpdated();
  if (merged.showCursor !== previous.showCursor) {
    await applyShowCursorSetting(merged.showCursor);
  }
  if (isRaspberryPi && merged.touchMultitouch !== previous.touchMultitouch) {
    await applyTouchMultitouch(merged.touchMultitouch);
  }
  return merged;
}

async function applyShowCursorToContents(contents, show) {
  if (!contents || contents.isDestroyed()) return;
  try {
    await contents.removeInsertedCSS(CURSOR_HIDE_CSS_KEY);
  } catch {
    /* not hidden */
  }
  try {
    await contents.removeInsertedCSS(CURSOR_SHOW_CSS_KEY);
  } catch {
    /* not shown */
  }
  if (show) {
    return;
  }
  try {
    await contents.insertCSS(CURSOR_HIDE_CSS, { cssOrigin: CURSOR_HIDE_CSS_KEY });
  } catch (err) {
    console.warn('Could not hide cursor CSS:', err.message);
  }
}

function scheduleCursorReapply(contents) {
  if (!contents || contents.isDestroyed()) return;
  const show = resolveShowCursor(cachedSettings || {});
  applyShowCursorToContents(contents, show).catch(() => {});
}

async function applyShowCursorSetting(show) {
  const { webContents } = require('electron');
  for (const wc of webContents.getAllWebContents()) {
    if (!wc || wc.isDestroyed()) continue;
    const url = wc.getURL() || '';
    if (url.startsWith('devtools://')) continue;
    await applyShowCursorToContents(wc, show);
  }
}

function setTouchMouseEmulationInXml(xml, mouseEmulationOn) {
  const val = mouseEmulationOn ? 'yes' : 'no';
  let out = xml.replace(/(<touch[^>]*\s)mouseEmulation="(yes|no)"/gi, `$1mouseEmulation="${val}"`);
  out = out.replace(/<mouseEmulation>\s*(yes|no)\s*<\/mouseEmulation>/gi, `<mouseEmulation>${val}</mouseEmulation>`);
  return out;
}

function ensureTouchMouseEmulationInXml(xml, mouseEmulationOn) {
  const val = mouseEmulationOn ? 'yes' : 'no';
  if (/mouseEmulation/i.test(xml)) {
    return setTouchMouseEmulationInXml(xml, mouseEmulationOn);
  }
  if (/<labwc_config/i.test(xml)) {
    return xml.replace(
      /(<labwc_config[^>]*>)/i,
      `$1\n  <touch mouseEmulation="${val}"/>`
    );
  }
  return `<?xml version="1.0"?>\n<labwc_config>\n  <touch mouseEmulation="${val}"/>\n</labwc_config>\n`;
}

function getLabwcUserRcPath() {
  return path.join(app.getPath('home'), '.config', 'labwc', 'rc.xml');
}

async function applyTouchMultitouch(multitouch) {
  if (!isRaspberryPi) {
    return { ok: false, reason: 'not-pi' };
  }

  const mouseEmulationOn = !multitouch;
  const userRcPath = getLabwcUserRcPath();
  let xml = '';

  try {
    xml = await fs.readFile(userRcPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('Could not read labwc user rc.xml:', err.message);
    }
    try {
      xml = await fs.readFile(LABWC_SYSTEM_RC, 'utf8');
    } catch (sysErr) {
      if (sysErr.code !== 'ENOENT') {
        console.warn('Could not read labwc system rc.xml:', sysErr.message);
      }
      xml = '';
    }
  }

  const updated = ensureTouchMouseEmulationInXml(xml, mouseEmulationOn);
  try {
    await fs.mkdir(path.dirname(userRcPath), { recursive: true });
    await fs.writeFile(userRcPath, updated, 'utf8');
    console.log(`labwc touch mouseEmulation=${mouseEmulationOn ? 'yes' : 'no'} → ${userRcPath}`);
  } catch (err) {
    console.error('Could not write labwc rc.xml:', err);
    return { ok: false, reason: err.message };
  }

  try {
    await execFileAsync('killall', ['-SIGHUP', 'labwc'], { timeout: 5000 });
  } catch {
    /* labwc may not be running in dev */
  }

  return { ok: true, mouseEmulation: mouseEmulationOn ? 'yes' : 'no' };
}

async function applySavedInputSettings() {
  const settings = cachedSettings || (await loadUserSettings());
  await applyShowCursorSetting(settings.showCursor);
  if (isRaspberryPi) {
    await applyTouchMultitouch(settings.touchMultitouch);
  }
}

function getCurrentTheme() {
  return normalizeTheme(cachedSettings?.theme);
}

function backgroundColorForUrl(url, theme) {
  const t = normalizeTheme(theme);
  const isHmiShell = /qubibyte:\/\/local\/hmi\//i.test(url || '');
  return getBackgroundColor(t, isHmiShell);
}

/** Per-WebContents theme + one navigation hook (avoids MaxListenersExceededWarning). */
const themeStateByContents = new WeakMap();
const themeHooksInstalled = new WeakSet();

function paintWebContentsBackground(contents, theme, url, isMainFrame) {
  if (!contents || contents.isDestroyed()) return;
  const t = normalizeTheme(theme);
  try {
    if (isMainFrame === false) {
      contents.setBackgroundColor(getBackgroundColor(t, false));
    } else {
      contents.setBackgroundColor(backgroundColorForUrl(url || contents.getURL(), t));
    }
  } catch {
    /* ignore */
  }
}

function ensureWebContentsThemeHooks(contents) {
  if (!contents || contents.isDestroyed() || themeHooksInstalled.has(contents)) return;

  themeHooksInstalled.add(contents);
  if (!themeStateByContents.has(contents)) {
    themeStateByContents.set(contents, { theme: getCurrentTheme() });
  }

  const onNav = (_event, url, isMainFrame) => {
    const state = themeStateByContents.get(contents);
    if (!state) return;
    paintWebContentsBackground(contents, state.theme, url, isMainFrame);
  };

  contents.on('did-start-navigation', onNav);
  contents.once('destroyed', () => {
    themeHooksInstalled.delete(contents);
    themeStateByContents.delete(contents);
    contents.removeListener('did-start-navigation', onNav);
  });
}

function applyThemeToWebContents(contents, theme) {
  if (!contents || contents.isDestroyed()) return;
  const t = normalizeTheme(theme);
  themeStateByContents.set(contents, { theme: t });
  ensureWebContentsThemeHooks(contents);
  paintWebContentsBackground(contents, t, contents.getURL(), true);
}

function broadcastThemeToAllWindows(theme) {
  const { webContents, BrowserWindow } = require('electron');
  const t = normalizeTheme(theme);
  cachedSettings = { ...(cachedSettings || {}), theme: t };

  const js = `(function (theme) {
    try {
      localStorage.setItem('qubibyte-theme', theme);
    } catch (e) {}
    if (window.QubibyteTheme && window.QubibyteTheme.apply) {
      window.QubibyteTheme.apply(theme, { silent: true });
    } else {
      document.documentElement.dataset.theme = theme;
      window.QUBIBYTE_THEME = theme;
    }
  })(${JSON.stringify(t)})`;

  for (const wc of webContents.getAllWebContents()) {
    if (!wc || wc.isDestroyed()) continue;
    applyThemeToWebContents(wc, t);
    if (wc.getURL() && !wc.getURL().startsWith('devtools://')) {
      wc.executeJavaScript(js, true).catch(() => {});
    }
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('qubibyte-theme', t);
    }
  }
}

const LED_NAME_PRIORITY = ['ACT', 'led0', 'LED0'];

async function resolveLedPath() {
  if (ledBasePath) return ledBasePath;
  try {
    const entries = await fs.readdir('/sys/class/leds');
    if (!entries.length) return null;

    for (const preferred of LED_NAME_PRIORITY) {
      const match = entries.find((name) => name.toUpperCase() === preferred.toUpperCase());
      if (match) {
        ledBasePath = `/sys/class/leds/${match}`;
        return ledBasePath;
      }
    }

    const actExact = entries.find((name) => /(^|:)act$/i.test(name));
    if (actExact) {
      ledBasePath = `/sys/class/leds/${actExact}`;
      return ledBasePath;
    }

    const act = entries.find(
      (name) => /act/i.test(name) && !/keyboard|kbd|caps|num|scroll|mute/i.test(name)
    );
    if (act) {
      ledBasePath = `/sys/class/leds/${act}`;
      return ledBasePath;
    }

    console.warn('Onboard LED not found. Available sysfs LEDs:', entries.join(', '));
  } catch (error) {
    console.error('Could not enumerate onboard LEDs:', error);
  }
  return null;
}

async function readLedMaxBrightness(base) {
  try {
    const raw = await fs.readFile(`${base}/max_brightness`, 'utf8');
    const max = parseInt(raw.trim(), 10);
    return Number.isFinite(max) && max > 0 ? max : 255;
  } catch {
    return 255;
  }
}

/** Pi ACT LED: max_brightness is 1 and 0 = on, 1 = off (active-low). */
function brightnessForOnboardLed(on, max) {
  if (max === 1) {
    return on ? '0' : '1';
  }
  return on ? String(max) : '0';
}

function isLedBrightnessOn(brightness, max) {
  if (max === 1) {
    return brightness === 0;
  }
  return brightness > 0;
}

async function readOnboardLedFromHardware(base) {
  if (!base) return null;
  try {
    const max = await readLedMaxBrightness(base);
    const raw = await fs.readFile(`${base}/brightness`, 'utf8');
    const brightness = parseInt(raw.trim(), 10);
    if (!Number.isFinite(brightness)) return null;
    return isLedBrightnessOn(brightness, max);
  } catch (error) {
    console.error('Failed to read onboard LED brightness:', error);
    return null;
  }
}

async function applyOnboardLed(on) {
  const base = await resolveLedPath();
  if (!base) {
    return { ok: false, reason: 'no-led' };
  }

  const max = await readLedMaxBrightness(base);
  const brightness = brightnessForOnboardLed(on, max);

  try {
    await fs.writeFile(`${base}/trigger`, 'none');
    await fs.writeFile(`${base}/brightness`, brightness);
    const verified = await readOnboardLedFromHardware(base);
    onboardLedOn = verified !== null ? verified : on;
    console.log(`Onboard LED ${onboardLedOn ? 'on' : 'off'} (${base}, brightness ${brightness})`);
    return { ok: true, on: onboardLedOn };
  } catch (error) {
    console.error('Failed to set onboard LED:', error);
    const reason = error.code === 'EACCES' || error.code === 'EPERM'
      ? 'permission-denied'
      : error.message;
    return { ok: false, reason };
  }
}

async function toggleOnboardLed() {
  const base = await resolveLedPath();
  if (!base) {
    return { ok: false, reason: 'no-led' };
  }

  const currentlyOn = await readOnboardLedFromHardware(base);
  if (currentlyOn === null) {
    return { ok: false, reason: 'read-failed' };
  }

  return applyOnboardLed(!currentlyOn);
}

async function ensureOnboardLedOff() {
  if (!isRaspberryPi) return;
  const result = await applyOnboardLed(false);
  if (!result.ok) {
    console.warn('Could not initialize onboard LED to off:', result.reason);
  }
}

let backlightBasePath = null;

const BACKLIGHT_ID_PRIORITY = ['11-0045', '10-0045', '4-0045', '6-0045'];

async function resolveBacklightPath() {
  if (backlightBasePath) return backlightBasePath;
  try {
    const entries = await fs.readdir('/sys/class/backlight');
    if (!entries.length) return null;

    const touchPanels = entries.filter((name) => /-0045$/.test(name));
    for (const id of BACKLIGHT_ID_PRIORITY) {
      if (touchPanels.includes(id)) {
        backlightBasePath = `/sys/class/backlight/${id}`;
        return backlightBasePath;
      }
    }
    if (touchPanels.length) {
      backlightBasePath = `/sys/class/backlight/${touchPanels[0]}`;
      return backlightBasePath;
    }

    if (entries.includes('rpi_backlight')) {
      backlightBasePath = '/sys/class/backlight/rpi_backlight';
      return backlightBasePath;
    }

    backlightBasePath = `/sys/class/backlight/${entries[0]}`;
    return backlightBasePath;
  } catch (error) {
    console.error('Could not enumerate backlight devices:', error);
  }
  return null;
}

async function readBacklightMax(base) {
  try {
    const raw = await fs.readFile(`${base}/max_brightness`, 'utf8');
    const max = parseInt(raw.trim(), 10);
    return Number.isFinite(max) && max > 0 ? max : 31;
  } catch {
    return 31;
  }
}

async function readBacklightRaw(base) {
  const raw = await fs.readFile(`${base}/brightness`, 'utf8');
  const val = parseInt(raw.trim(), 10);
  return Number.isFinite(val) && val >= 0 ? val : 0;
}

function clampBrightnessLevel(level, max) {
  const cap = Number.isFinite(max) && max > 0 ? max : BRIGHTNESS_UI_MAX;
  const n = Number(level);
  if (!Number.isFinite(n)) return cap;
  return Math.min(cap, Math.max(BRIGHTNESS_MIN_LEVEL, Math.round(n)));
}

/** Legacy settings used 0–100 (%); map to hardware level 1–max. */
function normalizeSavedBrightness(value, max = BRIGHTNESS_UI_MAX) {
  const n = Number(value);
  const cap = Number.isFinite(max) && max > 0 ? max : BRIGHTNESS_UI_MAX;
  if (!Number.isFinite(n)) return cap;
  if (n > cap) {
    return clampBrightnessLevel(Math.round((n / 100) * cap), cap);
  }
  return clampBrightnessLevel(n, cap);
}

function rawToLevel(raw, max) {
  if (raw < BRIGHTNESS_MIN_LEVEL) return BRIGHTNESS_MIN_LEVEL;
  return clampBrightnessLevel(raw, max);
}

async function getDisplayBrightnessState() {
  const settings = cachedSettings || (await loadUserSettings());
  const savedLevel = normalizeSavedBrightness(
    settings.screenBrightness ?? BRIGHTNESS_UI_MAX,
    BRIGHTNESS_UI_MAX
  );

  if (!isRaspberryPi) {
    return {
      ok: false,
      reason: 'not-pi',
      level: savedLevel,
      minLevel: BRIGHTNESS_MIN_LEVEL,
      maxLevel: BRIGHTNESS_UI_MAX,
      available: false
    };
  }

  const base = await resolveBacklightPath();
  if (!base) {
    return {
      ok: false,
      reason: 'no-backlight',
      level: savedLevel,
      minLevel: BRIGHTNESS_MIN_LEVEL,
      maxLevel: BRIGHTNESS_UI_MAX,
      available: false
    };
  }

  try {
    const max = await readBacklightMax(base);
    const raw = await readBacklightRaw(base);
    const uiMax = Math.min(max, BRIGHTNESS_UI_MAX);
    return {
      ok: true,
      level: rawToLevel(raw, uiMax),
      minLevel: BRIGHTNESS_MIN_LEVEL,
      maxLevel: BRIGHTNESS_UI_MAX,
      raw,
      available: true,
      path: base
    };
  } catch (error) {
    console.error('Failed to read display brightness:', error);
    return {
      ok: false,
      reason: error.message,
      level: savedLevel,
      minLevel: BRIGHTNESS_MIN_LEVEL,
      maxLevel: BRIGHTNESS_UI_MAX,
      available: false
    };
  }
}

async function setDisplayBrightness(level) {
  if (!isRaspberryPi) {
    const normalized = normalizeSavedBrightness(level, BRIGHTNESS_UI_MAX);
    return { ok: false, reason: 'not-pi', level: normalized };
  }

  const base = await resolveBacklightPath();
  if (!base) {
    const normalized = normalizeSavedBrightness(level, BRIGHTNESS_UI_MAX);
    return { ok: false, reason: 'no-backlight', level: normalized };
  }

  try {
    const max = await readBacklightMax(base);
    const uiLevel = clampBrightnessLevel(level, BRIGHTNESS_UI_MAX);
    const raw = clampBrightnessLevel(uiLevel, max);
    await fs.writeFile(`${base}/brightness`, String(raw));
    console.log(`Display brightness level ${raw}/${max} via ${base}`);
    return { ok: true, level: raw, max };
  } catch (error) {
    console.error('Failed to set display brightness:', error);
    const normalized = normalizeSavedBrightness(level, BRIGHTNESS_UI_MAX);
    return { ok: false, reason: error.message, level: normalized };
  }
}

async function applySavedDisplayBrightness() {
  if (!isRaspberryPi) return;
  const settings = cachedSettings || (await loadUserSettings());
  if (settings.screenBrightness === undefined) return;
  const result = await setDisplayBrightness(settings.screenBrightness);
  if (!result.ok) {
    console.warn('Could not apply saved display brightness:', result.reason);
  }
}

/** Block DevTools shortcuts on every webContents (testing and production). */
function isDevToolsAccelerator(input) {
  if (input.type !== 'keyDown') return false;

  if (input.key === 'F12') return true;

  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  if (!['i', 'j', 'c'].includes(key)) return false;

  const cmdOrCtrl = input.control || input.meta;
  if (!cmdOrCtrl) return false;

  if (input.shift) return true;
  if (input.meta && input.alt) return true;
  if (input.control && input.alt) return true;

  return false;
}

function installDevToolsGuards(contents) {
  if (!contents || contents.isDestroyed()) return;

  contents.on('before-input-event', (event, input) => {
    if (isDevToolsAccelerator(input)) {
      event.preventDefault();
    }
  });

  contents.on('devtools-opened', () => {
    if (!contents.isDestroyed()) {
      contents.closeDevTools();
    }
  });
}

function installProductionInputGuards(contents) {
  if (!isProduction || !contents || contents.isDestroyed()) return;

  contents.on('context-menu', (event) => {
    event.preventDefault();
  });

  contents.on('before-input-event', (event, input) => {
    if (input.type === 'mouseDown' && (input.button === '3' || input.button === '4')) {
      event.preventDefault();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: isProduction ? 1920 : 1280,
    height: isProduction ? 1080 : 720,
    fullscreen: isProduction,
    frame: !isProduction,
    kiosk: isProduction,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: false
    },
    backgroundColor: '#0a0a0f',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'media', 'fav.png')
  });

  if (!isProduction) {
    console.log('Screen dimensions: 1280 x 720 (testing mode)');
  } else {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = isRaspberryPi
      ? primaryDisplay.bounds
      : primaryDisplay.workAreaSize;
    mainWindow.setBounds({ width, height, x: 0, y: 0 });

    console.log(`Screen dimensions: ${width} x ${height} (fullscreen mode)`);
  }

  mainWindow.loadURL(appendThemeQuery('qubibyte://local/hmi/index.html', getCurrentTheme()));

  mainWindow.webContents.on('did-finish-load', () => {
    scheduleCursorReapply(mainWindow.webContents);
  });
  mainWindow.webContents.on('did-frame-finish-load', () => {
    scheduleCursorReapply(mainWindow.webContents);
  });

  mainWindow.once('ready-to-show', () => {
    if (isProduction) {
      mainWindow.setFullScreen(true);
      if (isRaspberryPi) {
        mainWindow.setKiosk(true);
        const { screen } = require('electron');
        const { bounds } = screen.getPrimaryDisplay();
        mainWindow.setBounds(bounds);
      }
    }
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  installDevToolsGuards(mainWindow.webContents);
  installProductionInputGuards(mainWindow.webContents);
}

app.on('web-contents-created', (_event, contents) => {
  applyThemeToWebContents(contents, getCurrentTheme());
  installDevToolsGuards(contents);
  installProductionInputGuards(contents);

  contents.on('did-finish-load', () => {
    scheduleCursorReapply(contents);
  });
  contents.on('did-frame-finish-load', () => {
    scheduleCursorReapply(contents);
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (!url) return { action: 'deny' };
    const resolved = resolveEmbeddedNavigationUrl(url);
    if (resolved) {
      contents.loadURL(resolved).catch((err) => console.error('Embedded navigation failed:', resolved, err));
    }
    return { action: 'deny' };
  });
});

/** Same-tab navigation for popups when viewing QubibyteWebsite inside the HMI. */
function resolveEmbeddedNavigationUrl(url) {
  try {
    const parsed = new URL(url);

    const videoMatch = url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/i
    );
    if (videoMatch) {
      return buildVideoviewerUrl(videoMatch[1]);
    }

    if (parsed.protocol === 'qubibyte:' && parsed.hostname === 'local') {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
}

/** YouTube blocks embeds without a valid HTTPS Referer (Error 153). qubibyte:// is not accepted. */
const YOUTUBE_EMBED_ORIGIN = 'https://qubibyte.org';
let localWebsiteHttpOrigin = null;
let localWebsiteHttpServer = null;

const LOCAL_HTTP_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

function buildVideoviewerUrl(videoId) {
  const query = `?v=${encodeURIComponent(videoId)}`;
  if (localWebsiteHttpOrigin) {
    return `${localWebsiteHttpOrigin}/videoviewer/${query}`;
  }
  return `qubibyte://local/videoviewer/${query}`;
}

async function serveLocalWebsiteFile(res, filePath, requestUrl) {
  const ext = path.extname(filePath).toLowerCase();

  if (/\.html?$/i.test(filePath)) {
    const theme = resolveThemeFromUrl(requestUrl || '', cachedSettings?.theme);
    const html = injectThemeFlashGuard(await fs.readFile(filePath, 'utf8'), theme, false);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': 'no-cache'
    });
    res.end(html);
    return;
  }

  const data = await fs.readFile(filePath);
  res.writeHead(200, {
    'Content-Type': LOCAL_HTTP_MIME[ext] || 'application/octet-stream',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-cache'
  });
  res.end(data);
}

function startLocalWebsiteHttpServer(websiteRoot) {
  const root = path.normalize(websiteRoot);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const parsed = new URL(req.url || '/', 'http://127.0.0.1');
        let urlPath = decodeURIComponent(parsed.pathname);
        if (urlPath === '/') urlPath = '/index.html';
        if (urlPath.endsWith('/')) urlPath += 'index.html';

        const relative = urlPath.replace(/^\/+/, '').replace(/\\/g, '/');
        let filePath = path.normalize(path.join(root, relative));
        if (!filePath.startsWith(root)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden');
          return;
        }

        let stat;
        try {
          stat = await fs.stat(filePath);
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }

        if (stat.isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }

        await serveLocalWebsiteFile(res, filePath, req.url);
      } catch (error) {
        console.error('[local-http] error', req.url, error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
        }
        res.end('Internal error');
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      localWebsiteHttpOrigin = `http://127.0.0.1:${port}`;
      localWebsiteHttpServer = server;
      console.log('Local website HTTP (YouTube embeds) →', localWebsiteHttpOrigin);
      resolve(server);
    });
  });
}

function installYoutubeEmbedSessionSupport() {
  const urls = [
    '*://*.youtube.com/*',
    '*://*.youtube-nocookie.com/*',
    '*://*.googlevideo.com/*',
    '*://*.ytimg.com/*',
    '*://*.ggpht.com/*',
    '*://*.googleapis.com/*'
  ];

  session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    delete headers.referer;

    const pageOrigin = localWebsiteHttpOrigin || YOUTUBE_EMBED_ORIGIN;
    const refererBase = localWebsiteHttpOrigin
      ? `${localWebsiteHttpOrigin}/videoviewer/`
      : `${YOUTUBE_EMBED_ORIGIN}/videoviewer/`;

    headers.Referer = refererBase;

    if (/youtube\.com\/embed|youtube-nocookie\.com\/embed/i.test(details.url)) {
      headers.Origin = pageOrigin.replace(/\/$/, '');
    }

    callback({ requestHeaders: headers });
  });

  console.log('YouTube embed Referer/Origin →', YOUTUBE_EMBED_ORIGIN, '(+ local HTTP when available)');
}

app.whenReady().then(async () => {
  // No application menu — prevents View → Toggle Developer Tools (Alt accelerators on Windows)
  Menu.setApplicationMenu(null);

  registerQubibyteProtocol();
  installYoutubeEmbedSessionSupport();

  const websiteRoot = path.join(__dirname, 'QubibyteWebsite');
  try {
    await startLocalWebsiteHttpServer(websiteRoot);
  } catch (error) {
    console.error('Could not start local HTTP server for YouTube embeds:', error);
  }

  await loadUserSettings();
  await ensureOnboardLedOff();
  await applySavedDisplayBrightness();
  await applySavedSystemTimezone();
  await applySavedInputSettings();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (localWebsiteHttpServer) {
    localWebsiteHttpServer.close();
    localWebsiteHttpServer = null;
  }
});

let cachedTimezoneOptions = null;
/** WMI / systeminformation often reports ~27.8°C (82.0°F) when no CPU sensor exists. */
const WINDOWS_TEMP_STUB_C = 27.8;
const recentCpuTempC = [];

function isReasonableTempC(tempC) {
  return Number.isFinite(tempC) && tempC > -40 && tempC < 120;
}

function isWindowsTempStub(tempC) {
  return isWindows && Math.abs(tempC - WINDOWS_TEMP_STUB_C) < 0.35;
}

function isStuckTempReading(tempC) {
  recentCpuTempC.push(tempC);
  if (recentCpuTempC.length > 4) recentCpuTempC.shift();
  if (recentCpuTempC.length < 3) return false;
  const first = recentCpuTempC[0];
  return recentCpuTempC.every((v) => Math.abs(v - first) < 0.05);
}

function hasIndependentTempEvidence(cpuTemp, tempC) {
  const cores = Array.isArray(cpuTemp.cores) ? cpuTemp.cores.filter((v) => v > 0 && v !== -1) : [];
  if (cores.length > 1) {
    const spread = Math.max(...cores) - Math.min(...cores);
    if (spread > 0.4) return true;
  }
  if (cpuTemp.max > 0 && cpuTemp.max !== -1 && Math.abs(cpuTemp.max - tempC) > 0.4) return true;
  if (cpuTemp.chipset > 0 && cpuTemp.chipset !== -1 && Math.abs(cpuTemp.chipset - tempC) > 0.4) {
    return true;
  }
  return false;
}

function isTrustworthyCpuTempC(tempC, cpuTemp) {
  if (!isReasonableTempC(tempC)) return false;
  if (isWindowsTempStub(tempC)) return false;
  if (isStuckTempReading(tempC) && !hasIndependentTempEvidence(cpuTemp, tempC)) return false;
  return true;
}

function formatHeaderTime(timezone) {
  const tz = resolveTimezone(timezone);
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz
  });
}

async function readHeaderTemperature(showTemp, tempUnit = 'F') {
  if (!showTemp) {
    return { temperature: '', temperatureC: null, temperatureF: null };
  }

  const unit = normalizeTempUnit(tempUnit);
  let tempStr = tempUnavailable(unit);
  let tempCValue = null;
  let tempFValue = null;
  let tempValid = false;

  if (isRaspberryPi) {
    try {
      const tempData = await fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
      const tempC = parseInt(tempData.trim(), 10) / 1000;
      if (isReasonableTempC(tempC)) {
        const tempF = (tempC * 9 / 5) + 32;
        tempCValue = tempC;
        tempFValue = tempF;
        tempValid = true;
      }
    } catch (fileError) {
      console.error('Error reading Raspberry Pi thermal file:', fileError);
    }
  } else {
    try {
      const cpuTemp = await si.cpuTemperature();
      const tempC = cpuTemp?.main;
      if (
        cpuTemp &&
        tempC !== undefined &&
        tempC !== -1 &&
        tempC > 0 &&
        isTrustworthyCpuTempC(tempC, cpuTemp)
      ) {
        const tempF = (tempC * 9 / 5) + 32;
        tempCValue = tempC;
        tempFValue = tempF;
        tempValid = true;
      }
    } catch (siError) {
      console.error('Error getting temperature:', siError);
    }
  }

  if (tempValid) {
    tempStr = formatTemperatureFromValues(tempCValue, tempFValue, unit);
  } else {
    tempStr = tempUnavailable(unit);
  }

  return { temperature: tempStr, temperatureC: tempCValue, temperatureF: tempFValue };
}

async function buildHeaderInfoPayload() {
  const settings = cachedSettings || (await loadUserSettings());
  const showTemp = settings.showTemp !== false;
  const tempUnit = normalizeTempUnit(settings.tempUnit);
  const timezone = resolveTimezone(settings.timezone);
  const time = formatHeaderTime(timezone);
  const temps = await readHeaderTemperature(showTemp, tempUnit);
  return {
    time,
    timezone,
    tempUnit,
    showTemperature: showTemp,
    showTemp,
    ...temps
  };
}

async function setSystemTimezone(timezone) {
  const tz = resolveTimezone(timezone);
  if (!isValidTimezone(tz)) {
    return { ok: false, reason: 'invalid-timezone' };
  }

  try {
    if (isRaspberryPi) {
      await execFileAsync('timedatectl', ['set-timezone', tz], { timeout: 15000 });
      console.log(`System timezone set to ${tz}`);
      return { ok: true, timezone: tz };
    }

    if (isWindows) {
      const winTz = ianaToWindowsTimezone(tz);
      if (!winTz) {
        return { ok: false, reason: 'no-windows-mapping', timezone: tz };
      }
      const escaped = winTz.replace(/'/g, "''");
      await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `Set-TimeZone -Id '${escaped}'`
        ],
        { timeout: 15000 }
      );
      console.log(`Windows timezone set to ${winTz} (${tz})`);
      return { ok: true, timezone: tz, windowsTimezone: winTz };
    }

    return { ok: false, reason: 'unsupported', timezone: tz };
  } catch (error) {
    console.error('Failed to set system timezone:', error);
    return { ok: false, reason: error.message, timezone: tz };
  }
}

async function applySavedSystemTimezone() {
  if (!isRaspberryPi && !isWindows) return;
  const settings = cachedSettings || (await loadUserSettings());
  if (!settings.timezone) return;
  const result = await setSystemTimezone(settings.timezone);
  if (!result.ok) {
    console.warn('Could not apply saved system timezone:', result.reason);
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getSystemDateTimeState() {
  const now = new Date();
  return {
    ok: true,
    date: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    display: now.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }),
    timestamp: now.getTime()
  };
}

async function setSystemDateTime(dateStr, timeStr) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeStr || '').trim());
  if (!dateMatch || !timeMatch) {
    return { ok: false, reason: 'invalid-datetime' };
  }

  const y = Number(dateMatch[1]);
  const mo = Number(dateMatch[2]);
  const d = Number(dateMatch[3]);
  const hh = Number(timeMatch[1]);
  const mm = Number(timeMatch[2]);
  const cmdStr = `${y}-${pad2(mo)}-${pad2(d)} ${pad2(hh)}:${pad2(mm)}:00`;

  if (!isRaspberryPi && !isWindows) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    if (isRaspberryPi) {
      await execFileAsync('timedatectl', ['set-ntp', 'false'], { timeout: 10000 }).catch(() => {});
      await execFileAsync('timedatectl', ['set-time', cmdStr], { timeout: 15000 });
    } else {
      await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `Set-Date -Date '${cmdStr}'`
        ],
        { timeout: 15000 }
      );
    }
    console.log(`System date/time set to ${cmdStr}`);
    return { ok: true, ...getSystemDateTimeState() };
  } catch (error) {
    console.error('Failed to set system date/time:', error);
    return { ok: false, reason: error.message };
  }
}

async function syncSystemDateTime() {
  if (!isRaspberryPi && !isWindows) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    if (isRaspberryPi) {
      await execFileAsync('timedatectl', ['set-ntp', 'true'], { timeout: 10000 });
      await execFileAsync('systemctl', ['restart', 'systemd-timesyncd'], { timeout: 15000 }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 2500));
      console.log('NTP re-enabled and time sync requested (systemd-timesyncd)');
    } else {
      await execFileAsync('w32tm', ['/resync', '/force'], { timeout: 30000 });
      console.log('Windows time resync requested (w32tm)');
    }
    return { ok: true, ntpEnabled: true, ...getSystemDateTimeState() };
  } catch (error) {
    console.error('Failed to sync system date/time:', error);
    return { ok: false, reason: error.message };
  }
}

// Fast path for top-bar only (no CPU/mem/network telemetry)
ipcMain.handle('get-header-info', async () => {
  try {
    return await buildHeaderInfoPayload();
  } catch (error) {
    console.error('Error getting header info:', error);
    const settings = cachedSettings || (await loadUserSettings());
    const showTemp = settings.showTemp !== false;
    const tempUnit = normalizeTempUnit(settings.tempUnit);
    const timezone = resolveTimezone(settings.timezone);
    return {
      time: formatHeaderTime(timezone),
      timezone,
      tempUnit,
      showTemperature: showTemp,
      showTemp,
      temperature: showTemp ? tempUnavailable(tempUnit) : '',
      temperatureC: null,
      temperatureF: null
    };
  }
});

// IPC handlers for system information
ipcMain.handle('get-system-info', async () => {
  try {
    const settings = cachedSettings || (await loadUserSettings());
    const showTemp = settings.showTemp !== false;
    const tempUnit = normalizeTempUnit(settings.tempUnit);
    const timezone = resolveTimezone(settings.timezone);
    const time = formatHeaderTime(timezone);
    const temps = await readHeaderTemperature(showTemp, tempUnit);

    // Best-effort telemetry (available on Pi/Windows when Electron is running)
    const safeAsync = (fn) => Promise.resolve()
      .then(fn)
      .catch(() => null);

    // systeminformation mixes sync and async APIs depending on call
    const [load, mem, uptime, net] = await Promise.all([
      safeAsync(() => si.currentLoad()),
      safeAsync(() => si.mem()),
      safeAsync(() => si.time()),
      safeAsync(() => si.networkStats())
    ]);

    const cpuPct = load?.currentload;
    const memPct = mem ? (mem.used / mem.total) * 100 : null;
    const upSeconds = uptime?.uptime ?? null;

    // networkStats can return array
    const net0 = Array.isArray(net) ? net[0] : net;
    const rxSec = net0?.rx_sec ?? null;
    const txSec = net0?.tx_sec ?? null;

    return {
      time,
      timezone,
      tempUnit,
      showTemperature: showTemp,
      showTemp,
      temperature: temps.temperature,
      temperatureC: temps.temperatureC,
      temperatureF: temps.temperatureF,
      cpuPercent: Number.isFinite(cpuPct) ? cpuPct : null,
      memoryPercent: Number.isFinite(memPct) ? memPct : null,
      uptimeSeconds: Number.isFinite(upSeconds) ? upSeconds : null,
      netRxBytesPerSec: Number.isFinite(rxSec) ? rxSec : null,
      netTxBytesPerSec: Number.isFinite(txSec) ? txSec : null
    };
  } catch (error) {
    console.error('Error getting system info:', error);
    const settings = cachedSettings || (await loadUserSettings());
    const showTemp = settings.showTemp !== false;
    const tempUnit = normalizeTempUnit(settings.tempUnit);
    const timezone = resolveTimezone(settings.timezone);
    return {
      time: formatHeaderTime(timezone),
      timezone,
      tempUnit,
      showTemperature: showTemp,
      showTemp,
      temperature: showTemp ? tempUnavailable(tempUnit) : '',
      temperatureC: null,
      temperatureF: null,
      cpuPercent: null,
      memoryPercent: null,
      uptimeSeconds: null,
      netRxBytesPerSec: null,
      netTxBytesPerSec: null
    };
  }
});

ipcMain.handle('get-screen-size', () => {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    width: primaryDisplay.workAreaSize.width,
    height: primaryDisplay.workAreaSize.height
  };
});

// Persistent settings (config/settings.default.json → userData/settings.json)
ipcMain.handle('get-settings', async () => loadUserSettings());

ipcMain.handle('get-platform-defaults', async () => ({
  platform: isRaspberryPi ? 'pi' : 'windows',
  platformLabel: isRaspberryPi ? 'Raspberry Pi' : 'Windows',
  settings: resolvePlatformSettings(await getPlatformDefaultSettings())
}));

ipcMain.handle('reset-settings', async () => {
  cachedSettings = null;
  const defaults = resolvePlatformSettings(await getPlatformDefaultSettings());
  cachedSettings = defaults;
  await fs.mkdir(path.dirname(getUserSettingsPath()), { recursive: true });
  await fs.writeFile(getUserSettingsPath(), JSON.stringify(defaults, null, 2), 'utf8');
  console.log('Reset settings to platform defaults');
  broadcastThemeToAllWindows(defaults.theme);
  broadcastSettingsUpdated();
  await applyShowCursorSetting(defaults.showCursor);
  if (isRaspberryPi) {
    if (defaults.screenBrightness !== undefined) {
      await setDisplayBrightness(defaults.screenBrightness);
    }
    await applyTouchMultitouch(defaults.touchMultitouch);
  }
  if ((isRaspberryPi || isWindows) && defaults.timezone) {
    await setSystemTimezone(defaults.timezone);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    const useFullscreen = isRaspberryPi ? true : Boolean(defaults.fullscreen);
    mainWindow.setFullScreen(useFullscreen);
    if (isRaspberryPi && useFullscreen) {
      mainWindow.setKiosk(true);
    }
  }
  return {
    ok: true,
    platform: isRaspberryPi ? 'pi' : 'windows',
    platformLabel: isRaspberryPi ? 'Raspberry Pi' : 'Windows',
    settings: defaults
  };
});

ipcMain.handle('save-settings', async (event, settings) => {
  if (!settings || typeof settings !== 'object') {
    return { ok: false, reason: 'invalid-settings' };
  }
  const saved = await saveUserSettings(settings);
  return { ok: true, settings: saved };
});

ipcMain.handle('get-timezones', async () => {
  cachedTimezoneOptions = getTimezoneOptions();
  return cachedTimezoneOptions;
});

ipcMain.handle('set-system-timezone', async (_event, timezone) => {
  return setSystemTimezone(timezone);
});

ipcMain.handle('get-system-datetime', async () => getSystemDateTimeState());

ipcMain.handle('set-system-datetime', async (_event, payload) => {
  const date = payload?.date;
  const time = payload?.time;
  return setSystemDateTime(date, time);
});

ipcMain.handle('sync-system-datetime', async () => syncSystemDateTime());

ipcMain.handle('get-settings-path', () => getUserSettingsPath());

ipcMain.handle('get-local-http-origin', () => localWebsiteHttpOrigin);

ipcMain.handle('get-local-network-ip', () => detectPrimaryIPv4());

ipcMain.handle('reapply-show-cursor', async () => {
  const settings = await loadUserSettings();
  await applyShowCursorSetting(settings.showCursor);
  return { ok: true };
});

ipcMain.handle('set-app-theme', async (_event, theme) => {
  const t = normalizeTheme(theme);
  cachedSettings = { ...(cachedSettings || (await loadUserSettings())), theme: t };
  broadcastThemeToAllWindows(t);
  return t;
});

function loadHmiPage(pagePath) {
  const normalized = pagePath.replace(/\\/g, '/');
  const theme = getCurrentTheme();
  mainWindow.loadURL(appendThemeQuery(`qubibyte://local/hmi/${normalized}`, theme));
}

// Navigation handler - track current page
ipcMain.on('navigate', (event, pagePath) => {
  if (mainWindow) {
    currentPage = pagePath;
    loadHmiPage(pagePath);
  }
});

// Go to main menu (not startup)
ipcMain.on('go-to-menu', () => {
  if (mainWindow) {
    currentPage = 'index.html';
    const url = new URL(appendThemeQuery('qubibyte://local/hmi/index.html', getCurrentTheme()));
    url.hash = 'menu';
    mainWindow.loadURL(url.href);
  }
});

// Toggle fullscreen
ipcMain.on('toggle-fullscreen', (event, enable) => {
  if (mainWindow) {
    mainWindow.setFullScreen(enable);
  }
});

// Quit handler
ipcMain.on('quit-app', () => {
  if (mainWindow) {
    mainWindow.close();
  }
  app.quit();
});

// Raspberry Pi onboard LED (activity LED via sysfs — Diagnostics only)
ipcMain.handle('get-onboard-led-state', async () => {
  if (!isRaspberryPi) {
    return { ok: false, reason: 'not-pi', on: false };
  }
  const base = await resolveLedPath();
  if (!base) {
    return { ok: false, reason: 'no-led', on: false };
  }
  const on = await readOnboardLedFromHardware(base);
  if (on === null) {
    return { ok: false, reason: 'read-failed', on: onboardLedOn };
  }
  onboardLedOn = on;
  return { ok: true, on };
});

ipcMain.handle('set-onboard-led', async (_event, on) => {
  if (!isRaspberryPi) {
    return { ok: false, reason: 'not-pi' };
  }
  return applyOnboardLed(Boolean(on));
});

ipcMain.handle('toggle-onboard-led', async () => {
  if (!isRaspberryPi) {
    return { ok: false, reason: 'not-pi' };
  }
  return toggleOnboardLed();
});

// Raspberry Pi official touch display backlight (/sys/class/backlight/*-0045)
ipcMain.handle('get-display-brightness', async () => getDisplayBrightnessState());

ipcMain.handle('set-display-brightness', async (_event, level) => {
  if (!isRaspberryPi) {
    return {
      ok: false,
      reason: 'not-pi',
      level: normalizeSavedBrightness(level, BRIGHTNESS_UI_MAX)
    };
  }
  return setDisplayBrightness(level);
});
