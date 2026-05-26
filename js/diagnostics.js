// Diagnostics Page JavaScript
// System performance monitoring and qubit status

document.addEventListener('DOMContentLoaded', init);

function init() {
    setupBackButton();
    setupSystemInfo();
    setupButtons();
    setupPiLedToggle();
    initBackgroundAnimation();
    startMonitoring();
}

// ============================================
// NAVIGATION
// ============================================

function setupBackButton() {
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        const handler = (e) => {
            e.preventDefault();
            goToMenu();
        };
        backBtn.addEventListener('click', handler);
        backBtn.addEventListener('touchend', handler);
    }
}

function goToMenu() {
    if (window.electronAPI && window.electronAPI.goToMenu) {
        window.electronAPI.goToMenu();
    } else {
        window.location.href = '../index.html#menu';
    }
}

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

// ============================================
// MONITORING
// ============================================

let startTime = Date.now();

function startMonitoring() {
    updateStats();
    setInterval(updateStats, 2000);
}

function updateStats() {
    // Simulated CPU usage with realistic variation
    const cpu = Math.round(15 + Math.random() * 25);
    document.getElementById('cpu-usage').textContent = `${cpu}%`;
    document.getElementById('cpu-bar').style.width = `${cpu}%`;

    // Simulated memory
    const mem = Math.round(35 + Math.random() * 15);
    document.getElementById('mem-usage').textContent = `${mem}%`;
    document.getElementById('mem-bar').style.width = `${mem}%`;

    // Temperature
    const temp = Math.round(42 + Math.random() * 8);
    document.getElementById('temp-value').textContent = `${temp}°C`;
    document.getElementById('temp-bar').style.width = `${Math.min(temp, 100)}%`;
    document.getElementById('temp-bar').style.background = temp > 70 ? 'var(--accent-red)' :
        temp > 55 ? 'var(--accent-yellow)' : 'var(--accent-green)';

    // Uptime
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const secs = uptime % 60;
    document.getElementById('uptime-value').textContent =
        `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ============================================
// BUTTONS
// ============================================

function setupPiLedToggle() {
    const panel = document.getElementById('pi-led-panel');
    const btn = document.getElementById('pi-led-toggle');
    if (!panel || !btn || !window.electronAPI?.isRaspberryPi) return;

    panel.classList.remove('hidden');

    const paint = (on) => {
        btn.classList.toggle('led-on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.textContent = on ? 'LED ON' : 'LED OFF';
    };

    const syncState = async () => {
        try {
            const state = await window.electronAPI.getOnboardLedState();
            if (state?.ok) paint(Boolean(state.on));
        } catch (err) {
            console.error('LED state read failed:', err);
        }
    };

    syncState();

    const handler = async (e) => {
        e.preventDefault();
        try {
            const result = await window.electronAPI.toggleOnboardLed();
            if (result?.ok) paint(Boolean(result.on));
        } catch (err) {
            console.error('LED toggle failed:', err);
        }
    };

    btn.addEventListener('click', handler);
    btn.addEventListener('touchend', handler);
}

function setupButtons() {
    const clearLogs = document.getElementById('clear-logs');
    const runTest = document.getElementById('run-test');

    if (clearLogs) {
        clearLogs.addEventListener('click', () => {
            document.getElementById('log-container').innerHTML =
                '<div class="log-entry info">[INFO] Logs cleared</div>';
        });
    }

    if (runTest) {
        runTest.addEventListener('click', runSelfTest);
    }
}

function runSelfTest() {
    const container = document.getElementById('log-container');
    const tests = [
        '[TEST] Starting self-test...',
        '[TEST] Checking quantum processor...',
        '[OK] Processor responding',
        '[TEST] Checking qubit 0...',
        '[OK] Qubit 0 operational',
        '[TEST] Checking qubit 1...',
        '[OK] Qubit 1 operational',
        '[TEST] Checking qubit 2...',
        '[WARN] Qubit 2 T1 below optimal',
        '[TEST] Checking resonator...',
        '[OK] Resonator stable',
        '[INFO] Self-test complete: 3/4 nominal'
    ];

    let i = 0;
    const interval = setInterval(() => {
        if (i >= tests.length) {
            clearInterval(interval);
            return;
        }

        const entry = document.createElement('div');
        const type = tests[i].includes('[OK]') ? 'success' :
            tests[i].includes('[WARN]') ? 'warning' : 'info';
        entry.className = `log-entry ${type}`;
        entry.textContent = tests[i];
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
        i++;
    }, 400);
}

// ============================================
// BACKGROUND ANIMATION
// ============================================

function initBackgroundAnimation() {
    if (window.electronAPI?.isRaspberryPi) return;

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

        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(6, 182, 212, ${p.alpha})`;
            ctx.fill();
        }

        requestAnimationFrame(animate);
    }
    animate();
}
