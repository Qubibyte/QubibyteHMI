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

    function schedulePersistTheme(theme) {
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

    async function hydrateThemeFromDisk() {
        if (!window.electronAPI?.getSettings) return getTheme();

        try {
            const settings = await window.electronAPI.getSettings();
            if (settings?.theme && THEMES.includes(settings.theme)) {
                applyTheme(settings.theme);
                return settings.theme;
            }
        } catch (e) {
            console.error('Could not load theme from settings file:', e);
        }
        return getTheme();
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

    function applySystemInfo(el, info) {
        if (!el) return;
        const time = info?.time ?? '';
        if (!info?.temperature) {
            el.textContent = time;
            return;
        }
        el.replaceChildren();
        const tempSpan = document.createElement('span');
        tempSpan.className = 'system-info-temp';
        tempSpan.textContent = info.temperature;
        const timeSpan = document.createElement('span');
        timeSpan.className = 'system-info-time';
        timeSpan.textContent = time;
        el.appendChild(tempSpan);
        el.appendChild(timeSpan);
    }

    window.applySystemInfo = applySystemInfo;

    window.QubibyteTheme = {
        apply: applyTheme,
        get: getTheme,
        themes: THEMES,
        hydrateFromDisk: hydrateThemeFromDisk
    };
})();
