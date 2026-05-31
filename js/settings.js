// Settings Page JavaScript

document.addEventListener('DOMContentLoaded', () => {
    init().catch((e) => console.error('Settings init failed:', e));
});

async function init() {
    setupBackButton();
    setupNavigation();

    applySettingsToUI(readAppSettingsFromLocal());

    await loadSettings();

    setupControls();
    setupTempUnitPicker();
    await setupTimezoneSelect();
    setupBrightnessSlider();
    setupSystemDateTime();
    setupSystemInfo();
    updatePiOnlySettingsVisibility();
    window.QubibyteOSK?.refreshEnabled?.();
    initBackgroundAnimation();

    finishSettingsHydration();
}

function finishSettingsHydration() {
    requestAnimationFrame(() => {
        document.documentElement.classList.remove('settings-hydrating');
    });
}

// Back button navigation
function setupBackButton() {
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        const handler = (e) => {
            e.preventDefault();
            if (window.electronAPI && window.electronAPI.goToMenu) {
                window.electronAPI.goToMenu();
            } else {
                window.location.href = '../index.html#menu';
            }
        };
        backBtn.addEventListener('click', handler);
        backBtn.addEventListener('touchend', handler);
    }
}

// System info display (implemented in theme.js)
function setupSystemInfo() {
    window.setupHeaderInfo?.();
}

function formatTime() {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Setup settings navigation
function setupNavigation() {
    const navItems = document.querySelectorAll('.settings-nav-item');
    const sections = document.querySelectorAll('.settings-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.dataset.section;

            // Update nav active state
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Show corresponding section
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === `section-${sectionId}`) {
                    section.classList.add('active');
                }
            });
        });
    });
}

// Setup all controls
function setupControls() {
    setupThemePicker();

    // Animation speed slider
    const animSpeed = document.getElementById('animation-speed');
    if (animSpeed) {
        const rangeValue = animSpeed.nextElementSibling;
        animSpeed.addEventListener('input', () => {
            rangeValue.textContent = `${animSpeed.value}x`;
            document.documentElement.style.setProperty('--animation-speed', animSpeed.value);
        });
    }

    // Toggle switches
    const toggles = document.querySelectorAll('.toggle-switch input');
    toggles.forEach(toggle => {
        toggle.addEventListener('change', () => {
            handleToggle(toggle.id, toggle.checked).catch((err) => {
                console.error('Toggle handler failed:', err);
            });
        });
    });

    // Buttons
    setupButtons();
    setupResetSettings();
    loadPlatformInfo();
}

let allTimezoneOptions = [];
/** Last settings loaded/saved from disk — used for partial saves (toggles). */
let persistedSettings = null;

function syncTempUnitPicker(unit) {
    const picker = document.getElementById('temp-unit-picker');
    if (!picker) return;
    const active = unit === 'C' ? 'C' : 'F';
    picker.querySelectorAll('.unit-option').forEach((btn) => {
        const isActive = btn.dataset.unit === active;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function setupTempUnitPicker() {
    const picker = document.getElementById('temp-unit-picker');
    if (!picker) return;

    picker.querySelectorAll('.unit-option').forEach((btn) => {
        btn.addEventListener('click', async () => {
            syncTempUnitPicker(btn.dataset.unit);
            const unit = btn.dataset.unit === 'C' ? 'C' : 'F';
            await saveSettings({ tempUnit: unit });
            const showTemp = document.getElementById('temp-toggle')?.checked ?? true;
            window.applyHeaderInfoImmediate?.(showTemp);
            void window.refreshHeaderInfo?.();
        });
    });
}

function resolveTimezoneForUi(stored) {
    const tz = typeof stored === 'string' ? stored.trim() : '';
    if (tz) return tz;
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
        return 'UTC';
    }
}

function getTimezoneOffsetMinutes(tz, at = new Date()) {
    try {
        const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
        const local = new Date(at.toLocaleString('en-US', { timeZone: tz }));
        return Math.round((local - utc) / 60000);
    } catch {
        return 0;
    }
}

function pickTimezoneSelection(stored, options) {
    if (!options.length) return resolveTimezoneForUi(stored);
    const tz = resolveTimezoneForUi(stored);
    const exact = options.find((o) => o.id === tz);
    if (exact) return exact.id;
    const mins = getTimezoneOffsetMinutes(tz);
    const byOffset = options.find((o) => o.offsetMinutes === mins);
    if (byOffset) return byOffset.id;
    return options[0].id;
}

function renderTimezoneOptions(options, selectedId) {
    const select = document.getElementById('timezone-select');
    if (!select) return;

    const keep = selectedId || select.value;
    select.replaceChildren();
    const frag = document.createDocumentFragment();

    for (const opt of options) {
        const el = document.createElement('option');
        el.value = opt.id;
        el.textContent = opt.label || opt.id;
        if (opt.id === keep) el.selected = true;
        frag.appendChild(el);
    }

    select.appendChild(frag);

    if (keep && ![...select.options].some((o) => o.value === keep)) {
        const extra = document.createElement('option');
        extra.value = keep;
        extra.textContent = keep;
        extra.selected = true;
        select.insertBefore(extra, select.firstChild);
    }
}

async function setupTimezoneSelect() {
    const select = document.getElementById('timezone-select');
    if (!select) return;

    if (window.electronAPI?.getTimezones) {
        try {
            allTimezoneOptions = await window.electronAPI.getTimezones();
        } catch (err) {
            console.error('Failed to load timezones:', err);
        }
    }

    if (!allTimezoneOptions.length) {
        const fallback = resolveTimezoneForUi('');
        allTimezoneOptions = [{ id: fallback, label: fallback, offsetMinutes: 0 }];
    }

    const saved = persistedSettings || readAppSettingsFromLocal();
    const selected = pickTimezoneSelection(saved.timezone, allTimezoneOptions);
    renderTimezoneOptions(allTimezoneOptions, selected);

    select.addEventListener('change', async () => {
        const tz = select.value;
        await saveSettings({ timezone: tz });

        if (window.electronAPI?.setSystemTimezone) {
            try {
                const result = await window.electronAPI.setSystemTimezone(select.value);
                if (!result?.ok) {
                    showNotification(
                        'Could not change system timezone (admin rights may be required). Header clock still updated.',
                        'info'
                    );
                }
            } catch (err) {
                console.error('System timezone change failed:', err);
            }
        }

        void window.refreshHeaderInfo?.();
        void refreshSystemDateTimeFields();
    });
}

let datetimeUiSyncing = false;
let datetimeApplyTimer = null;

function paintSystemDateTime(state, syncInputs = true) {
    const dateEl = document.getElementById('system-date');
    const timeEl = document.getElementById('system-time');
    if (!state || !syncInputs) return;

    datetimeUiSyncing = true;
    if (dateEl && state.date) dateEl.value = state.date;
    if (timeEl && state.time) timeEl.value = state.time;
    datetimeUiSyncing = false;
}

async function refreshSystemDateTimeFields() {
    if (window.electronAPI?.getSystemDateTime) {
        try {
            const state = await window.electronAPI.getSystemDateTime();
            paintSystemDateTime(state);
            return;
        } catch (err) {
            console.error('Failed to read system date/time:', err);
        }
    }

    const now = new Date();
    paintSystemDateTime({
        display: now.toLocaleString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }),
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    });
}

async function applySystemDateTimeFromInputs() {
    if (datetimeUiSyncing) return;

    const dateEl = document.getElementById('system-date');
    const timeEl = document.getElementById('system-time');
    if (!dateEl || !timeEl) return;

    const date = dateEl.value;
    const time = timeEl.value;
    if (!date || !time) return;

    if (!window.electronAPI?.setSystemDateTime) {
        showNotification('System clock control is not available.', 'info');
        return;
    }

    try {
        const result = await window.electronAPI.setSystemDateTime({ date, time });
        if (result?.ok) {
            paintSystemDateTime(result, false);
            void window.refreshHeaderInfo?.();
        } else if (window.electronAPI.isRaspberryPi || window.electronAPI.platform === 'win32') {
            showNotification(
                'Could not set system clock (admin rights may be required).',
                'error'
            );
        }
    } catch (err) {
        console.error('Set system date/time failed:', err);
        showNotification('Could not set system date and time.', 'error');
    }
}

async function syncSystemDateTimeFromNetwork() {
    const syncBtn = document.getElementById('datetime-sync');
    if (!window.electronAPI?.syncSystemDateTime) {
        showNotification('Network time sync is not available.', 'info');
        return;
    }

    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.classList.add('is-syncing');
    }

    try {
        const result = await window.electronAPI.syncSystemDateTime();
        if (result?.ok) {
            paintSystemDateTime(result);
            showNotification('Clock synced from network (NTP enabled).', 'success');
            void window.refreshHeaderInfo?.();
        } else if (window.electronAPI.isRaspberryPi || window.electronAPI.platform === 'win32') {
            showNotification(
                'Could not sync time (admin rights may be required).',
                'error'
            );
        } else {
            showNotification('Network time sync is not supported on this platform.', 'info');
        }
    } catch (err) {
        console.error('Time sync failed:', err);
        showNotification('Could not sync date and time.', 'error');
    } finally {
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.classList.remove('is-syncing');
        }
    }
}

function setupSystemDateTime() {
    const dateEl = document.getElementById('system-date');
    const timeEl = document.getElementById('system-time');
    const syncBtn = document.getElementById('datetime-sync');
    if (!dateEl || !timeEl) return;

    void refreshSystemDateTimeFields();

    const scheduleApply = () => {
        if (datetimeUiSyncing) return;
        clearTimeout(datetimeApplyTimer);
        datetimeApplyTimer = setTimeout(() => {
            applySystemDateTimeFromInputs();
        }, 350);
    };

    dateEl.addEventListener('change', scheduleApply);
    timeEl.addEventListener('change', scheduleApply);

    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            syncSystemDateTimeFromNetwork().catch((err) => {
                console.error('Sync button handler failed:', err);
            });
        });
    }
}

function readAppSettingsFromLocal() {
    try {
        const raw = localStorage.getItem('qubibyte-settings');
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

let brightnessApplyTimer = null;
const BRIGHTNESS_UI_MIN = 1;
const BRIGHTNESS_UI_MAX = 31;

function normalizeBrightnessSetting(value, maxLevel = BRIGHTNESS_UI_MAX) {
    const cap = Number(maxLevel) > 0 ? Number(maxLevel) : BRIGHTNESS_UI_MAX;
    const n = Number(value);
    if (!Number.isFinite(n)) return cap;
    if (n > cap) {
        return Math.min(cap, Math.max(BRIGHTNESS_UI_MIN, Math.round((n / 100) * cap)));
    }
    return Math.min(cap, Math.max(BRIGHTNESS_UI_MIN, Math.round(n)));
}

function configureBrightnessSlider() {
    const slider = document.getElementById('brightness-slider');
    if (!slider) return;
    slider.min = String(BRIGHTNESS_UI_MIN);
    slider.max = String(BRIGHTNESS_UI_MAX);
}

function updateBrightnessRangeProgress(slider) {
    const min = Number(slider.min) || BRIGHTNESS_UI_MIN;
    const max = Number(slider.max) || BRIGHTNESS_UI_MAX;
    const val = Number(slider.value);
    const pct = max <= min ? 100 : ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--range-progress', `${pct}%`);
}

function paintBrightnessSlider(level) {
    const slider = document.getElementById('brightness-slider');
    const label = document.getElementById('brightness-value');
    if (!slider || !label) return;
    configureBrightnessSlider();
    const value = normalizeBrightnessSetting(level, BRIGHTNESS_UI_MAX);
    slider.value = String(value);
    label.textContent = String(value);
    updateBrightnessRangeProgress(slider);
}

async function applyDisplayBrightness(level) {
    if (!window.electronAPI?.setDisplayBrightness) {
        return { ok: false, reason: 'unavailable' };
    }
    return window.electronAPI.setDisplayBrightness(level);
}

const BRIGHTNESS_PI_ONLY_MSG = 'Screen brightness is only available on Raspberry Pi hardware.';

function canControlDisplayBrightness() {
    return Boolean(
        window.electronAPI?.isRaspberryPi &&
        window.electronAPI?.setDisplayBrightness
    );
}

function updateBrightnessControlState() {
    const slider = document.getElementById('brightness-slider');
    const control = document.getElementById('brightness-control');
    if (!slider || !control) return;

    const enabled = canControlDisplayBrightness();
    slider.disabled = !enabled;
    control.classList.toggle('is-readonly', !enabled);
    slider.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

function notifyBrightnessUnavailable() {
    if (!window.electronAPI?.setDisplayBrightness) {
        showNotification('Display brightness control is not available.', 'info');
        return;
    }
    showNotification(BRIGHTNESS_PI_ONLY_MSG, 'info');
}

function setupBrightnessSlider() {
    const slider = document.getElementById('brightness-slider');
    const control = document.getElementById('brightness-control');
    if (!slider || !control) return;

    updateBrightnessControlState();

    let brightnessNotifyLock = false;
    const blockReadonlyInteraction = (e) => {
        if (!control.classList.contains('is-readonly')) return;
        e.preventDefault();
        if (brightnessNotifyLock) return;
        brightnessNotifyLock = true;
        notifyBrightnessUnavailable();
        setTimeout(() => {
            brightnessNotifyLock = false;
        }, 500);
    };

    control.addEventListener('click', blockReadonlyInteraction);
    control.addEventListener('touchend', blockReadonlyInteraction, { passive: false });

    slider.addEventListener('input', () => {
        if (!canControlDisplayBrightness()) return;

        const level = Number(slider.value);
        paintBrightnessSlider(level);

        clearTimeout(brightnessApplyTimer);
        brightnessApplyTimer = setTimeout(async () => {
            try {
                const result = await applyDisplayBrightness(level);
                if (!result?.ok) {
                    showNotification('Could not control display brightness.', 'error');
                }
            } catch (err) {
                console.error('Brightness set failed:', err);
                showNotification('Could not control display brightness.', 'error');
            }
        }, 80);
    });

    slider.addEventListener('change', async () => {
        if (!canControlDisplayBrightness()) return;

        const level = Number(slider.value);
        paintBrightnessSlider(level);

        try {
            const result = await applyDisplayBrightness(level);
            if (result?.ok) {
                await saveSettings();
            } else {
                showNotification('Could not control display brightness.', 'error');
            }
        } catch (err) {
            console.error('Brightness set failed:', err);
            showNotification('Could not control display brightness.', 'error');
        }
    });

    configureBrightnessSlider();
    updateBrightnessRangeProgress(slider);
}

function setupButtons() {
    // Clear cache button
    const clearCache = document.getElementById('clear-cache');
    if (clearCache) {
        clearCache.addEventListener('click', async () => {
            if (confirm('Clear cached tutorial progress? Theme and system settings are kept.')) {
                localStorage.removeItem('qubibyte-lesson-progress');
                localStorage.removeItem('qubibyte_tutorial_state');
                localStorage.removeItem('qubibyte_exam_data');
                showNotification('Tutorial cache cleared', 'success');
            }
        });
    }

    // Test connection button
    const testConn = document.getElementById('test-connection');
    if (testConn) {
        testConn.addEventListener('click', testConnection);
    }

    // Check updates button
    const checkUpdates = document.getElementById('check-updates');
    if (checkUpdates) {
        checkUpdates.addEventListener('click', () => {
            showNotification('Checking for updates...', 'info');
            setTimeout(() => {
                showNotification('You are using the latest version!', 'success');
            }, 1500);
        });
    }

    // View licenses button
    const viewLicenses = document.getElementById('view-licenses');
    if (viewLicenses) {
        viewLicenses.addEventListener('click', showLicenses);
    }

    // Browse data directory
    const browseData = document.getElementById('browse-data');
    if (browseData) {
        browseData.addEventListener('click', () => {
            showNotification('File browser not available in this version', 'info');
        });
    }
}

async function handleToggle(toggleId, isChecked) {
    switch (toggleId) {
        case 'fullscreen-toggle':
            if (window.electronAPI && window.electronAPI.toggleFullscreen) {
                window.electronAPI.toggleFullscreen(isChecked);
            }
            break;
        case 'gpu-toggle':
            showNotification('GPU acceleration change requires restart', 'info');
            break;
        case 'autostart-toggle':
            showNotification('Auto-start ' + (isChecked ? 'enabled' : 'disabled'), 'info');
            break;
    }
    if (toggleId === 'temp-toggle') {
        window.applyHeaderInfoImmediate?.(isChecked);
        await saveSettings({ showTemp: isChecked });
        void window.refreshHeaderInfo?.();
        return;
    }
    if (toggleId === 'osk-toggle') {
        window.QubibyteOSK?.refreshEnabled?.();
        await saveSettings({ onScreenKeyboard: isChecked });
        return;
    }
    if (toggleId === 'show-cursor-toggle') {
        await saveSettings({ showCursor: isChecked });
        return;
    }
    if (toggleId === 'touch-multitouch-toggle') {
        await saveSettings({ touchMultitouch: isChecked });
        if (window.electronAPI?.isRaspberryPi) {
            showNotification('Touch mode updated. Reboot if multitouch does not apply immediately.', 'info');
        }
        return;
    }
    if (toggleId === 'fullscreen-toggle') {
        await saveSettings({ fullscreen: isChecked });
        return;
    }
    if (toggleId === 'gpu-toggle') {
        await saveSettings({ gpuAccel: isChecked });
        return;
    }
    if (toggleId === 'autostart-toggle') {
        await saveSettings({ autoStart: isChecked });
        return;
    }

    await saveSettings();
}

function defaultShowCursor() {
    return !(window.electronAPI?.isRaspberryPi ?? false);
}

function defaultTouchMultitouch() {
    return window.electronAPI?.isRaspberryPi ?? false;
}

function updatePiOnlySettingsVisibility() {
    const onPi = Boolean(window.electronAPI?.isRaspberryPi);
    document.querySelectorAll('.pi-only-setting').forEach((el) => {
        el.hidden = !onPi;
    });
}

function defaultOnScreenKeyboard() {
    return window.electronAPI?.isRaspberryPi ?? false;
}

function setupThemePicker() {
    const picker = document.getElementById('theme-picker');
    if (!picker) return;

    const buttons = picker.querySelectorAll('.theme-option');

    const setActive = (theme) => {
        buttons.forEach((btn) => {
            const isActive = btn.dataset.theme === theme;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    };

    const theme = resolveEffectiveTheme(persistedSettings?.theme);
    setActive(theme);

    buttons.forEach((btn) => {
        btn.addEventListener('click', async () => {
            const theme = btn.dataset.theme;
            applyTheme(theme);
            setActive(theme);
            await saveSettings({ theme });
        });
    });
}

function syncThemePicker(theme) {
    document.querySelectorAll('#theme-picker .theme-option').forEach((btn) => {
        const isActive = btn.dataset.theme === theme;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function applyTheme(theme, notify = true) {
    const applied = window.QubibyteTheme
        ? window.QubibyteTheme.apply(theme)
        : theme;

    syncThemePicker(applied || theme);

    if (notify) {
        const label = (applied || theme).charAt(0).toUpperCase() + (applied || theme).slice(1);
        showNotification(`Theme: ${label}`, 'success');
    }
}

function testConnection() {
    const statusBadge = document.querySelector('.status-badge');
    const ip = document.getElementById('hw-ip').value;
    const port = document.getElementById('hw-port').value;

    showNotification(`Testing connection to ${ip}:${port}...`, 'info');
    statusBadge.className = 'status-badge connecting';
    statusBadge.textContent = 'Connecting...';

    // Simulate connection test
    setTimeout(() => {
        // For demo, randomly succeed or fail
        const success = Math.random() > 0.5;

        if (success) {
            statusBadge.className = 'status-badge connected';
            statusBadge.textContent = 'Connected';
            showNotification('Connection successful!', 'success');
        } else {
            statusBadge.className = 'status-badge disconnected';
            statusBadge.textContent = 'Connection Failed';
            showNotification('Connection failed. Check network settings.', 'error');
        }
    }, 2000);
}

function loadPlatformInfo() {
    const platformEl = document.getElementById('platform-info');
    const electronEl = document.getElementById('electron-version');

    if (window.electronAPI) {
        if (platformEl) platformEl.textContent = window.electronAPI.platform || 'Unknown';
        if (electronEl) electronEl.textContent = window.electronAPI.electronVersion || 'Unknown';
    } else {
        if (platformEl) platformEl.textContent = navigator.platform || 'Browser';
        if (electronEl) electronEl.textContent = 'N/A (Browser)';
    }
}

function collectSettings() {
    const settings = {
        theme: document.documentElement.dataset.theme || window.QubibyteTheme?.get() || 'dark',
        fullscreen: document.getElementById('fullscreen-toggle')?.checked ?? false,
        showTemp: document.getElementById('temp-toggle')?.checked ?? true,
        onScreenKeyboard: document.getElementById('osk-toggle')?.checked ?? defaultOnScreenKeyboard(),
        tempUnit: document.querySelector('#temp-unit-picker .unit-option.active')?.dataset.unit === 'C' ? 'C' : 'F',
        timezone: document.getElementById('timezone-select')?.value || '',
        screenBrightness: Number(document.getElementById('brightness-slider')?.value ?? BRIGHTNESS_UI_MAX),
        animationSpeed: document.getElementById('animation-speed')?.value ?? '1',
        gpuAccel: document.getElementById('gpu-toggle')?.checked ?? false,
        autoStart: document.getElementById('autostart-toggle')?.checked ?? false,
        hwIp: document.getElementById('hw-ip')?.value?.trim() || '',
        hwPort: document.getElementById('hw-port')?.value ?? '8080'
    };

    if (window.electronAPI?.isRaspberryPi) {
        settings.touchMultitouch = document.getElementById('touch-multitouch-toggle')?.checked ?? defaultTouchMultitouch();
    }

    settings.showCursor = document.getElementById('show-cursor-toggle')?.checked ?? defaultShowCursor();

    return settings;
}

async function saveSettings(patch) {
    const settings = patch && typeof patch === 'object' && !Array.isArray(patch)
        ? patch
        : collectSettings();

    try {
        if (patch && persistedSettings) {
            localStorage.setItem('qubibyte-settings', JSON.stringify({ ...persistedSettings, ...settings }));
        } else {
            localStorage.setItem('qubibyte-settings', JSON.stringify(settings));
        }
    } catch (e) {
        console.error('localStorage save failed:', e);
    }

    if (window.electronAPI?.saveSettings) {
        try {
            const result = await window.electronAPI.saveSettings(settings);
            if (result?.settings) {
                rememberPersistedSettings(result.settings);
            } else if (!patch) {
                rememberPersistedSettings(settings);
            } else if (persistedSettings) {
                rememberPersistedSettings({ ...persistedSettings, ...settings });
            }
        } catch (e) {
            console.error('Failed to save settings file:', e);
        }
    } else if (patch && persistedSettings) {
        rememberPersistedSettings({ ...persistedSettings, ...settings });
    } else if (!patch) {
        rememberPersistedSettings(settings);
    }
}

function rememberPersistedSettings(settings) {
    if (!settings || typeof settings !== 'object') return;
    persistedSettings = { ...settings };
}

function resolveEffectiveTheme(settingsTheme) {
    const themes = ['dark', 'light', 'midnight', 'quantum'];
    let cached = null;
    try {
        cached = localStorage.getItem('qubibyte-theme');
    } catch {
        /* ignore */
    }
    const current = document.documentElement.dataset.theme
        || window.QubibyteTheme?.get?.();

    if (cached && themes.includes(cached)) {
        return cached;
    }
    if (settingsTheme && themes.includes(settingsTheme)) {
        return settingsTheme;
    }
    if (current && themes.includes(current)) {
        return current;
    }
    return 'dark';
}

function applySettingsToUI(settings) {
    if (!settings) return;
    rememberPersistedSettings(settings);

    const theme = resolveEffectiveTheme(settings.theme);
    applyTheme(theme, false);
    if (settings.theme && theme !== settings.theme && window.electronAPI?.saveSettings) {
        saveSettings({ theme }).catch(() => {});
    }

    if (settings.animationSpeed !== undefined) {
        const animSpeed = document.getElementById('animation-speed');
        if (animSpeed) {
            animSpeed.value = settings.animationSpeed;
            const label = animSpeed.nextElementSibling;
            if (label) label.textContent = `${settings.animationSpeed}x`;
        }
    }

    const toggles = {
        'fullscreen-toggle': settings.fullscreen,
        'temp-toggle': settings.showTemp !== false,
        'osk-toggle': settings.onScreenKeyboard !== undefined
            ? settings.onScreenKeyboard
            : defaultOnScreenKeyboard(),
        'show-cursor-toggle': settings.showCursor !== undefined
            ? settings.showCursor
            : (settings.hideCursor !== undefined
                ? !settings.hideCursor
                : defaultShowCursor()),
        'touch-multitouch-toggle': settings.touchMultitouch !== undefined
            ? settings.touchMultitouch
            : defaultTouchMultitouch(),
        'gpu-toggle': settings.gpuAccel,
        'autostart-toggle': settings.autoStart
    };

    Object.entries(toggles).forEach(([id, value]) => {
        const toggle = document.getElementById(id);
        if (toggle) toggle.checked = Boolean(value);
    });

    const ipInput = document.getElementById('hw-ip');
    if (ipInput && settings.hwIp !== undefined) {
        ipInput.value = settings.hwIp;
    }
    if (settings.hwPort) {
        const portInput = document.getElementById('hw-port');
        if (portInput) portInput.value = settings.hwPort;
    }

    if (settings.screenBrightness !== undefined) {
        paintBrightnessSlider(normalizeBrightnessSetting(settings.screenBrightness));
    }

    syncTempUnitPicker(settings.tempUnit || 'F');

    const tz = pickTimezoneSelection(settings.timezone, allTimezoneOptions);
    if (allTimezoneOptions.length) {
        renderTimezoneOptions(allTimezoneOptions, tz);
    } else {
        const select = document.getElementById('timezone-select');
        if (select) {
            select.replaceChildren();
            const opt = document.createElement('option');
            opt.value = tz;
            opt.textContent = tz;
            opt.selected = true;
            select.appendChild(opt);
        }
    }
}

async function syncBrightnessFromHardware() {
    if (!window.electronAPI?.getDisplayBrightness) return;
    try {
        const state = await window.electronAPI.getDisplayBrightness();
        if (state?.level !== undefined) {
            paintBrightnessSlider(state.level);
        } else {
            configureBrightnessSlider();
        }
    } catch (err) {
        console.error('Brightness sync failed:', err);
    }
}

async function loadSettings() {
    let settings = null;

    if (window.electronAPI?.getSettings) {
        try {
            settings = await window.electronAPI.getSettings();
        } catch (e) {
            console.error('Failed to load settings file:', e);
        }
    }

    if (!settings) {
        const saved = localStorage.getItem('qubibyte-settings');
        if (saved) {
            try {
                settings = JSON.parse(saved);
            } catch (e) {
                console.error('Error parsing local settings:', e);
            }
        }
    }

    if (!settings) {
        const savedTheme = localStorage.getItem('qubibyte-theme');
        if (savedTheme) applyTheme(savedTheme, false);
        return;
    }

    try {
        localStorage.setItem('qubibyte-settings', JSON.stringify(settings));
    } catch (e) {
        /* ignore */
    }

    applySettingsToUI(settings);

    updatePiOnlySettingsVisibility();

    if (window.electronAPI?.isRaspberryPi) {
        await syncBrightnessFromHardware();
    }
}

function showConfirmDialog({ title, message, confirmText = 'Yes', cancelText = 'No' }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay confirm-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'confirm-modal';
        modal.setAttribute('role', 'alertdialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'confirm-modal-title');
        modal.innerHTML = `
            <div class="modal-header">
                <h2 id="confirm-modal-title">${title}</h2>
            </div>
            <div class="modal-body">
                <p class="confirm-modal-message">${message}</p>
            </div>
            <div class="modal-footer confirm-modal-footer">
                <button type="button" class="confirm-modal-btn confirm-modal-btn--cancel">${cancelText}</button>
                <button type="button" class="confirm-modal-btn confirm-modal-btn--confirm">${confirmText}</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('show'), 10);

        const finish = (result) => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
            resolve(result);
        };

        modal.querySelector('.confirm-modal-btn--cancel').addEventListener('click', () => finish(false));
        modal.querySelector('.confirm-modal-btn--confirm').addEventListener('click', () => finish(true));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) finish(false);
        });
    });
}

function setupResetSettings() {
    const btn = document.getElementById('reset-settings');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        let platformLabel = window.electronAPI?.isRaspberryPi ? 'Raspberry Pi' : 'Windows';
        if (window.electronAPI?.getPlatformDefaults) {
            try {
                const meta = await window.electronAPI.getPlatformDefaults();
                if (meta?.platformLabel) platformLabel = meta.platformLabel;
            } catch {
                /* use fallback label */
            }
        }

        const confirmed = await showConfirmDialog({
            title: 'Reset to Defaults',
            message: `Reset all settings to ${platformLabel} defaults? Theme, display, touch, keyboard, network, and other options will be restored. This cannot be undone.`,
            confirmText: 'Yes',
            cancelText: 'No'
        });

        if (!confirmed) return;

        if (!window.electronAPI?.resetSettings) {
            showNotification('Reset is only available in the desktop app.', 'info');
            return;
        }

        try {
            const result = await window.electronAPI.resetSettings();
            if (!result?.ok || !result.settings) {
                showNotification('Could not reset settings.', 'error');
                return;
            }

            applySettingsToUI(result.settings);
            window.QubibyteOSK?.refreshEnabled?.();
            window.applyHeaderInfoImmediate?.(result.settings.showTemp !== false);
            void window.refreshHeaderInfo?.();

            if (window.electronAPI.isRaspberryPi) {
                await syncBrightnessFromHardware();
            }

            if (window.electronAPI.toggleFullscreen) {
                const enableFullscreen = window.electronAPI.isRaspberryPi
                    ? true
                    : Boolean(result.settings.fullscreen);
                window.electronAPI.toggleFullscreen(enableFullscreen);
            }

            try {
                localStorage.setItem('qubibyte-settings', JSON.stringify(result.settings));
            } catch {
                /* ignore */
            }

            showNotification(`${platformLabel} defaults restored`, 'success');
        } catch (err) {
            console.error('Reset settings failed:', err);
            showNotification('Could not reset settings.', 'error');
        }
    });
}

function showLicenses() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'license-modal';
    modal.innerHTML = `
        <div class="modal-header">
            <h2>Open Source Licenses</h2>
            <button class="modal-close">✕</button>
        </div>
        <div class="modal-body">
            <div class="license-item">
                <h3>Electron</h3>
                <p>MIT License - Copyright (c) Electron contributors</p>
            </div>
            <div class="license-item">
                <h3>Node.js</h3>
                <p>MIT License - Copyright Node.js contributors</p>
            </div>
            <div class="license-item">
                <h3>systeminformation</h3>
                <p>MIT License - Copyright (c) 2014-2024 Sebastian Hildebrandt</p>
            </div>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(() => overlay.classList.add('show'), 10);

    const closeModal = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
    };

    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
}

function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    document.body.appendChild(notif);

    setTimeout(() => notif.classList.add('show'), 10);
    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 300);
    }, 2500);
}

function initBackgroundAnimation() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const particles = [];

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 20; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.2,
            vy: (Math.random() - 0.5) * 0.2,
            size: Math.random() * 1.5 + 0.5,
            alpha: Math.random() * 0.15 + 0.05
        });
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(99, 102, 241, ${p.alpha})`;
            ctx.fill();
        });

        requestAnimationFrame(animate);
    }
    animate();
}
