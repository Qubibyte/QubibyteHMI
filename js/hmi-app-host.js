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
    updateSystemInfo();
    setInterval(updateSystemInfo, 5000);
}

async function updateSystemInfo() {
    const infoEl = document.getElementById('system-info');
    if (!infoEl) return;

    if (window.electronAPI?.getSystemInfo) {
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
    return new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}
