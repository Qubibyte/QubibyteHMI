const { app, BrowserWindow, ipcMain, protocol, net, session, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs').promises;
const fsSync = require('fs');
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
  animationSpeed: '1',
  gpuAccel: true,
  autoStart: false,
  hwIp: '192.168.1.100',
  hwPort: '8080'
};

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
    const defaults = await loadBundledDefaults();
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
    cachedSettings = { ...(await loadBundledDefaults()), ...JSON.parse(raw) };
  } catch (error) {
    console.error('Error reading user settings, using defaults:', error);
    cachedSettings = await loadBundledDefaults();
  }

  return cachedSettings;
}

async function saveUserSettings(settings) {
  const merged = { ...(await loadUserSettings()), ...settings };
  cachedSettings = merged;
  await fs.mkdir(path.dirname(getUserSettingsPath()), { recursive: true });
  await fs.writeFile(getUserSettingsPath(), JSON.stringify(merged, null, 2), 'utf8');
  console.log(`Saved user settings: ${getUserSettingsPath()}`);
  broadcastThemeToAllWindows(merged.theme);
  return merged;
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
    for (const preferred of LED_NAME_PRIORITY) {
      const match = entries.find((name) => name.toUpperCase() === preferred.toUpperCase());
      if (match) {
        ledBasePath = `/sys/class/leds/${match}`;
        return ledBasePath;
      }
    }
    const act = entries.find((name) => /act/i.test(name));
    if (act) {
      ledBasePath = `/sys/class/leds/${act}`;
      return ledBasePath;
    }
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
    onboardLedOn = on;
    console.log(`Onboard LED ${on ? 'on' : 'off'} (${base}, brightness ${brightness})`);
    return { ok: true, on };
  } catch (error) {
    console.error('Failed to set onboard LED:', error);
    return { ok: false, reason: error.message };
  }
}

async function ensureOnboardLedOff() {
  if (!isRaspberryPi) return;
  const result = await applyOnboardLed(false);
  if (!result.ok) {
    console.warn('Could not initialize onboard LED to off:', result.reason);
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

    // Hide cursor in fullscreen/kiosk mode (all platforms)
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.insertCSS('* { cursor: none !important; }');
    });

    console.log(`Screen dimensions: ${width} x ${height} (fullscreen mode)`);
  }

  mainWindow.loadURL(appendThemeQuery('qubibyte://local/hmi/index.html', getCurrentTheme()));

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

const TEMP_UNAVAILABLE = 'N/A°F';
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

// IPC handlers for system information
ipcMain.handle('get-system-info', async () => {
  try {
    // Use 12-hour format with AM/PM
    const time = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const showTemp = cachedSettings?.showTemp !== false;

    let tempStr = showTemp ? TEMP_UNAVAILABLE : '';
    let tempCValue = null;
    let tempFValue = null;
    let tempValid = false;

    // Raspberry Pi: Use direct file reading (more reliable on Pi)
    if (isRaspberryPi) {
      try {
        const tempData = await fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
        const tempC = parseInt(tempData.trim(), 10) / 1000;
        if (isReasonableTempC(tempC)) {
          const tempF = (tempC * 9 / 5) + 32;
          tempCValue = tempC;
          tempFValue = tempF;
          tempStr = showTemp ? `${tempF.toFixed(1)}°F` : '';
          tempValid = true;
        }
      } catch (fileError) {
        console.error('Error reading Raspberry Pi thermal file:', fileError);
      }
    }
    // Windows/Mac/Other Linux: Use systeminformation package
    else {
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
          tempStr = showTemp ? `${tempF.toFixed(1)}°F` : '';
          tempValid = true;
        }
      } catch (siError) {
        console.error('Error getting temperature:', siError);
      }
    }

    if (!tempValid) tempStr = showTemp ? TEMP_UNAVAILABLE : '';

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
      temperature: tempStr,
      temperatureC: tempCValue,
      temperatureF: tempFValue,
      cpuPercent: Number.isFinite(cpuPct) ? cpuPct : null,
      memoryPercent: Number.isFinite(memPct) ? memPct : null,
      uptimeSeconds: Number.isFinite(upSeconds) ? upSeconds : null,
      netRxBytesPerSec: Number.isFinite(rxSec) ? rxSec : null,
      netTxBytesPerSec: Number.isFinite(txSec) ? txSec : null
    };
  } catch (error) {
    console.error('Error getting system info:', error);
    const time = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return {
      time,
      temperature: cachedSettings?.showTemp === false ? '' : TEMP_UNAVAILABLE,
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

ipcMain.handle('save-settings', async (event, settings) => {
  if (!settings || typeof settings !== 'object') {
    return { ok: false, reason: 'invalid-settings' };
  }
  const saved = await saveUserSettings(settings);
  return { ok: true, settings: saved };
});

ipcMain.handle('get-settings-path', () => getUserSettingsPath());

ipcMain.handle('get-local-http-origin', () => localWebsiteHttpOrigin);

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
  return { ok: true, on: onboardLedOn };
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
  return applyOnboardLed(!onboardLedOn);
});
