/**
 * Qubibyte Circuit Builder
 * Quantum Circuit Simulator with Drag-and-Drop
 * Optimized for 1280x720 touchscreen
 */

'use strict';

// === CONFIGURATION ===
const NUM_QUBITS = 3;
const NUM_STEPS = 8;
const SQRT2_INV = 0.7071067811865476; // 1/√2

// === STATE ===
let circuit = [];          // circuit[qubit][step] = gate or null
let pendingTwoQubit = null; // For 2-qubit gate placement
let dragGhost = null;       // Visual drag indicator

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', init);

function init() {
    initCircuitState();
    buildCircuitGrid();
    setupDragAndDrop();
    setupButtons();
    setupBackButton();
    setupSystemInfo();
    initBackground();
    runSimulation();
}

function initCircuitState() {
    circuit = [];
    for (let q = 0; q < NUM_QUBITS; q++) {
        circuit[q] = new Array(NUM_STEPS).fill(null);
    }
}

// === BUILD CIRCUIT GRID ===
function buildCircuitGrid() {
    const grid = document.getElementById('circuit-grid');
    grid.innerHTML = '';

    for (let q = 0; q < NUM_QUBITS; q++) {
        const row = document.createElement('div');
        row.className = 'circuit-row';
        row.dataset.qubit = q;

        const label = document.createElement('div');
        label.className = 'qubit-label';
        label.innerHTML = `q[${q}]<small>|0⟩</small>`;
        row.appendChild(label);

        const wireContainer = document.createElement('div');
        wireContainer.className = 'wire-container';

        const wireLine = document.createElement('div');
        wireLine.className = 'wire-line';
        wireContainer.appendChild(wireLine);

        for (let s = 0; s < NUM_STEPS; s++) {
            const slot = document.createElement('div');
            slot.className = 'gate-slot';
            slot.id = `slot-${q}-${s}`;
            slot.dataset.qubit = q;
            slot.dataset.step = s;
            wireContainer.appendChild(slot);
        }

        row.appendChild(wireContainer);
        grid.appendChild(row);
    }
}

// === DRAG AND DROP ===
function setupDragAndDrop() {
    const gates = document.querySelectorAll('.gate-btn');
    const slots = document.querySelectorAll('.gate-slot');

    // Mouse drag
    gates.forEach(gate => {
        gate.addEventListener('dragstart', handleDragStart);
        gate.addEventListener('dragend', handleDragEnd);
    });

    slots.forEach(slot => {
        slot.addEventListener('dragover', handleDragOver);
        slot.addEventListener('dragleave', handleDragLeave);
        slot.addEventListener('drop', handleDrop);
        slot.addEventListener('click', handleSlotClick);
    });

    // Touch drag
    gates.forEach(gate => {
        gate.addEventListener('touchstart', handleTouchStart, { passive: false });
        gate.addEventListener('touchmove', handleTouchMove, { passive: false });
        gate.addEventListener('touchend', handleTouchEnd);
    });
}

// Mouse Drag Handlers
function handleDragStart(e) {
    e.dataTransfer.setData('gate', e.target.dataset.gate);
    e.dataTransfer.effectAllowed = 'copy';
    e.target.style.opacity = '0.5';
}

function handleDragEnd(e) {
    e.target.style.opacity = '1';
    clearSlotHighlights();
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const gate = e.dataTransfer.getData('gate');
    const qubit = parseInt(e.currentTarget.dataset.qubit);
    const step = parseInt(e.currentTarget.dataset.step);

    placeGate(gate, qubit, step);
}

// Touch Drag Handlers
let touchDragGate = null;
let touchStartX = 0, touchStartY = 0;

function handleTouchStart(e) {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchDragGate = e.currentTarget.dataset.gate;

    // Create ghost
    dragGhost = document.createElement('div');
    dragGhost.className = 'drag-ghost gate-btn gate-' + touchDragGate.toLowerCase();
    dragGhost.textContent = touchDragGate === 'SWAP' ? '⇄' : touchDragGate;
    dragGhost.style.width = '40px';
    dragGhost.style.height = '40px';
    dragGhost.style.left = touch.clientX + 'px';
    dragGhost.style.top = touch.clientY + 'px';
    document.body.appendChild(dragGhost);
}

function handleTouchMove(e) {
    if (!dragGhost) return;
    e.preventDefault();

    const touch = e.touches[0];
    dragGhost.style.left = touch.clientX + 'px';
    dragGhost.style.top = touch.clientY + 'px';

    // Highlight slot under touch
    clearSlotHighlights();
    const slot = getSlotUnderPoint(touch.clientX, touch.clientY);
    if (slot) slot.classList.add('drag-over');
}

function handleTouchEnd(e) {
    if (!dragGhost) return;

    const touch = e.changedTouches[0];
    const slot = getSlotUnderPoint(touch.clientX, touch.clientY);

    if (slot && touchDragGate) {
        const qubit = parseInt(slot.dataset.qubit);
        const step = parseInt(slot.dataset.step);
        placeGate(touchDragGate, qubit, step);
    }

    // Cleanup
    dragGhost.remove();
    dragGhost = null;
    touchDragGate = null;
    clearSlotHighlights();
}

function getSlotUnderPoint(x, y) {
    const slots = document.querySelectorAll('.gate-slot');
    for (const slot of slots) {
        const rect = slot.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return slot;
        }
    }
    return null;
}

function clearSlotHighlights() {
    document.querySelectorAll('.gate-slot').forEach(s => s.classList.remove('drag-over'));
}

// Slot Click (for removing gates)
function handleSlotClick(e) {
    const qubit = parseInt(e.currentTarget.dataset.qubit);
    const step = parseInt(e.currentTarget.dataset.step);

    if (circuit[qubit][step]) {
        removeGate(qubit, step);
    } else if (pendingTwoQubit && pendingTwoQubit.step === step) {
        completeTwoQubitGate(qubit);
    }
}

// === GATE PLACEMENT ===
function placeGate(gateType, qubit, step) {
    // Don't place on occupied slot
    if (circuit[qubit][step]) return;

    if (isTwoQubitGate(gateType)) {
        if (pendingTwoQubit && pendingTwoQubit.step === step) {
            // Complete 2-qubit gate
            completeTwoQubitGate(qubit);
        } else {
            // Start 2-qubit placement
            startTwoQubitGate(gateType, qubit, step);
        }
    } else {
        // Single qubit gate
        circuit[qubit][step] = { type: gateType };
        renderCircuit();
        runSimulation();
    }
}

function isTwoQubitGate(g) {
    return g === 'CX' || g === 'CZ' || g === 'SWAP';
}

function startTwoQubitGate(gateType, control, step) {
    pendingTwoQubit = { type: gateType, control, step };

    // Show control dot
    const slot = document.getElementById(`slot-${control}-${step}`);
    slot.innerHTML = '<div class="control-dot"></div>';
    slot.classList.add('has-gate');

    // Highlight valid targets
    for (let q = 0; q < NUM_QUBITS; q++) {
        if (q !== control && !circuit[q][step]) {
            document.getElementById(`slot-${q}-${step}`).classList.add('drag-over');
        }
    }
}

function completeTwoQubitGate(target) {
    if (!pendingTwoQubit) return;

    const { type, control, step } = pendingTwoQubit;
    if (target === control) {
        cancelTwoQubitGate();
        return;
    }

    circuit[control][step] = { type, isControl: true, target };
    circuit[target][step] = { type, isTarget: true, control };

    pendingTwoQubit = null;
    clearSlotHighlights();
    renderCircuit();
    runSimulation();
}

function cancelTwoQubitGate() {
    if (pendingTwoQubit) {
        const { control, step } = pendingTwoQubit;
        const slot = document.getElementById(`slot-${control}-${step}`);
        slot.innerHTML = '';
        slot.classList.remove('has-gate');
    }
    pendingTwoQubit = null;
    clearSlotHighlights();
}

function removeGate(qubit, step) {
    const gate = circuit[qubit][step];
    if (!gate) return;

    // Remove paired gate for 2-qubit gates
    if (gate.isControl) {
        circuit[gate.target][step] = null;
    } else if (gate.isTarget) {
        circuit[gate.control][step] = null;
    }

    circuit[qubit][step] = null;
    renderCircuit();
    runSimulation();
}

// === RENDER CIRCUIT ===
function renderCircuit() {
    // Clear all slots
    document.querySelectorAll('.gate-slot').forEach(slot => {
        slot.innerHTML = '';
        slot.classList.remove('has-gate');
    });

    // Remove old control lines
    document.querySelectorAll('.control-line').forEach(el => el.remove());

    // Render each gate
    for (let q = 0; q < NUM_QUBITS; q++) {
        for (let s = 0; s < NUM_STEPS; s++) {
            const gate = circuit[q][s];
            if (!gate) continue;

            const slot = document.getElementById(`slot-${q}-${s}`);
            slot.classList.add('has-gate');

            if (gate.isControl) {
                slot.innerHTML = '<div class="control-dot"></div>';
                drawControlLine(q, gate.target, s);
            } else if (gate.isTarget) {
                const cls = `gate-${gate.type.toLowerCase()}`;
                const label = gate.type === 'SWAP' ? '⇄' : gate.type;
                slot.innerHTML = `<div class="placed-gate ${cls}">${label}</div>`;
            } else {
                const cls = `gate-${gate.type.toLowerCase()}`;
                const label = gate.type === 'SWAP' ? '⇄' : gate.type;
                slot.innerHTML = `<div class="placed-gate ${cls}">${label}</div>`;
            }
        }
    }

    updateStats();
}

function drawControlLine(control, target, step) {
    const cSlot = document.getElementById(`slot-${control}-${step}`);
    const tSlot = document.getElementById(`slot-${target}-${step}`);
    const grid = document.getElementById('circuit-grid');

    if (!cSlot || !tSlot || !grid) return;

    const cRect = cSlot.getBoundingClientRect();
    const tRect = tSlot.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();

    const line = document.createElement('div');
    line.className = 'control-line';

    const top = Math.min(cRect.top, tRect.top) - gridRect.top + cRect.height / 2;
    const bottom = Math.max(cRect.bottom, tRect.bottom) - gridRect.top - cRect.height / 2;
    const left = cRect.left - gridRect.left + cRect.width / 2 - 1.5;

    line.style.left = left + 'px';
    line.style.top = top + 'px';
    line.style.height = (bottom - top) + 'px';

    grid.appendChild(line);
}

// === BUTTONS ===
function setupButtons() {
    document.getElementById('run-btn').addEventListener('click', runSimulation);
    document.getElementById('clear-btn').addEventListener('click', clearCircuit);
}

function clearCircuit() {
    initCircuitState();
    pendingTwoQubit = null;
    clearSlotHighlights();
    renderCircuit();
    runSimulation();
}

function updateStats() {
    let gates = 0, depth = 0;

    for (let s = 0; s < NUM_STEPS; s++) {
        let hasGate = false;
        for (let q = 0; q < NUM_QUBITS; q++) {
            const g = circuit[q][s];
            if (g && !g.isTarget) { // Don't double-count
                gates++;
                hasGate = true;
            }
        }
        if (hasGate) depth = s + 1;
    }

    document.getElementById('gate-count').textContent = gates;
    document.getElementById('circuit-depth').textContent = depth;
}

// === QUANTUM SIMULATION ===
function runSimulation() {
    // Initialize |000⟩
    const re = new Float64Array([1, 0, 0, 0, 0, 0, 0, 0]);
    const im = new Float64Array(8);

    // Apply gates step by step
    for (let s = 0; s < NUM_STEPS; s++) {
        for (let q = 0; q < NUM_QUBITS; q++) {
            const g = circuit[q][s];
            if (!g || g.isTarget) continue;

            if (g.isControl) {
                applyTwoQubit(g.type, q, g.target, re, im);
            } else {
                applyOneQubit(g.type, q, re, im);
            }
        }
    }

    displayResults(re, im);
}

function applyOneQubit(gate, qubit, re, im) {
    const m = 1 << qubit;

    for (let i = 0; i < 8; i++) {
        if (i & m) continue;
        const j = i | m;

        const r0 = re[i], i0 = im[i], r1 = re[j], i1 = im[j];

        switch (gate) {
            case 'X':
                re[i] = r1; im[i] = i1;
                re[j] = r0; im[j] = i0;
                break;
            case 'Y':
                re[i] = i1; im[i] = -r1;
                re[j] = -i0; im[j] = r0;
                break;
            case 'Z':
                re[j] = -r1; im[j] = -i1;
                break;
            case 'H':
                re[i] = (r0 + r1) * SQRT2_INV;
                im[i] = (i0 + i1) * SQRT2_INV;
                re[j] = (r0 - r1) * SQRT2_INV;
                im[j] = (i0 - i1) * SQRT2_INV;
                break;
            case 'S':
                re[j] = -i1; im[j] = r1;
                break;
            case 'T':
                const c = SQRT2_INV, s = SQRT2_INV;
                re[j] = r1 * c - i1 * s;
                im[j] = r1 * s + i1 * c;
                break;
        }
    }
}

function applyTwoQubit(gate, c, t, re, im) {
    const cm = 1 << c, tm = 1 << t;

    for (let i = 0; i < 8; i++) {
        if (!(i & cm)) continue; // Control must be 1

        switch (gate) {
            case 'CX':
                if (!(i & tm)) {
                    const j = i | tm;
                    [re[i], re[j]] = [re[j], re[i]];
                    [im[i], im[j]] = [im[j], im[i]];
                }
                break;
            case 'CZ':
                if (i & tm) {
                    re[i] = -re[i];
                    im[i] = -im[i];
                }
                break;
            case 'SWAP':
                // SWAP swaps regardless of control state
                if ((i & cm) && !(i & tm)) {
                    const j = (i ^ cm) | tm;
                    [re[i], re[j]] = [re[j], re[i]];
                    [im[i], im[j]] = [im[j], im[i]];
                }
                break;
        }
    }
}

function displayResults(re, im) {
    const labels = ['000', '001', '010', '011', '100', '101', '110', '111'];
    const data = [];

    for (let i = 0; i < 8; i++) {
        const prob = re[i] * re[i] + im[i] * im[i];
        if (prob > 0.0001) {
            data.push({ s: labels[i], p: prob, r: re[i], i: im[i] });
        }
    }
    data.sort((a, b) => b.p - a.p);

    // Probabilities
    document.getElementById('probabilities').innerHTML = data.map(d => `
        <div class="prob-bar">
            <span class="prob-label">|${d.s}⟩</span>
            <div class="prob-track"><div class="prob-fill" style="width:${d.p * 100}%"></div></div>
            <span class="prob-value">${(d.p * 100).toFixed(1)}%</span>
        </div>
    `).join('');

    // Amplitudes
    document.getElementById('state-vector').innerHTML = data.map(d => {
        let amp = Math.abs(d.i) < 0.001 ? d.r.toFixed(3) :
            Math.abs(d.r) < 0.001 ? d.i.toFixed(3) + 'i' :
                `${d.r.toFixed(2)}${d.i >= 0 ? '+' : ''}${d.i.toFixed(2)}i`;
        return `<div class="state-item"><span>|${d.s}⟩</span><span class="amplitude">${amp}</span></div>`;
    }).join('');
}

// === NAVIGATION ===
function setupBackButton() {
    const btn = document.getElementById('back-btn');
    const go = () => {
        if (window.electronAPI?.goToMenu) window.electronAPI.goToMenu();
        else window.location.href = '../index.html#menu';
    };
    btn.addEventListener('click', go);
    btn.addEventListener('touchend', e => { e.preventDefault(); go(); });
}

// === SYSTEM INFO ===
function setupSystemInfo() {
    updateSystemInfo();
    setInterval(updateSystemInfo, 5000);
}

async function updateSystemInfo() {
    const el = document.getElementById('system-info');
    if (!el) return;

    try {
        if (window.electronAPI?.getSystemInfo) {
            const info = await window.electronAPI.getSystemInfo();
            window.applySystemInfo(el, info);
        } else {
            el.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        }
    } catch (e) {
        el.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
}

// === BACKGROUND ANIMATION ===
function initBackground() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];

    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 20; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.25,
            vy: (Math.random() - 0.5) * 0.25,
            r: Math.random() * 1.5 + 0.5,
            a: Math.random() * 0.12 + 0.04
        });
    }

    const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 6.283);
            ctx.fillStyle = `rgba(100,150,255,${p.a})`;
            ctx.fill();
        }

        requestAnimationFrame(animate);
    };
    animate();
}
