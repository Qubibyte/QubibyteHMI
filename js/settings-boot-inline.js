/** Block settings UI until settings.js applies saved values (prevents toggle flash). */
(function () {
    document.documentElement.classList.add('settings-hydrating');
})();
