/**
 * Start iframe load immediately (before DOMContentLoaded / hydrateFromDisk).
 * Pair with embed-viewer.js — avoids white iframe while waiting on async IPC.
 */
(function () {
    var frame = document.getElementById('embed-frame');
    if (!frame || frame.src) return;

    var path = (document.body && document.body.dataset.qubibytePath) || 'index.html';
    var theme = window.QUBIBYTE_THEME || 'dark';
    try {
        theme = localStorage.getItem('qubibyte-theme') || theme;
    } catch (e) {}

    var bg = {
        dark: '#0a0a1a',
        light: '#f0f0f5',
        midnight: '#0f172a',
        quantum: '#1a0a25'
    };
    var paint = bg[theme] || bg.dark;
    frame.style.backgroundColor = paint;
    frame.style.opacity = '0';

    var clean = path.replace(/^\//, '');
    var sep = clean.indexOf('?') >= 0 ? '&' : '?';
    frame.src = 'qubibyte://local/' + clean + sep + 'theme=' + encodeURIComponent(theme);
})();
