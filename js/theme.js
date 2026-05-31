/**
 * Qubibyte HMI — shared theme loader (run from <head> on every page)
 */
(function () {
    const STORAGE_KEY = 'qubibyte-theme';
    const THEMES = ['dark', 'light', 'midnight', 'quantum'];

    const LEGACY_INLINE_PROPS = [
        '--bg-primary', '--bg-secondary', '--bg-tertiary', '--bg-card',
        '--text-primary', '--text-secondary', '--text-muted',
        '--accent-blue', '--accent-purple', '--border-color'
    ];

    const PAINT = {
        dark: { bg: '#0a0a0f', fg: '#ffffff', scheme: 'dark' },
        light: { bg: '#f0f0f5', fg: '#1a1a2e', scheme: 'light' },
        midnight: { bg: '#0f172a', fg: '#e2e8f0', scheme: 'dark' },
        quantum: { bg: '#1a0a25', fg: '#f5f0ff', scheme: 'dark' }
    };

    function paintCriticalBackground(theme) {
        const paint = PAINT[theme] || PAINT.dark;
        const root = document.documentElement;
        root.style.backgroundColor = paint.bg;
        root.style.color = paint.fg;
        root.style.colorScheme = paint.scheme;

        let el = document.getElementById('qubibyte-theme-critical');
        if (!el) {
            el = document.createElement('style');
            el.id = 'qubibyte-theme-critical';
            document.head.appendChild(el);
        }
        el.textContent =
            `html,body{background:${paint.bg}!important;color:${paint.fg}!important}` +
            `html{color-scheme:${paint.scheme}!important}`;
    }

    let persistThemeTimer = null;

    function syncThemeToSettingsCache(theme) {
        if (!THEMES.includes(theme)) return;
        try {
            const raw = localStorage.getItem('qubibyte-settings');
            const settings = raw ? JSON.parse(raw) : {};
            if (settings.theme !== theme) {
                settings.theme = theme;
                localStorage.setItem('qubibyte-settings', JSON.stringify(settings));
            }
        } catch {
            /* ignore */
        }
    }

    function schedulePersistTheme(theme) {
        syncThemeToSettingsCache(theme);
        if (!window.electronAPI?.saveSettings) return;
        clearTimeout(persistThemeTimer);
        persistThemeTimer = setTimeout(() => {
            window.electronAPI.saveSettings({ theme }).catch(() => {});
        }, 400);
    }

    /** Theme changed inside embedded QubibyteWebsite (iframe) — sync HMI shell + disk. */
    function syncThemeFromWebsite(theme) {
        const t = THEMES.includes(theme) ? theme : null;
        if (!t || t === document.documentElement.dataset.theme) return;

        applyTheme(t, { silent: true });
        if (window.electronAPI?.setAppTheme) {
            window.electronAPI.setAppTheme(t).catch(() => {});
        }
        schedulePersistTheme(t);
    }

    function updateThemeLogos(theme) {
        const file = theme === 'light' ? 'logo.png' : 'logo_white.png';
        document.querySelectorAll('img[data-qubibyte-logo]').forEach((img) => {
            const src = img.getAttribute('src') || '';
            const base = src.replace(/[^/]+$/, '');
            img.setAttribute('src', base + file);
        });
    }

    function scheduleThemeLogos(theme) {
        const run = () => updateThemeLogos(theme);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run, { once: true });
        } else {
            run();
        }
    }

    function applyTheme(theme, options) {
        const t = THEMES.includes(theme) ? theme : 'dark';
        const silent = options && options.silent === true;
        document.documentElement.dataset.theme = t;
        window.QUBIBYTE_THEME = t;
        paintCriticalBackground(t);
        scheduleThemeLogos(t);

        LEGACY_INLINE_PROPS.forEach((prop) => {
            document.documentElement.style.removeProperty(prop);
        });

        try {
            localStorage.setItem(STORAGE_KEY, t);
            syncThemeToSettingsCache(t);
        } catch (e) {
            /* ignore */
        }

        try {
            window.dispatchEvent(new CustomEvent('qubibyte-theme-change', { detail: { theme: t } }));
        } catch (e) {
            /* ignore */
        }

        if (!silent && window.electronAPI?.setAppTheme) {
            window.electronAPI.setAppTheme(t).catch(() => {});
        }

        return t;
    }

    function getTheme() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return THEMES.includes(saved) ? saved : 'dark';
        } catch (e) {
            return 'dark';
        }
    }

    function resolveThemeWithDisk(diskTheme) {
        const cached = getTheme();
        const disk = THEMES.includes(diskTheme) ? diskTheme : null;

        if (THEMES.includes(cached)) {
            if (disk && cached !== disk) {
                schedulePersistTheme(cached);
            }
            return cached;
        }
        if (disk) return disk;
        return 'dark';
    }

    async function hydrateThemeFromDisk() {
        let diskTheme = null;

        if (window.electronAPI?.getSettings) {
            try {
                const settings = await window.electronAPI.getSettings();
                diskTheme = settings?.theme;
            } catch (e) {
                console.error('Could not load theme from settings file:', e);
            }
        }

        const resolved = resolveThemeWithDisk(diskTheme);
        applyTheme(resolved, { silent: true });
        return resolved;
    }

    // Apply cached theme immediately, then merge from disk when Electron is ready
    applyTheme(getTheme());

    function runDiskHydration() {
        hydrateThemeFromDisk().catch(() => {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runDiskHydration);
    } else {
        runDiskHydration();
    }

    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && e.newValue) {
            syncThemeFromWebsite(e.newValue);
        }
    });

    window.addEventListener('message', (e) => {
        const data = e.data;
        if (!data || data.type !== 'qubibyte-theme' || !data.theme) return;
        syncThemeFromWebsite(data.theme);
    });

    function readAppSettings() {
        try {
            const raw = localStorage.getItem('qubibyte-settings');
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    function readTempUnitFromStorage() {
        return readAppSettings().tempUnit === 'C' ? 'C' : 'F';
    }

    function readTimezoneFromStorage() {
        const settings = readAppSettings();
        const tz = typeof settings.timezone === 'string' ? settings.timezone.trim() : '';
        if (tz) {
            try {
                Intl.DateTimeFormat(undefined, { timeZone: tz });
                return tz;
            } catch {
                /* fall through */
            }
        }
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
            return 'UTC';
        }
    }

    function tempUnavailable(unit) {
        return unit === 'C' ? 'N/A°C' : 'N/A°F';
    }

    function formatHeaderTemperature(info) {
        const unit = (info && info.tempUnit) || readTempUnitFromStorage();
        if (info?.temperatureC != null && Number.isFinite(info.temperatureC)) {
            if (unit === 'C') return `${info.temperatureC.toFixed(1)}°C`;
            const f = info.temperatureF != null && Number.isFinite(info.temperatureF)
                ? info.temperatureF
                : (info.temperatureC * 9) / 5 + 32;
            return `${f.toFixed(1)}°F`;
        }
        const raw = typeof info?.temperature === 'string' ? info.temperature.trim() : '';
        if (raw && !isPlaceholderTemp(raw)) return raw;
        return tempUnavailable(unit);
    }

    function localTimeString(timezone) {
        const tz = timezone || readTimezoneFromStorage();
        return new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: tz
        });
    }

    function headerTimeFromInfo(info) {
        if (info && info.time) return info.time;
        const tz = (info && info.timezone) || readTimezoneFromStorage();
        return localTimeString(tz);
    }

    function readShowTempFromStorage() {
        return readAppSettings().showTemp !== false;
    }

    function resolveShowTemperature(info) {
        if (info && (info.showTemperature === false || info.showTemp === false)) {
            return false;
        }
        if (info && (info.showTemperature === true || info.showTemp === true)) {
            return true;
        }
        return readShowTempFromStorage();
    }

    const HEADER_CACHE_KEY = 'qubibyte-header-cache';
    let lastHeaderInfo = null;

    function loadHeaderCache() {
        try {
            const raw = sessionStorage.getItem(HEADER_CACHE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                lastHeaderInfo = parsed;
            }
        } catch {
            /* ignore */
        }
    }

    function saveHeaderCache() {
        if (!lastHeaderInfo) return;
        try {
            sessionStorage.setItem(HEADER_CACHE_KEY, JSON.stringify(lastHeaderInfo));
        } catch {
            /* ignore */
        }
    }

    function isPlaceholderTemp(temp) {
        const t = (temp || '').trim();
        return t === '…' || t === '...';
    }

    function rememberHeaderInfo(info) {
        if (!info) return;
        const showTemperature = resolveShowTemperature(info);
        const formatted = showTemperature ? formatHeaderTemperature(info) : '';
        if (showTemperature && isPlaceholderTemp(formatted) && info.temperatureC == null) return;

        lastHeaderInfo = {
            showTemperature,
            showTemp: showTemperature,
            temperature: showTemperature ? formatHeaderTemperature(info) : '',
            temperatureC: info.temperatureC ?? null,
            temperatureF: info.temperatureF ?? null,
            tempUnit: info.tempUnit || readTempUnitFromStorage(),
            timezone: info.timezone || readTimezoneFromStorage()
        };
        saveHeaderCache();
    }

    function ensureHeaderSpans(el) {
        let tempEl = el.querySelector('.header-temp');
        let timeEl = el.querySelector('.header-time');
        if (!timeEl) {
            el.replaceChildren();
            tempEl = document.createElement('span');
            tempEl.className = 'header-temp';
            timeEl = document.createElement('span');
            timeEl.className = 'header-time';
            el.append(tempEl, timeEl);
        } else if (!tempEl) {
            tempEl = document.createElement('span');
            tempEl.className = 'header-temp';
            el.insertBefore(tempEl, timeEl);
        }
        return { tempEl, timeEl };
    }

    function readHeaderFromEl(el) {
        const timeEl = el.querySelector('.header-time');
        if (timeEl) {
            const tempEl = el.querySelector('.header-temp');
            const tempText = tempEl && tempEl.style.display !== 'none'
                ? tempEl.textContent.trim()
                : '';
            return {
                temp: isPlaceholderTemp(tempText) ? '' : tempText,
                time: timeEl.textContent.trim() || localTimeString()
            };
        }
        const trimmed = (el.textContent || '').trim();
        const parts = trimmed.split(/\s{2,}/);
        if (parts.length >= 2) {
            const temp = parts[0].trim();
            return {
                temp: isPlaceholderTemp(temp) ? '' : temp,
                time: parts[parts.length - 1].trim()
            };
        }
        return { temp: '', time: trimmed || localTimeString() };
    }

    function applySystemInfo(el, info) {
        if (!el) return;

        const showTemperature = resolveShowTemperature(info);
        const { tempEl, timeEl } = ensureHeaderSpans(el);
        const merged = {
            ...info,
            tempUnit: info?.tempUnit || readTempUnitFromStorage(),
            timezone: info?.timezone || readTimezoneFromStorage()
        };

        el.style.removeProperty('display');
        timeEl.textContent = headerTimeFromInfo(merged);

        if (showTemperature) {
            tempEl.textContent = formatHeaderTemperature(merged);
            tempEl.style.display = '';
        } else {
            tempEl.textContent = '';
            tempEl.style.display = 'none';
        }

        rememberHeaderInfo(merged);
    }

    function applyHeaderInfoImmediate(showTemp) {
        const showTemperature = showTemp !== false;
        const tempUnit = readTempUnitFromStorage();
        const timezone = readTimezoneFromStorage();
        document.querySelectorAll('.system-info').forEach((el) => {
            const { temp, time } = readHeaderFromEl(el);
            const info = {
                time,
                timezone,
                tempUnit,
                showTemperature,
                showTemp: showTemperature,
                temperature: showTemperature ? temp : ''
            };
            if (lastHeaderInfo) {
                info.temperatureC = lastHeaderInfo.temperatureC;
                info.temperatureF = lastHeaderInfo.temperatureF;
            }
            applySystemInfo(el, info);
        });
    }

    function paintHeaderInstant() {
        const showTemperature = readShowTempFromStorage();
        const tempUnit = readTempUnitFromStorage();
        const timezone = readTimezoneFromStorage();
        const info = {
            time: localTimeString(timezone),
            timezone,
            tempUnit,
            showTemperature,
            showTemp: showTemperature
        };

        if (showTemperature) {
            if (lastHeaderInfo && lastHeaderInfo.showTemperature) {
                info.temperatureC = lastHeaderInfo.temperatureC;
                info.temperatureF = lastHeaderInfo.temperatureF;
                info.temperature = formatHeaderTemperature({
                    ...lastHeaderInfo,
                    tempUnit
                });
            } else {
                info.temperature = tempUnavailable(tempUnit);
            }
        }

        document.querySelectorAll('.system-info').forEach((el) => applySystemInfo(el, info));
    }

    let headerRefreshChain = Promise.resolve();
    let headerIntervalStarted = false;

    function refreshHeaderInfo() {
        const run = async () => {
            const els = [...document.querySelectorAll('.system-info')];
            if (!els.length) return;

            const fetchInfo = window.electronAPI?.getHeaderInfo || window.electronAPI?.getSystemInfo;

            if (!fetchInfo) {
                const showTemperature = readShowTempFromStorage();
                const tempUnit = readTempUnitFromStorage();
                const timezone = readTimezoneFromStorage();
                const fallback = {
                    time: localTimeString(timezone),
                    timezone,
                    tempUnit,
                    showTemperature,
                    showTemp: showTemperature,
                    temperature: showTemperature ? tempUnavailable(tempUnit) : ''
                };
                els.forEach((el) => applySystemInfo(el, fallback));
                return;
            }

            try {
                const info = await fetchInfo();
                els.forEach((el) => applySystemInfo(el, info));
            } catch (e) {
                console.error('Header info refresh failed:', e);
                paintHeaderInstant();
            }
        };

        headerRefreshChain = headerRefreshChain.then(run, run);
        return headerRefreshChain;
    }

    function setupHeaderInfo() {
        paintHeaderInstant();
        refreshHeaderInfo();
        if (!headerIntervalStarted) {
            headerIntervalStarted = true;
            setInterval(refreshHeaderInfo, 5000);
        }
    }

    window.applySystemInfo = applySystemInfo;
    window.applyHeaderInfoImmediate = applyHeaderInfoImmediate;
    window.refreshHeaderInfo = refreshHeaderInfo;
    window.refreshSystemInfo = refreshHeaderInfo;
    window.setupHeaderInfo = setupHeaderInfo;

    if (window.electronAPI?.onSettingsUpdated) {
        window.electronAPI.onSettingsUpdated(() => {
            refreshHeaderInfo();
        });
    }

    function bootHeaderInfo() {
        if (document.querySelector('.system-info')) {
            setupHeaderInfo();
        }
    }

    loadHeaderCache();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootHeaderInfo, { once: true });
    } else {
        bootHeaderInfo();
    }

    window.QubibyteTheme = {
        apply: applyTheme,
        get: getTheme,
        themes: THEMES,
        hydrateFromDisk: hydrateThemeFromDisk
    };

    (function loadOnScreenKeyboard() {
        if (document.querySelector('script[data-qubibyte-osk-loader]')) return;
        const ref = [...document.querySelectorAll('script[src]')].find((s) => /theme\.js/.test(s.src));
        const src = ref
            ? ref.src.replace(/theme\.js(?:\?.*)?$/, 'on-screen-keyboard.js')
            : 'js/on-screen-keyboard.js';
        const s = document.createElement('script');
        s.src = src;
        s.defer = true;
        s.dataset.qubibyteOskLoader = '1';
        document.head.appendChild(s);
    })();
})();
