// Calibration Page JavaScript

document.addEventListener('DOMContentLoaded', init);

function init() {
    setupBackButton();
    setupSystemInfo();
    setupSliders();
    setupButtons();
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
    window.setupHeaderInfo?.();
}

function formatTime() {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Setup slider controls
function setupSliders() {
    const sliders = [
        { id: 'q0-freq', valId: 'q0-freq-val', suffix: '' },
        { id: 'q1-freq', valId: 'q1-freq-val', suffix: '' },
        { id: 'q2-freq', valId: 'q2-freq-val', suffix: '' },
        { id: 'pi-pulse', valId: 'pi-pulse-val', suffix: '' },
        { id: 'readout', valId: 'readout-val', suffix: '' }
    ];

    sliders.forEach(({ id, valId }) => {
        const slider = document.getElementById(id);
        const valEl = document.getElementById(valId);

        if (slider && valEl) {
            slider.addEventListener('input', () => {
                valEl.textContent = slider.value;
            });
        }
    });
}

// Setup buttons
function setupButtons() {
    const runBtn = document.getElementById('run-calibration');
    const saveBtn = document.getElementById('save-calibration');
    const resetBtn = document.getElementById('reset-calibration');

    if (runBtn) {
        runBtn.addEventListener('click', runCalibration);
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', saveConfiguration);
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', resetToDefaults);
    }
}

function runCalibration() {
    showNotification('Starting auto-calibration...', 'info');

    // Simulate calibration progress
    const statusCards = document.querySelectorAll('.status-card');
    let index = 0;

    const interval = setInterval(() => {
        if (index < statusCards.length) {
            statusCards[index].classList.add('calibrating');
            setTimeout(() => {
                statusCards[index].classList.remove('calibrating');
                statusCards[index].classList.remove('warning');
                statusCards[index].classList.add('good');
                statusCards[index].querySelector('.status-value').textContent = 'Online';
                index++;
            }, 800);
        } else {
            clearInterval(interval);
            showNotification('Calibration complete!', 'success');
            addHistoryItem('Full System', 'success');
        }
    }, 1000);
}

function saveConfiguration() {
    // Get all slider values
    const config = {
        q0Freq: document.getElementById('q0-freq').value,
        q1Freq: document.getElementById('q1-freq').value,
        q2Freq: document.getElementById('q2-freq').value,
        piPulse: document.getElementById('pi-pulse').value,
        readout: document.getElementById('readout').value
    };

    // Save to localStorage (in real app, would save to file)
    localStorage.setItem('qubibyte-calibration', JSON.stringify(config));
    showNotification('Configuration saved!', 'success');
}

function resetToDefaults() {
    const defaults = {
        'q0-freq': 5.123,
        'q1-freq': 4.987,
        'q2-freq': 5.256,
        'pi-pulse': 32,
        'readout': 1.5
    };

    Object.entries(defaults).forEach(([id, value]) => {
        const slider = document.getElementById(id);
        const valEl = document.getElementById(id + '-val');
        if (slider && valEl) {
            slider.value = value;
            valEl.textContent = value;
        }
    });

    showNotification('Reset to default values', 'info');
}

function addHistoryItem(type, status) {
    const list = document.querySelector('.history-list');
    if (!list) return;

    const now = new Date();
    const timeStr = `Today ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const item = document.createElement('div');
    item.className = `history-item ${status}`;
    item.innerHTML = `
        <div class="history-time">${timeStr}</div>
        <div class="history-type">${type}</div>
        <div class="history-status">${status === 'success' ? '✓ Success' : '⚠ Warning'}</div>
    `;

    list.insertBefore(item, list.firstChild);

    // Keep only last 10 items
    while (list.children.length > 10) {
        list.removeChild(list.lastChild);
    }
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
            ctx.fillStyle = `rgba(34, 197, 94, ${p.alpha})`;
            ctx.fill();
        });

        requestAnimationFrame(animate);
    }
    animate();
}
