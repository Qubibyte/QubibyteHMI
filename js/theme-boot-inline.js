/* Sync-blocking theme boot — must run first in <head> (before CSS) to prevent flash */
(function () {
    var THEMES = { dark: 1, light: 1, midnight: 1, quantum: 1 };
    var PAINT = {
        dark: { bg: '#0a0a0f', fg: '#ffffff', scheme: 'dark' },
        light: { bg: '#f0f0f5', fg: '#1a1a2e', scheme: 'light' },
        midnight: { bg: '#0f172a', fg: '#e2e8f0', scheme: 'dark' },
        quantum: { bg: '#1a0a25', fg: '#f5f0ff', scheme: 'dark' }
    };

    var t = window.QUBIBYTE_THEME;
    try {
        t = t || localStorage.getItem('qubibyte-theme');
    } catch (e) {}

    t = THEMES[t] ? t : 'dark';
    var paint = PAINT[t];
    var root = document.documentElement;

    root.setAttribute('data-theme', t);
    root.style.colorScheme = paint.scheme;
    root.style.backgroundColor = paint.bg;
    root.style.color = paint.fg;
    window.QUBIBYTE_THEME = t;

    var critical = document.createElement('style');
    critical.id = 'qubibyte-theme-critical';
    critical.textContent =
        'html,body{background:' + paint.bg + '!important;color:' + paint.fg + '!important}' +
        'html{color-scheme:' + paint.scheme + '!important}';
    (document.head || root).appendChild(critical);
})();
