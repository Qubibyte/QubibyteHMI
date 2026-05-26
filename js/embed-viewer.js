/**

 * HMI chrome + iframe loader for QubibyteWebsite apps (swap QubibyteWebsite folder anytime).

 * Website themes: built into QubibyteWebsite (js/theme.js). HMI syncs via localStorage / QUBIBYTE_THEME.

 * embed-boot-inline.js starts the iframe load before this file runs.

 */

document.addEventListener('DOMContentLoaded', () => {

    const frame = document.getElementById('embed-frame');

    const path = document.body.dataset.qubibytePath || 'index.html';



    if (frame) {

        frame.addEventListener('load', () => {

            frame.style.opacity = '1';

            syncThemeToEmbed(frame);

        });



        const bootEmbed = async () => {

            await pushThemeToWebsiteStorage();

            await pushSoftwareModeToWebsiteStorage();

            await getLocalHttpOrigin();



            const theme = window.QubibyteTheme?.get?.() ||

                document.documentElement.dataset.theme ||

                'dark';



            paintEmbedFrame(frame, theme);



            if (!frame.src) {

                const clean = path.replace(/^\//, '');

                const sep = clean.includes('?') ? '&' : '?';

                frame.style.opacity = '0';

                frame.src = `qubibyte://local/${clean}${sep}theme=${encodeURIComponent(theme)}`;

            } else if (window.QubibyteTheme?.hydrateFromDisk) {

                window.QubibyteTheme.hydrateFromDisk().catch(() => {});

            }

        };



        if (window.QubibyteTheme?.hydrateFromDisk && !frame.src) {

            window.QubibyteTheme.hydrateFromDisk().finally(bootEmbed);

        } else {

            bootEmbed();

        }

    }



    window.addEventListener('qubibyte-theme-change', () => {

        pushThemeToWebsiteStorage();

        if (frame) syncThemeToEmbed(frame);

    });



    pushSoftwareModeToWebsiteStorage();



    setupBackButton();

    setupSystemInfo();

});



async function pushThemeToWebsiteStorage() {

    const theme = window.QubibyteTheme?.get?.() ||

        document.documentElement.dataset.theme ||

        'dark';



    try {

        localStorage.setItem('qubibyte-theme', theme);

    } catch (e) {

        /* ignore */

    }

}



async function pushSoftwareModeToWebsiteStorage() {
    /* Software mode is enabled inside the iframe via postMessage / enableSession only.
     * Do not set sessionStorage on the HMI shell page — qubibyte:// shares storage
     * with the iframe and would hide the website theme picker before it mounts. */
}



let cachedLocalHttpOrigin = null;



async function getLocalHttpOrigin() {

    if (cachedLocalHttpOrigin) return cachedLocalHttpOrigin;

    if (!window.electronAPI?.getLocalHttpOrigin) return '';

    try {

        const origin = await window.electronAPI.getLocalHttpOrigin();

        cachedLocalHttpOrigin = origin ? String(origin).replace(/\/$/, '') : '';

    } catch (e) {

        cachedLocalHttpOrigin = '';

    }

    return cachedLocalHttpOrigin;

}



async function pushHttpOriginToEmbed(frame) {

    const origin = await getLocalHttpOrigin();

    if (!origin || !frame?.contentWindow) return;

    try {

        frame.contentWindow.postMessage({ type: 'qubibyte-http-origin', origin }, '*');

        frame.contentWindow.QUBIBYTE_HTTP_ORIGIN = origin;

    } catch (e) {

        console.warn('Could not pass local HTTP origin to embed:', e);

    }

}



const EMBED_FRAME_BG = {

    dark: '#0a0a1a',

    light: '#f0f0f5',

    midnight: '#0f172a',

    quantum: '#1a0a25'

};



function paintEmbedFrame(frame, theme) {

    if (!frame) return;

    const bg = EMBED_FRAME_BG[theme] || EMBED_FRAME_BG.dark;

    frame.style.backgroundColor = bg;

}



function syncThemeToEmbed(frame) {

    const theme = window.QubibyteTheme?.get?.() ||

        document.documentElement.dataset.theme ||

        'dark';



    paintEmbedFrame(frame, theme);



    try {

        localStorage.setItem('qubibyte-theme', theme);

        const childTheme = frame.contentWindow?.QubibyteTheme?.get?.();

        if (childTheme !== theme) {

            frame.contentWindow?.postMessage({ type: 'qubibyte-theme', theme }, '*');

        }



        frame.contentWindow?.QubibyteSoftwareMode?.enableSession?.();

        frame.contentWindow?.postMessage({ type: 'qubibyte-software-mode', enabled: true }, '*');

        pushHttpOriginToEmbed(frame);

        try {
            frame.contentWindow?.refreshBlogCarouselLinks?.();
        } catch (refreshErr) {
            /* ignore */
        }

    } catch (e) {

        console.warn('Could not sync theme to embedded website:', e);

    }

}



function setupBackButton() {

    const backBtn = document.getElementById('embed-back');

    if (!backBtn) return;



    let navigating = false;



    const goMenu = () => {

        if (navigating) return;

        navigating = true;



        if (window.electronAPI?.goToMenu) {

            window.electronAPI.goToMenu();

        } else {

            window.location.href = '../index.html#menu';

        }

    };



    backBtn.addEventListener('click', (e) => {

        e.preventDefault();

        e.stopPropagation();

        goMenu();

    });



    backBtn.addEventListener('touchend', (e) => {

        e.preventDefault();

        e.stopPropagation();

        goMenu();

    }, { passive: false });

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


