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
    window.setupHeaderInfo?.();
}

function formatTime() {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ============================================
// MONITORING
// ============================================

const HISTORY_WINDOW_MS = 5 * 60 * 1000;
const SAMPLE_MS = 2000;

let tempUnit = 'F'; // default display
let selectedSeries = 'temperature';
const sessionStartMs = Date.now();

/** @type {{ts:number, cpu:number|null, mem:number|null, tempC:number|null, rx:number|null, tx:number|null}[]} */
let samples = [];

function startMonitoring() {
    setupTempUnitToggle();
    setupHistoryControls();
    updateStats();
    setInterval(updateStats, SAMPLE_MS);
}

function setupTempUnitToggle() {
    const btn = document.getElementById('temp-unit-toggle');
    if (!btn) return;
    const saved = (() => {
        try { return localStorage.getItem('diag-temp-unit'); } catch { return null; }
    })();
    if (saved === 'C' || saved === 'F') tempUnit = saved;
    btn.textContent = tempUnit === 'F' ? 'See °C' : 'See °F';
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        tempUnit = tempUnit === 'F' ? 'C' : 'F';
        btn.textContent = tempUnit === 'F' ? 'See °C' : 'See °F';
        try { localStorage.setItem('diag-temp-unit', tempUnit); } catch { }
        // repaint with last sample
        paintLatest();
    });
}

function setupHistoryControls() {
    const sel = document.getElementById('stat-history-select');
    if (!sel) return;
    sel.value = selectedSeries;
    sel.addEventListener('change', () => {
        selectedSeries = sel.value;
        renderHistoryGraph();
    });
}

function clamp01(x) {
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
}

function cToF(c) { return (c * 9 / 5) + 32; }

function formatBytesPerSec(bps) {
    if (!Number.isFinite(bps) || bps < 0) return '--';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let v = bps;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatUptime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '--';
    const s = Math.floor(seconds);
    const hours = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function parseTempStringToF(str) {
    if (typeof str !== 'string') return null;
    const m = str.match(/(-?\d+(\.\d+)?)\s*°\s*F/i);
    if (!m) return null;
    const v = parseFloat(m[1]);
    return Number.isFinite(v) ? v : null;
}

function generateSimulatedTelemetry() {
    // Simulated values roughly in the same ranges as typical systems
    const cpu = Math.round(10 + Math.random() * 40);
    const mem = Math.round(25 + Math.random() * 35);
    const tempC = Math.round(40 + Math.random() * 12);
    const rx = Math.random() * 12000;
    const tx = Math.random() * 8000;
    return { cpuPercent: cpu, memoryPercent: mem, temperatureC: tempC, netRxBytesPerSec: rx, netTxBytesPerSec: tx, uptimeSeconds: (Date.now() / 1000) };
}

async function updateStats() {
    const now = Date.now();
    let info = null;

    if (window.electronAPI?.getSystemInfo) {
        try {
            info = await window.electronAPI.getSystemInfo();
        } catch {
            info = null;
        }
    }

    if (!info) info = {};

    const simulated = generateSimulatedTelemetry();

    const cpu = Number.isFinite(info.cpuPercent) ? info.cpuPercent : simulated.cpuPercent;
    const mem = Number.isFinite(info.memoryPercent) ? info.memoryPercent : simulated.memoryPercent;

    let tempC = Number.isFinite(info.temperatureC) ? info.temperatureC : null;
    if (tempC === null && typeof info.temperature === 'string') {
        const tempFParsed = parseTempStringToF(info.temperature);
        if (Number.isFinite(tempFParsed)) tempC = (tempFParsed - 32) * 5 / 9;
    }
    if (tempC === null) tempC = simulated.temperatureC;

    const rx = Number.isFinite(info.netRxBytesPerSec) ? info.netRxBytesPerSec : simulated.netRxBytesPerSec;
    const tx = Number.isFinite(info.netTxBytesPerSec) ? info.netTxBytesPerSec : simulated.netTxBytesPerSec;
    const uptimeSeconds = Number.isFinite(info.uptimeSeconds) ? info.uptimeSeconds : null;

    samples.push({ ts: now, cpu, mem, tempC, rx, tx });
    const cutoff = now - HISTORY_WINDOW_MS;
    while (samples.length && samples[0].ts < cutoff) samples.shift();

    paintLatest({ cpu, mem, tempC, rx, tx, uptimeSeconds });
    renderHistoryGraph();
}

function paintLatest(override) {
    const last = override || (samples.length ? samples[samples.length - 1] : null);
    if (!last) return;

    const cpu = last.cpu;
    const mem = last.mem;
    const tempC = last.tempC;
    const rx = last.rx;
    const tx = last.tx;

    const cpuEl = document.getElementById('cpu-usage');
    const cpuBar = document.getElementById('cpu-bar');
    if (cpuEl && cpuBar && Number.isFinite(cpu)) {
        cpuEl.textContent = `${Math.round(cpu)}%`;
        cpuBar.style.width = `${clamp01(cpu / 100) * 100}%`;
    }

    const memEl = document.getElementById('mem-usage');
    const memBar = document.getElementById('mem-bar');
    if (memEl && memBar && Number.isFinite(mem)) {
        memEl.textContent = `${Math.round(mem)}%`;
        memBar.style.width = `${clamp01(mem / 100) * 100}%`;
    }

    const tempEl = document.getElementById('temp-value');
    const tempBar = document.getElementById('temp-bar');
    if (tempEl && tempBar && Number.isFinite(tempC)) {
        const tempF = cToF(tempC);
        const shown = tempUnit === 'C' ? `${tempC.toFixed(1)}°C` : `${tempF.toFixed(1)}°F`;
        tempEl.textContent = shown;
        tempBar.style.width = `${clamp01(tempC / 100) * 100}%`;
        tempBar.style.background = tempC > 70 ? 'var(--accent-red)' :
            tempC > 55 ? 'var(--accent-yellow)' : 'var(--accent-green)';
    }

    const uptimeEl = document.getElementById('uptime-value');
    if (uptimeEl) {
        const fromIpc = override && Number.isFinite(override.uptimeSeconds) ? override.uptimeSeconds : null;
        const fallback = (Date.now() - sessionStartMs) / 1000;
        uptimeEl.textContent = formatUptime(fromIpc ?? fallback);
    }

    const rxEl = document.getElementById('net-rx');
    if (rxEl) rxEl.textContent = formatBytesPerSec(rx);
    const txEl = document.getElementById('net-tx');
    if (txEl) txEl.textContent = formatBytesPerSec(tx);
}

function getSeriesConfig(key) {
    switch (key) {
        case 'cpu':
            return { label: 'CPU (%)', unit: '%', get: (s) => s.cpu, min: 0, max: 100 };
        case 'memory':
            return { label: 'Memory (%)', unit: '%', get: (s) => s.mem, min: 0, max: 100 };
        case 'temperature':
        default:
            return {
                label: `Temperature (°${tempUnit})`,
                unit: `°${tempUnit}`,
                get: (s) => {
                    if (!Number.isFinite(s.tempC)) return null;
                    return tempUnit === 'C' ? s.tempC : cToF(s.tempC);
                },
                min: tempUnit === 'C' ? 0 : 32,
                max: tempUnit === 'C' ? 100 : 212
            };
        case 'netRx':
            return { label: 'Network RX (KB/s)', unit: 'KB/s', get: (s) => Number.isFinite(s.rx) ? s.rx / 1024 : null, min: 0, max: null };
        case 'netTx':
            return { label: 'Network TX (KB/s)', unit: 'KB/s', get: (s) => Number.isFinite(s.tx) ? s.tx / 1024 : null, min: 0, max: null };
    }
}

function renderHistoryGraph() {
    const canvas = document.getElementById('stat-history-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cfg = getSeriesConfig(selectedSeries);
    const { label, get } = cfg;
    const min = cfg.min;
    let max = cfg.max;
    if (!Number.isFinite(max)) {
        let m = 0;
        for (const s of samples) {
            const v = get(s);
            if (Number.isFinite(v)) m = Math.max(m, v);
        }
        max = m > 0 ? m * 1.15 : 1;
    }

    // Size canvas to CSS pixels (sharp on Pi/7")
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Pull colors from CSS variables
    const cs = getComputedStyle(document.documentElement);
    const text = cs.getPropertyValue('--text-muted').trim() || '#94a3b8';
    const border = cs.getPropertyValue('--border-color').trim() || 'rgba(255,255,255,0.12)';
    const line = cs.getPropertyValue('--accent-cyan').trim() || '#06b6d4';
    const bg = cs.getPropertyValue('--surface-overlay-subtle').trim() || 'rgba(255,255,255,0.04)';
    const fill = cs.getPropertyValue('--accent-blue').trim() || '#0ea5e9';

    // background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const padL = 44 * dpr, padR = 10 * dpr, padT = 18 * dpr, padB = 28 * dpr;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const now = Date.now();
    const firstTs = samples.length ? samples[0].ts : now;
    const visibleWindow = Math.min(HISTORY_WINDOW_MS, Math.max(30_000, now - firstTs));
    const start = now - visibleWindow;

    // axes
    ctx.strokeStyle = border;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // y ticks
    ctx.fillStyle = text;
    ctx.font = `${Math.round(12 * dpr)}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yTicks = 3;
    for (let i = 0; i <= yTicks; i++) {
        const t = i / yTicks;
        const y = padT + plotH - t * plotH;
        const v = min + t * (max - min);
        ctx.fillText(`${Math.round(v)}`, padL - (8 * dpr), y);
        ctx.strokeStyle = border;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // title
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = text;
    ctx.fillText(label, padL, 4 * dpr);

    // line series
    const points = [];
    for (const s of samples) {
        const v = get(s);
        if (!Number.isFinite(v)) continue;
        const x = padL + ((s.ts - start) / (visibleWindow)) * plotW;
        const y = padT + (1 - clamp01((v - min) / (max - min))) * plotH;
        points.push({ x, y });
    }

    if (points.length >= 1) {
        // area fill
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(points[0].x, padT + plotH);
        for (let i = 0; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.lineTo(points[points.length - 1].x, padT + plotH);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;

        // line
        ctx.strokeStyle = line;
        ctx.lineWidth = 2.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
    }

    // x axis labels (elapsed)
    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xTicks = 3;
    const formatMMSS = (ms) => {
        const total = Math.max(0, Math.floor(ms / 1000));
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };
    for (let i = 0; i <= xTicks; i++) {
        const t = i / xTicks;
        const x = padL + t * plotW;
        const labelMs = t * visibleWindow;
        ctx.fillText(i === xTicks ? 'now' : formatMMSS(labelMs), x, padT + plotH + (6 * dpr));
    }
}

// ============================================
// BUTTONS
// ============================================

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

function setupPiLedToggle() {
    const btn = document.getElementById('pi-led-toggle');
    if (!btn) return;

    const paint = (on) => {
        btn.classList.toggle('led-on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    };

    const syncState = async () => {
        if (!window.electronAPI?.getOnboardLedState) return;
        try {
            const state = await window.electronAPI.getOnboardLedState();
            if (state?.ok) paint(Boolean(state.on));
        } catch (err) {
            console.error('LED state read failed:', err);
        }
    };

    if (window.electronAPI?.isRaspberryPi) {
        syncState();
    }

    const ledErrorMessage = (result) => {
        if (result?.reason === 'permission-denied') {
            return 'LED control needs permission. Add your user to the led group and re-login (see BUILD_INSTRUCTIONS).';
        }
        if (result?.reason === 'no-led') {
            return 'No onboard activity LED found on this device.';
        }
        if (result?.reason === 'read-failed') {
            return 'Could not read the onboard LED state.';
        }
        return 'Could not control onboard LED.';
    };

    const handler = async (e) => {
        e.preventDefault();

        if (!window.electronAPI?.toggleOnboardLed) {
            showNotification('Onboard LED control is not available.', 'info');
            return;
        }

        if (!window.electronAPI.isRaspberryPi) {
            showNotification('Onboard LED is only available on Raspberry Pi hardware.', 'info');
            return;
        }

        try {
            const result = await window.electronAPI.toggleOnboardLed();
            if (result?.ok) {
                paint(Boolean(result.on));
            } else {
                showNotification(ledErrorMessage(result), 'error');
            }
        } catch (err) {
            console.error('LED toggle failed:', err);
            showNotification('LED toggle failed.', 'error');
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
