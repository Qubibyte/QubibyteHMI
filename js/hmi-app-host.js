/**
 * Shared chrome for HMI-hosted simulator apps (circuit builder, NMR).
 */
document.addEventListener('DOMContentLoaded', () => {
    setupBackButton();
    setupSystemInfo();
});

function setupBackButton() {
    const backBtn = document.getElementById('embed-back');
    if (!backBtn) return;

    const handler = (e) => {
        e.preventDefault();
        if (window.electronAPI?.goToMenu) {
            window.electronAPI.goToMenu();
        } else {
            window.location.href = '../index.html#menu';
        }
    };

    backBtn.addEventListener('click', handler);
    backBtn.addEventListener('touchend', handler);
}

function setupSystemInfo() {
    window.setupHeaderInfo?.();
}

function formatTime() {
    return new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}
