/**
 * Qubibyte on-screen keyboard — touch-first, theme-aware, Electron HMI.
 */
(function initQubibyteOSK(global) {
    if (global.QubibyteOSK) return;

    const OSK_STYLE_ID = 'qubibyte-osk-styles';
    const ROOT_ID = 'qubibyte-osk';

    const LAYOUT_ALPHA = [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
        ['{shift}', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '{backspace}'],
        ['{symbols}', '{space}', '.', '{enter}', '{hide}']
    ];

    const LAYOUT_ALPHA_SHIFT = [
        ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['{shift}', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '{backspace}'],
        ['{symbols}', '{space}', ',', '{enter}', '{hide}']
    ];

    const LAYOUT_SYMBOLS = [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
        ['.', ',', '?', '!', "'", '[', ']', '{', '}', '#'],
        ['{symbols}', '%', '+', '=', '_', '\\', '|', '~', '`', '{backspace}'],
        ['{abc}', '{space}', '.', '{enter}', '{hide}']
    ];

    const LAYOUT_NUMERIC = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['-', '0', '+'],
        ['{backspace}', '.', '{enter}', '{hide}']
    ];

    let root = null;
    let stack = null;
    let preview = null;
    let previewBody = null;
    let previewInner = null;
    let previewText = null;
    let previewNav = null;
    let panel = null;
    let activeEl = null;
    let capsLockOn = false;
    let shiftSticky = false;
    let lastShiftTap = 0;
    let symbolsOn = false;
    let numericMode = false;
    let visible = false;
    let hideTimer = null;
    let enabled = false;
    let suppressUntil = 0;
    const SHIFT_DOUBLE_TAP_MS = 420;
    /** Zero-width space gives the caret inline box the same metrics as surrounding text. */
    const CARET_MARKUP = '<span class="osk-preview-caret" aria-hidden="true">\u200b</span>';

    /** Opaque fallbacks when host page lacks HMI semantic vars (e.g. circuit sim iframe). */
    const OSK_SOLID = {
        dark: {
            preview: '#12121a',
            panel: '#141423',
            key: '#1e1e30',
            border: 'rgba(255, 255, 255, 0.14)',
            text: '#ffffff',
            muted: 'rgba(255, 255, 255, 0.75)',
            selection: 'rgba(255, 255, 255, 0.12)'
        },
        light: {
            preview: '#ffffff',
            panel: '#ffffff',
            key: '#f0f0f5',
            border: 'rgba(0, 0, 0, 0.18)',
            text: '#1a1a2e',
            muted: 'rgba(26, 26, 46, 0.75)',
            selection: 'rgba(0, 0, 0, 0.08)'
        },
        midnight: {
            preview: '#1e293b',
            panel: '#1e293b',
            key: '#273449',
            border: 'rgba(148, 163, 184, 0.25)',
            text: '#e2e8f0',
            muted: 'rgba(226, 232, 240, 0.75)',
            selection: 'rgba(255, 255, 255, 0.12)'
        },
        quantum: {
            preview: '#2d1f3d',
            panel: '#2d1f3d',
            key: '#3d2a52',
            border: 'rgba(255, 255, 255, 0.12)',
            text: '#f5f0ff',
            muted: 'rgba(245, 240, 255, 0.75)',
            selection: 'rgba(255, 255, 255, 0.12)'
        }
    };

    function getActiveTheme() {
        const t = global.document.documentElement.dataset.theme;
        return OSK_SOLID[t] ? t : 'dark';
    }

    function readRootVar(name) {
        return global.getComputedStyle(global.document.documentElement)
            .getPropertyValue(name).trim();
    }

    function colorIsTranslucent(cssColor) {
        if (!cssColor) return true;
        const c = cssColor.toLowerCase();
        if (c === 'transparent') return true;
        if (/^#[0-9a-f]{4}$/i.test(c)) {
            return parseInt(c[3], 16) < 15;
        }
        if (/^#[0-9a-f]{8}$/i.test(c)) {
            return parseInt(c.slice(6, 8), 16) < 250;
        }
        if (/^#[0-9a-f]{3,6}$/i.test(c)) return false;
        const rgba = c.match(/^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/);
        if (rgba) return parseFloat(rgba[1]) < 0.98;
        return false;
    }

    function firstOpaqueVar(names) {
        for (const name of names) {
            const value = readRootVar(name);
            if (value && !colorIsTranslucent(value)) return value;
        }
        return '';
    }

    function syncOskThemeSurfaces() {
        if (!root) return;
        const solid = OSK_SOLID[getActiveTheme()];

        const previewBg = firstOpaqueVar([
            '--bg-secondary',
            '--bg-tertiary',
            '--bg-primary',
            '--bg-card',
            '--panel-bg',
            '--surface-solid'
        ]) || solid.preview;

        const panelBg = firstOpaqueVar([
            '--bg-secondary',
            '--bg-primary',
            '--bg-card',
            '--panel-bg',
            '--surface-solid'
        ]) || solid.panel;

        const inputBg = readRootVar('--input-bg');
        const keyBg = inputBg && !colorIsTranslucent(inputBg)
            ? inputBg
            : (firstOpaqueVar(['--bg-tertiary', '--bg-card']) || solid.key);

        root.style.setProperty('--osk-preview-bg', previewBg);
        root.style.setProperty('--osk-bg', panelBg);
        root.style.setProperty('--osk-key-bg', keyBg);
        root.style.setProperty('--osk-key-border', readRootVar('--input-border') || readRootVar('--border-color') || solid.border);
        root.style.setProperty('--osk-key-text', readRootVar('--text-primary') || solid.text);
        root.style.setProperty('--osk-key-muted', readRootVar('--text-secondary') || solid.muted);
        root.style.setProperty('--osk-accent', readRootVar('--accent-blue') || '#0ea5e9');
        root.style.setProperty('--osk-shadow', readRootVar('--shadow-color') || 'rgba(0, 0, 0, 0.55)');
        root.style.setProperty('--osk-selection', readRootVar('--surface-overlay-strong') || solid.selection);
    }

    function injectStyles() {
        if (global.document.getElementById(OSK_STYLE_ID)) return;
        const style = global.document.createElement('style');
        style.id = OSK_STYLE_ID;
        style.textContent = `
#${ROOT_ID} {
    --osk-bg: var(--panel-bg, rgba(20, 20, 35, 0.97));
    --osk-key-bg: var(--input-bg, rgba(255, 255, 255, 0.08));
    --osk-key-border: var(--input-border, rgba(255, 255, 255, 0.14));
    --osk-key-text: var(--text-primary, #fff);
    --osk-key-muted: var(--text-secondary, rgba(255, 255, 255, 0.75));
    --osk-accent: var(--accent-blue, #0ea5e9);
    --osk-accent-text: var(--on-accent, #fff);
    --osk-shadow: var(--shadow-color, rgba(0, 0, 0, 0.55));
    --osk-preview-bg: var(--bg-secondary, var(--bg-primary, #12121a));
    --osk-preview-border: var(--input-border, rgba(255, 255, 255, 0.14));
    --osk-selection: var(--surface-overlay-strong, rgba(255, 255, 255, 0.12));
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100000;
    display: flex;
    justify-content: center;
    padding: 0 10px max(10px, env(safe-area-inset-bottom, 0px));
    pointer-events: none;
    transform: translateY(105%);
    opacity: 0;
    visibility: hidden;
    transition: transform 0.34s cubic-bezier(0.22, 1, 0.36, 1),
        opacity 0.28s ease, visibility 0.34s;
}
#${ROOT_ID}.is-open {
    pointer-events: auto;
    transform: translateY(0);
    opacity: 1;
    visibility: visible;
}
#${ROOT_ID} .osk-stack {
    width: min(100%, 1180px);
    display: flex;
    flex-direction: column;
    gap: 10px;
}
#${ROOT_ID} .osk-preview {
    border-radius: 8px;
    border: 1px solid var(--osk-preview-border);
    background: var(--osk-preview-bg);
    overflow: hidden;
    color: var(--osk-key-text);
}
#${ROOT_ID} .osk-preview-body {
    display: flex;
    align-items: stretch;
    gap: 10px;
    padding: 12px 12px 12px 16px;
    min-height: 58px;
    max-height: 88px;
}
#${ROOT_ID} .osk-preview.is-multiline .osk-preview-body {
    min-height: 72px;
    max-height: min(28vh, 200px);
}
#${ROOT_ID} .osk-preview-inner {
    flex: 1 1 auto;
    min-width: 0;
    max-height: inherit;
    overflow-x: auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
}
#${ROOT_ID} .osk-preview-nav {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    flex-shrink: 0;
    gap: 5px;
    align-self: stretch;
}
#${ROOT_ID} .osk-nav-stack {
    display: none;
    flex-direction: column;
    gap: 4px;
    width: 52px;
    min-width: 52px;
    align-self: stretch;
}
#${ROOT_ID} .osk-preview-nav--multiline .osk-nav-stack {
    display: flex;
}
#${ROOT_ID} .osk-nav-key {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    min-width: 52px;
    margin: 0;
    padding: 0;
    border: 1px solid var(--osk-key-border);
    border-radius: 8px;
    background: var(--osk-key-bg);
    color: var(--osk-key-text);
    font-family: var(--font-display, system-ui, sans-serif);
    font-size: clamp(20px, 2.6vw, 26px);
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition: transform 0.08s ease, background 0.12s ease, border-color 0.12s ease;
}
#${ROOT_ID} .osk-nav-key--lr {
    align-self: stretch;
    flex: 1 1 auto;
    min-height: 0;
}
#${ROOT_ID} .osk-nav-stack .osk-nav-key {
    flex: 1 1 50%;
    width: 100%;
    min-width: 0;
    min-height: 0;
    font-size: clamp(17px, 2.2vw, 22px);
}
#${ROOT_ID} .osk-nav-key:active,
#${ROOT_ID} .osk-nav-key.is-pressed {
    transform: scale(0.94);
    background: color-mix(in srgb, var(--osk-accent) 22%, var(--osk-key-bg));
    border-color: var(--osk-accent);
}
#${ROOT_ID} .osk-preview.is-single-line .osk-preview-inner {
    overflow-y: hidden;
}
#${ROOT_ID} .osk-preview-text {
    position: relative;
    font-family: var(--font-primary, system-ui, sans-serif);
    font-size: clamp(30px, 4.2vw, 44px);
    font-weight: 500;
    line-height: 1.25;
    letter-spacing: normal;
    color: inherit;
    word-break: break-word;
    white-space: pre-wrap;
}
#${ROOT_ID} .osk-preview.is-single-line .osk-preview-text {
    white-space: nowrap;
}
#${ROOT_ID} .osk-preview-caret {
    display: inline;
    width: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
    vertical-align: baseline;
}
#${ROOT_ID} .osk-preview-caret-bar {
    position: absolute;
    left: 0;
    top: 0;
    width: 2px;
    background: currentColor;
    border-radius: 1px;
    pointer-events: none;
    will-change: transform, height;
    animation: osk-caret-blink 1.05s step-end infinite;
}
#${ROOT_ID} .osk-preview-selection {
    background: var(--osk-selection);
    color: inherit;
    border-radius: 3px;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
}
@keyframes osk-caret-blink {
    50% { opacity: 0; }
}
#${ROOT_ID} .osk-panel {
    width: 100%;
    border-radius: var(--border-radius-lg, 16px) var(--border-radius-lg, 16px)
        var(--border-radius, 12px) var(--border-radius, 12px);
    border: 1px solid var(--osk-key-border);
    background: var(--osk-bg);
    box-shadow: 0 -12px 40px var(--osk-shadow),
        0 0 0 1px color-mix(in srgb, var(--osk-key-border) 65%, transparent);
    padding: 12px 12px 14px;
}
#${ROOT_ID} .osk-row {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 8px;
}
#${ROOT_ID} .osk-row:last-child { margin-bottom: 0; }
#${ROOT_ID} .osk-key {
    flex: 1 1 0;
    min-width: 0;
    min-height: 54px;
    max-height: 62px;
    padding: 0 6px;
    border: 1px solid var(--osk-key-border);
    border-radius: 10px;
    background: var(--osk-key-bg);
    color: var(--osk-key-text);
    font-family: var(--font-display, system-ui, sans-serif);
    font-size: clamp(17px, 2.1vw, 22px);
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition: transform 0.08s ease, background 0.12s ease, border-color 0.12s ease,
        box-shadow 0.12s ease;
}
#${ROOT_ID} .osk-key:active,
#${ROOT_ID} .osk-key.is-pressed {
    transform: scale(0.94);
    background: color-mix(in srgb, var(--osk-accent) 22%, var(--osk-key-bg));
    border-color: var(--osk-accent);
}
#${ROOT_ID} .osk-key--wide { flex: 1.35 1 0; }
#${ROOT_ID} .osk-key--wider { flex: 1.7 1 0; }
#${ROOT_ID} .osk-key--space { flex: 4.5 1 0; }
#${ROOT_ID} .osk-key--action {
    font-size: clamp(14px, 1.7vw, 17px);
    color: var(--osk-key-muted);
}
#${ROOT_ID} .osk-key--accent {
    background: color-mix(in srgb, var(--osk-accent) 88%, #000 12%);
    border-color: color-mix(in srgb, var(--osk-accent) 70%, var(--osk-key-border));
    color: var(--osk-accent-text);
}
#${ROOT_ID} .osk-key--active {
    background: color-mix(in srgb, var(--osk-accent) 35%, var(--osk-key-bg));
    border-color: var(--osk-accent);
    color: var(--osk-key-text);
}
html.osk-open body {
    padding-bottom: var(--osk-panel-height, 0px);
}
`;
        global.document.head.appendChild(style);
    }

    function readSettings() {
        try {
            const raw = global.localStorage.getItem('qubibyte-settings');
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    function isEnabled() {
        const settings = readSettings();
        if (typeof settings.onScreenKeyboard === 'boolean') {
            return settings.onScreenKeyboard;
        }
        return Boolean(global.electronAPI?.isRaspberryPi);
    }

    function setEnabled(on) {
        enabled = Boolean(on);
        if (!enabled) hide(true);
    }

    function refreshEnabled() {
        setEnabled(isEnabled());
    }

    function isTextField(el) {
        if (!el || el === global.document.body) return false;
        if (el.closest && el.closest(`#${ROOT_ID}`)) return false;
        if (el.isContentEditable) return true;
        if (el.tagName === 'TEXTAREA') return true;
        if (el.tagName !== 'INPUT') return false;
        const skip = new Set([
            'button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'hidden',
            'range', 'color', 'date', 'time', 'datetime-local', 'month', 'week'
        ]);
        return !skip.has((el.type || 'text').toLowerCase());
    }

    function wantsNumeric(el) {
        if (!el || el.tagName !== 'INPUT') return false;
        const t = (el.type || '').toLowerCase();
        return t === 'number' || t === 'tel';
    }

    function isMultilineField(el) {
        if (!el) return false;
        if (el.tagName === 'TEXTAREA') return true;
        if (el.isContentEditable) {
            return el.getAttribute('contenteditable') !== 'false';
        }
        return false;
    }

    function usesShiftLayout() {
        if (numericMode || symbolsOn) return false;
        return capsLockOn || shiftSticky;
    }

    function currentLayout() {
        if (numericMode) return LAYOUT_NUMERIC;
        if (symbolsOn) return LAYOUT_SYMBOLS;
        return usesShiftLayout() ? LAYOUT_ALPHA_SHIFT : LAYOUT_ALPHA;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getFieldValue(el) {
        if (!el) return '';
        if (el.isContentEditable) {
            return (el.innerText || el.textContent || '').replace(/\r\n/g, '\n');
        }
        return el.value ?? '';
    }

    function getLineColumn(text, pos) {
        const safe = Math.max(0, Math.min(pos, text.length));
        const before = text.slice(0, safe);
        const parts = before.split('\n');
        return { lineIdx: parts.length - 1, col: parts[parts.length - 1].length };
    }

    function positionFromLineCol(text, lineIdx, col) {
        const lines = text.split('\n');
        if (lineIdx < 0 || lineIdx >= lines.length) return null;
        const clampedCol = Math.min(Math.max(0, col), lines[lineIdx].length);
        let pos = 0;
        for (let i = 0; i < lineIdx; i += 1) {
            pos += lines[i].length + 1;
        }
        return pos + clampedCol;
    }

    function setCaretPosition(el, offset) {
        if (!el) return;
        const text = getFieldValue(el);
        const pos = Math.max(0, Math.min(offset, text.length));

        if (el.isContentEditable) {
            const sel = global.getSelection();
            if (!sel) return;
            const range = global.document.createRange();
            let remain = pos;
            let lastText = null;
            const walker = global.document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();
            while (node) {
                lastText = node;
                const len = node.nodeValue?.length ?? 0;
                if (remain <= len) {
                    range.setStart(node, remain);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    return;
                }
                remain -= len;
                node = walker.nextNode();
            }
            if (lastText) {
                range.setStart(lastText, lastText.nodeValue.length);
            } else {
                range.selectNodeContents(el);
                range.collapse(true);
            }
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
        }

        if (typeof el.setSelectionRange === 'function') {
            el.setSelectionRange(pos, pos);
        }
    }

    function caretAnchor(start, end, towardStart) {
        if (start === end) return start;
        return towardStart ? Math.min(start, end) : Math.max(start, end);
    }

    function moveCaretHorizontal(dir) {
        const el = activeEl;
        if (!el) return;
        const { start, end } = getSelectionRange(el);
        const towardStart = dir < 0;
        let pos = caretAnchor(start, end, towardStart);
        if (start === end) {
            pos += dir;
        }
        setCaretPosition(el, pos);
        refocusActive();
        updatePreview();
    }

    function moveCaretVertical(dir) {
        const el = activeEl;
        if (!el || !isMultilineField(el)) return;
        const text = getFieldValue(el);
        const lines = text.split('\n');
        if (lines.length <= 1) return;

        const { start, end } = getSelectionRange(el);
        const pos = caretAnchor(start, end, dir < 0);
        const { lineIdx, col } = getLineColumn(text, pos);
        const nextLine = lineIdx + dir;
        const nextPos = positionFromLineCol(text, nextLine, col);
        if (nextPos === null) return;

        setCaretPosition(el, nextPos);
        refocusActive();
        updatePreview();
    }

    function updatePreviewNav() {
        if (!previewNav) return;
        const multiline = Boolean(activeEl && isMultilineField(activeEl));
        previewNav.classList.toggle('osk-preview-nav--multiline', multiline);
    }

    function handleNavAction(action) {
        if (!activeEl) return;
        if (action === 'left') moveCaretHorizontal(-1);
        else if (action === 'right') moveCaretHorizontal(1);
        else if (action === 'up') moveCaretVertical(-1);
        else if (action === 'down') moveCaretVertical(1);
    }

    function getSelectionRange(el) {
        if (!el) return { start: 0, end: 0 };
        if (el.isContentEditable) {
            const sel = global.getSelection();
            if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
            const range = sel.getRangeAt(0);
            if (!el.contains(range.startContainer)) {
                const len = getFieldValue(el).length;
                return { start: len, end: len };
            }
            const pre = range.cloneRange();
            pre.selectNodeContents(el);
            pre.setEnd(range.startContainer, range.startOffset);
            const start = pre.toString().length;
            const post = range.cloneRange();
            post.selectNodeContents(el);
            post.setEnd(range.endContainer, range.endOffset);
            const end = post.toString().length;
            return { start, end };
        }
        const len = (el.value ?? '').length;
        const start = el.selectionStart ?? len;
        const end = el.selectionEnd ?? start;
        return { start, end };
    }

    function displayValue(el, value) {
        if (el.tagName === 'INPUT' && (el.type || '').toLowerCase() === 'password') {
            return '•'.repeat(value.length);
        }
        return value;
    }

    function rangeRect(range) {
        if (!range) return null;
        const rect = range.getBoundingClientRect();
        if (rect.width || rect.height) return rect;
        return null;
    }

    function isPreviewCaretAtLineStart(marker) {
        const prev = marker.previousSibling;
        if (!prev) return true;
        if (prev.nodeType === 3) return prev.data.endsWith('\n');
        return false;
    }

    function glyphRectBesideCaret(marker, atLineStart) {
        if (atLineStart) {
            const next = marker.nextSibling;
            if (next?.nodeType === 3 && next.data.length) {
                const r = global.document.createRange();
                r.setStart(next, 0);
                r.setEnd(next, 1);
                return rangeRect(r);
            }
            return null;
        }
        const prev = marker.previousSibling;
        if (prev?.nodeType === 3 && prev.data.length) {
            const last = prev.data[prev.data.length - 1];
            if (last !== '\n') {
                const r = global.document.createRange();
                r.setStart(prev, prev.data.length - 1);
                r.setEnd(prev, prev.data.length);
                return rangeRect(r);
            }
        }
        const next = marker.nextSibling;
        if (next?.nodeType === 3 && next.data.length) {
            const r = global.document.createRange();
            r.setStart(next, 0);
            r.setEnd(next, 1);
            return rangeRect(r);
        }
        return null;
    }

    function caretInsertRect(marker) {
        const r = global.document.createRange();
        if (marker.firstChild) {
            r.setStart(marker.firstChild, 0);
            r.setEnd(marker.firstChild, 1);
        } else {
            r.selectNodeContents(marker);
            r.collapse(true);
        }
        return rangeRect(r) || marker.getBoundingClientRect();
    }

    function layoutCaretOverlay() {
        if (!previewText) return;

        const marker = previewText.querySelector('.osk-preview-caret');
        let bar = previewText.querySelector('.osk-preview-caret-bar');

        if (!marker) {
            if (bar) bar.remove();
            return;
        }

        if (!bar) {
            bar = global.document.createElement('span');
            bar.className = 'osk-preview-caret-bar';
            bar.setAttribute('aria-hidden', 'true');
            previewText.appendChild(bar);
        }

        const hostRect = previewText.getBoundingClientRect();
        const insertRect = caretInsertRect(marker);
        const atLineStart = isPreviewCaretAtLineStart(marker);
        const glyphRect = glyphRectBesideCaret(marker, atLineStart);
        const cs = global.getComputedStyle(previewText);
        const fontSize = parseFloat(cs.fontSize) || 32;
        const lineHeight = parseFloat(cs.lineHeight);
        const lh = Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.25;

        const barHeight = Math.round((glyphRect?.height || insertRect.height || fontSize) * 0.9)
            || Math.round(fontSize * 0.85);
        const refHeight = atLineStart
            ? (insertRect.height || lh)
            : (glyphRect?.height || insertRect.height || lh);
        const refTop = atLineStart ? insertRect.top : (glyphRect?.top ?? insertRect.top);
        const top = refTop - hostRect.top + Math.max(0, (refHeight - barHeight) / 2);
        const left = insertRect.left - hostRect.left;

        bar.style.height = `${barHeight}px`;
        bar.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }

    function scrollPreviewCaretIntoView(multiline) {
        if (!previewInner) return;
        const bar = previewText?.querySelector('.osk-preview-caret-bar');
        if (!bar) return;

        if (multiline) {
            const barRect = bar.getBoundingClientRect();
            const innerRect = previewInner.getBoundingClientRect();
            const pad = 6;
            if (barRect.bottom > innerRect.bottom - pad) {
                previewInner.scrollTop += barRect.bottom - innerRect.bottom + pad;
            } else if (barRect.top < innerRect.top + pad) {
                previewInner.scrollTop -= innerRect.top - barRect.top + pad;
            }
            return;
        }

        const marker = previewText.querySelector('.osk-preview-caret');
        if (marker && typeof marker.scrollIntoView === 'function') {
            marker.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        }
    }

    function updatePreview() {
        if (!preview || !previewText || !activeEl) return;

        const multiline = isMultilineField(activeEl);
        preview.classList.toggle('is-multiline', multiline);
        preview.classList.toggle('is-single-line', !multiline);
        updatePreviewNav();

        const raw = getFieldValue(activeEl);
        const { start, end } = getSelectionRange(activeEl);
        const text = displayValue(activeEl, raw);

        let html = '';
        if (start === end) {
            html = `${escapeHtml(text.slice(0, start))}${CARET_MARKUP}${escapeHtml(text.slice(start))}`;
        } else {
            html = `${escapeHtml(text.slice(0, start))}<span class="osk-preview-selection">${escapeHtml(text.slice(start, end))}</span>${escapeHtml(text.slice(end))}`;
        }

        if (!text && start === 0) {
            html = CARET_MARKUP;
        }

        previewText.innerHTML = html;
        preview.setAttribute('aria-live', 'polite');

        global.requestAnimationFrame(() => {
            layoutCaretOverlay();
            scrollPreviewCaretIntoView(multiline);
            global.requestAnimationFrame(() => {
                layoutCaretOverlay();
                scrollPreviewCaretIntoView(multiline);
            });
        });
    }

    function syncPreviewListeners(el) {
        if (!el || el._qubibyteOskPreviewBound) return;
        el.addEventListener('input', updatePreview);
        el.addEventListener('keyup', updatePreview);
        el.addEventListener('click', updatePreview);
        el._qubibyteOskPreviewBound = true;
    }

    function labelForToken(token) {
        const map = {
            '{shift}': capsLockOn ? '⇪' : '⇧',
            '{backspace}': '⌫',
            '{enter}': 'Enter',
            '{hide}': '▼',
            '{space}': 'Space',
            '{symbols}': symbolsOn ? 'ABC' : '?123',
            '{abc}': 'ABC'
        };
        return map[token] || token;
    }

    function classForToken(token) {
        if (token === '{space}') return 'osk-key osk-key--space';
        if (token === '{backspace}') return 'osk-key osk-key--wider osk-key--action';
        if (token === '{enter}') return 'osk-key osk-key--wider osk-key--accent';
        if (token === '{hide}') return 'osk-key osk-key--wide osk-key--action';
        if (token === '{shift}' || token === '{symbols}' || token === '{abc}') {
            const shiftActive = token === '{shift}' && (capsLockOn || shiftSticky);
            return `osk-key osk-key--wide osk-key--action${shiftActive ? ' osk-key--active' : ''}${symbolsOn && token === '{symbols}' ? ' osk-key--active' : ''}`;
        }
        return 'osk-key';
    }

    function consumeShiftSticky() {
        if (capsLockOn || symbolsOn || numericMode) return;
        if (shiftSticky) {
            shiftSticky = false;
            renderKeys();
        }
    }

    function renderKeys() {
        if (!panel) return;
        panel.replaceChildren();
        const layout = currentLayout();

        layout.forEach((row) => {
            const rowEl = global.document.createElement('div');
            rowEl.className = 'osk-row';
            row.forEach((token) => {
                const btn = global.document.createElement('button');
                btn.type = 'button';
                btn.className = classForToken(token);
                btn.textContent = labelForToken(token);
                btn.dataset.token = token;
                btn.setAttribute('aria-label', labelForToken(token));
                rowEl.appendChild(btn);
            });
            panel.appendChild(rowEl);
        });
    }

    function buildDom() {
        if (root) return;
        injectStyles();
        root = global.document.createElement('div');
        root.id = ROOT_ID;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'On-screen keyboard');
        root.hidden = true;

        stack = global.document.createElement('div');
        stack.className = 'osk-stack';

        preview = global.document.createElement('div');
        preview.className = 'osk-preview is-single-line';

        previewBody = global.document.createElement('div');
        previewBody.className = 'osk-preview-body';

        previewInner = global.document.createElement('div');
        previewInner.className = 'osk-preview-inner';
        previewText = global.document.createElement('div');
        previewText.className = 'osk-preview-text';
        previewInner.appendChild(previewText);
        previewBody.appendChild(previewInner);

        previewNav = global.document.createElement('div');
        previewNav.className = 'osk-preview-nav';
        previewNav.setAttribute('role', 'group');
        previewNav.setAttribute('aria-label', 'Move cursor');

        const navLeft = global.document.createElement('button');
        navLeft.type = 'button';
        navLeft.className = 'osk-nav-key osk-nav-key--lr';
        navLeft.dataset.nav = 'left';
        navLeft.setAttribute('aria-label', 'Move cursor left');
        navLeft.textContent = '←';

        const navStack = global.document.createElement('div');
        navStack.className = 'osk-nav-stack';

        const navUp = global.document.createElement('button');
        navUp.type = 'button';
        navUp.className = 'osk-nav-key';
        navUp.dataset.nav = 'up';
        navUp.setAttribute('aria-label', 'Move cursor up');
        navUp.textContent = '↑';

        const navDown = global.document.createElement('button');
        navDown.type = 'button';
        navDown.className = 'osk-nav-key';
        navDown.dataset.nav = 'down';
        navDown.setAttribute('aria-label', 'Move cursor down');
        navDown.textContent = '↓';

        navStack.appendChild(navUp);
        navStack.appendChild(navDown);

        const navRight = global.document.createElement('button');
        navRight.type = 'button';
        navRight.className = 'osk-nav-key osk-nav-key--lr';
        navRight.dataset.nav = 'right';
        navRight.setAttribute('aria-label', 'Move cursor right');
        navRight.textContent = '→';

        previewNav.append(navLeft, navStack, navRight);
        previewBody.appendChild(previewNav);
        preview.appendChild(previewBody);
        stack.appendChild(preview);

        previewNav.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-nav]');
            if (!btn) return;
            btn.classList.add('is-pressed');
            global.setTimeout(() => btn.classList.remove('is-pressed'), 120);
            handleNavAction(btn.dataset.nav);
        });

        panel = global.document.createElement('div');
        panel.className = 'osk-panel';
        stack.appendChild(panel);
        root.appendChild(stack);
        renderKeys();

        root.addEventListener('mousedown', (e) => e.preventDefault());
        root.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

        root.addEventListener('click', (e) => {
            const btn = e.target.closest('.osk-key');
            if (!btn) return;
            btn.classList.add('is-pressed');
            global.setTimeout(() => btn.classList.remove('is-pressed'), 120);
            handleToken(btn.dataset.token);
        });

        global.document.body.appendChild(root);
        syncOskThemeSurfaces();
    }

    function updatePanelHeightVar() {
        if (!stack) return;
        global.requestAnimationFrame(() => {
            const h = stack.getBoundingClientRect().height + 24;
            global.document.documentElement.style.setProperty('--osk-panel-height', `${Math.ceil(h)}px`);
        });
    }

    function showFor(el) {
        if (!enabled || !isTextField(el)) return;
        buildDom();
        syncOskThemeSurfaces();
        activeEl = el;
        numericMode = wantsNumeric(el);
        capsLockOn = false;
        shiftSticky = false;
        lastShiftTap = 0;
        if (numericMode) {
            symbolsOn = false;
        }
        syncPreviewListeners(el);
        renderKeys();
        updatePreviewNav();
        updatePreview();

        if (!visible) {
            root.hidden = false;
            global.requestAnimationFrame(() => {
                root.classList.add('is-open');
                global.document.documentElement.classList.add('osk-open');
                updatePanelHeightVar();
            });
            visible = true;
        } else {
            updatePreview();
            updatePanelHeightVar();
        }
    }

    function hide(immediate) {
        if (!root || !visible) return;
        clearTimeout(hideTimer);
        const done = () => {
            root.classList.remove('is-open');
            global.document.documentElement.classList.remove('osk-open');
            global.document.documentElement.style.removeProperty('--osk-panel-height');
            root.hidden = true;
            visible = false;
            activeEl = null;
        };
        if (immediate) {
            done();
        } else {
            hideTimer = global.setTimeout(done, 280);
        }
    }

    function refocusActive() {
        if (activeEl && typeof activeEl.focus === 'function') {
            try {
                activeEl.focus({ preventScroll: true });
            } catch {
                activeEl.focus();
            }
        }
    }

    function insertText(text) {
        const el = activeEl;
        if (!el) return;

        if (el.isContentEditable) {
            refocusActive();
            global.document.execCommand('insertText', false, text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            updatePreview();
            consumeShiftSticky();
            return;
        }

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? start;
            const val = el.value ?? '';
            el.value = val.slice(0, start) + text + val.slice(end);
            const pos = start + text.length;
            if (typeof el.setSelectionRange === 'function') {
                el.setSelectionRange(pos, pos);
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            refocusActive();
            updatePreview();
            consumeShiftSticky();
        }
    }

    function backspace() {
        const el = activeEl;
        if (!el) return;

        if (el.isContentEditable) {
            refocusActive();
            global.document.execCommand('delete', false, null);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            updatePreview();
            return;
        }

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            const start = el.selectionStart ?? 0;
            const end = el.selectionEnd ?? start;
            const val = el.value ?? '';
            if (start !== end) {
                el.value = val.slice(0, start) + val.slice(end);
                el.setSelectionRange(start, start);
            } else if (start > 0) {
                el.value = val.slice(0, start - 1) + val.slice(start);
                el.setSelectionRange(start - 1, start - 1);
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            refocusActive();
            updatePreview();
        }
    }

    function submitEnter() {
        const el = activeEl;
        if (!el) {
            hide();
            return;
        }
        if (el.tagName === 'TEXTAREA') {
            insertText('\n');
            return;
        }
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
        if (el.form) {
            const submit = el.form.querySelector('button[type="submit"], input[type="submit"]');
            if (submit) submit.click();
        }
        hide();
        if (typeof el.blur === 'function') el.blur();
    }

    function handleToken(token) {
        if (!token) return;
        if (token === '{shift}') {
            handleShiftKey();
            return;
        }
        if (token === '{symbols}') {
            symbolsOn = !symbolsOn;
            if (symbolsOn) {
                capsLockOn = false;
                shiftSticky = false;
            }
            renderKeys();
            refocusActive();
            return;
        }
        if (token === '{abc}') {
            symbolsOn = false;
            renderKeys();
            refocusActive();
            return;
        }
        if (token === '{backspace}') {
            backspace();
            return;
        }
        if (token === '{enter}') {
            submitEnter();
            return;
        }
        if (token === '{hide}') {
            suppressUntil = Date.now() + 400;
            hide();
            if (activeEl && typeof activeEl.blur === 'function') activeEl.blur();
            return;
        }
        if (token === '{space}') {
            insertText(' ');
            return;
        }
        insertText(token);
    }

    function handleShiftKey() {
        const now = Date.now();

        if (capsLockOn) {
            capsLockOn = false;
            shiftSticky = false;
            lastShiftTap = 0;
            renderKeys();
            refocusActive();
            return;
        }

        if (lastShiftTap && now - lastShiftTap < SHIFT_DOUBLE_TAP_MS) {
            capsLockOn = true;
            shiftSticky = false;
            lastShiftTap = 0;
            renderKeys();
            refocusActive();
            return;
        }

        lastShiftTap = now;
        shiftSticky = true;
        renderKeys();
        refocusActive();

        global.setTimeout(() => {
            if (lastShiftTap === now) {
                lastShiftTap = 0;
            }
        }, SHIFT_DOUBLE_TAP_MS);
    }

    function onFocusIn(e) {
        if (!enabled) return;
        const el = e.target;
        if (!isTextField(el) || el.readOnly || el.disabled) return;
        clearTimeout(hideTimer);
        showFor(el);
    }

    function onFocusOut() {
        if (!enabled) return;
        if (Date.now() < suppressUntil) return;
        hideTimer = global.setTimeout(() => {
            if (activeEl && global.document.activeElement === activeEl) return;
            hide();
        }, 180);
    }

    function onKeyDown(e) {
        if (!enabled || !visible) return;
        if (e.key === 'Escape') {
            suppressUntil = Date.now() + 400;
            hide();
            if (activeEl && typeof activeEl.blur === 'function') activeEl.blur();
        }
    }

    function attach() {
        if (global.__qubibyteOskAttached) return;
        global.__qubibyteOskAttached = true;
        enabled = isEnabled();
        global.document.addEventListener('focusin', onFocusIn, true);
        global.document.addEventListener('focusout', onFocusOut, true);
        global.document.addEventListener('keydown', onKeyDown, true);
        global.addEventListener('qubibyte-theme-change', syncOskThemeSurfaces);
        global.document.addEventListener('DOMContentLoaded', syncOskThemeSurfaces);
        if (global.electronAPI?.onSettingsUpdated) {
            global.electronAPI.onSettingsUpdated(() => refreshEnabled());
        }
        global.addEventListener('storage', (e) => {
            if (e.key === 'qubibyte-settings') refreshEnabled();
        });
    }

    function boot() {
        attach();
        refreshEnabled();
    }

    global.QubibyteOSK = {
        isEnabled,
        setEnabled,
        refreshEnabled,
        showFor,
        hide,
        attach,
        boot
    };

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})(typeof window !== 'undefined' ? window : globalThis);
