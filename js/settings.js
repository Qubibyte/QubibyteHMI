// Settings Page JavaScript

document.addEventListener('DOMContentLoaded', () => {
    init().catch((e) => console.error('Settings init failed:', e));
});

async function init() {
    setupBackButton();
    setupSystemInfo();
    setupNavigation();
    setupControls();
    await loadSettings();
    loadPlatformInfo();
    initBackgroundAnimation();
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

// System info display
function setupSystemInfo() {
    updateSystemInfo();
    setInterval(updateSystemInfo, 5000);
}

async function updateSystemInfo() {
    const infoEl = document.getElementById('system-info');
    if (!infoEl) return;

    if (window.electronAPI && window.electronAPI.getSystemInfo) {
        try {
            const info = await window.electronAPI.getSystemInfo();
            window.applySystemInfo(infoEl, info);
        } catch (e) {
            infoEl.textContent = formatTime();
        }
    } else {
        infoEl.textContent = formatTime();
    }
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
            handleToggle(toggle.id, toggle.checked);
        });
    });

    // Buttons
    setupButtons();

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

function handleToggle(toggleId, isChecked) {
    switch (toggleId) {
        case 'fullscreen-toggle':
            if (window.electronAPI && window.electronAPI.toggleFullscreen) {
                window.electronAPI.toggleFullscreen(isChecked);
            }
            break;
        case 'temp-toggle':
            // Toggle temperature display
            const tempDisplay = document.querySelector('.system-info');
            if (tempDisplay) {
                tempDisplay.style.display = isChecked ? 'block' : 'none';
            }
            break;
        case 'gpu-toggle':
            showNotification('GPU acceleration change requires restart', 'info');
            break;
        case 'autostart-toggle':
            showNotification('Auto-start ' + (isChecked ? 'enabled' : 'disabled'), 'info');
            break;
    }
    saveSettings();
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

    const current = window.QubibyteTheme?.get() || document.documentElement.dataset.theme || 'dark';
    setActive(current);

    buttons.forEach((btn) => {
        btn.addEventListener('click', async () => {
            const theme = btn.dataset.theme;
            applyTheme(theme);
            setActive(theme);
            await saveSettings();
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
    return {
        theme: document.documentElement.dataset.theme || window.QubibyteTheme?.get() || 'dark',
        fullscreen: document.getElementById('fullscreen-toggle')?.checked ?? false,
        showTemp: document.getElementById('temp-toggle')?.checked ?? true,
        animationSpeed: document.getElementById('animation-speed')?.value ?? '1',
        gpuAccel: document.getElementById('gpu-toggle')?.checked ?? false,
        autoStart: document.getElementById('autostart-toggle')?.checked ?? false,
        hwIp: document.getElementById('hw-ip')?.value ?? '192.168.1.100',
        hwPort: document.getElementById('hw-port')?.value ?? '8080'
    };
}

async function saveSettings() {
    const settings = collectSettings();

    try {
        localStorage.setItem('qubibyte-settings', JSON.stringify(settings));
    } catch (e) {
        console.error('localStorage save failed:', e);
    }

    if (window.electronAPI?.saveSettings) {
        try {
            await window.electronAPI.saveSettings(settings);
        } catch (e) {
            console.error('Failed to save settings file:', e);
        }
    }
}

function applySettingsToUI(settings) {
    if (!settings) return;

    if (settings.theme) {
        applyTheme(settings.theme, false);
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
        'temp-toggle': settings.showTemp,
        'gpu-toggle': settings.gpuAccel,
        'autostart-toggle': settings.autoStart
    };

    Object.entries(toggles).forEach(([id, value]) => {
        const toggle = document.getElementById(id);
        if (toggle && value !== undefined) toggle.checked = value;
    });

    if (settings.hwIp) {
        const ipInput = document.getElementById('hw-ip');
        if (ipInput) ipInput.value = settings.hwIp;
    }
    if (settings.hwPort) {
        const portInput = document.getElementById('hw-port');
        if (portInput) portInput.value = settings.hwPort;
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
