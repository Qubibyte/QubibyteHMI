// Main Menu JavaScript
// Handles startup screen, particle animations, and menu navigation

document.addEventListener('DOMContentLoaded', init);

// State
let started = false;
let particles = [];
let canvas, ctx;

function init() {
    // Check if we should skip startup (coming from back button)
    if (window.location.hash === '#menu') {
        skipToMenu();
    } else {
        setupStartupScreen();
    }

    setupSystemInfo();
    initParticles();
}

// ============================================
// SKIP TO MENU (when returning from sub-pages)
// ============================================

function skipToMenu() {
    started = true;
    const startupScreen = document.getElementById('startup-screen');
    const mainApp = document.getElementById('main-app');

    startupScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    mainApp.style.opacity = '1';

    setupMainMenu();

    // Clear the hash
    history.replaceState(null, null, ' ');
}

// ============================================
// STARTUP SCREEN
// ============================================

function setupStartupScreen() {
    const startupScreen = document.getElementById('startup-screen');
    const mainApp = document.getElementById('main-app');
    const logoImg = document.getElementById('logo-img');
    const promptLabel = document.getElementById('prompt-label');
    const sloganWords = document.querySelectorAll('.slogan-word');

    // Animate logo
    logoImg.style.opacity = '0';
    logoImg.style.transform = 'scale(0.5)';

    setTimeout(() => {
        logoImg.style.transition = 'all 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
        logoImg.style.opacity = '1';
        logoImg.style.transform = 'scale(1)';
    }, 300);

    // Animate slogan
    setTimeout(() => {
        sloganWords.forEach((word, i) => {
            setTimeout(() => {
                word.style.opacity = '1';
                word.style.transform = 'translateY(0)';
            }, i * 300);
        });
    }, 1500);

    // Show prompt
    setTimeout(() => {
        promptLabel.style.opacity = '1';
        startPulseAnimation(promptLabel);
    }, 2500);

    // Click/touch to start
    const startHandler = (e) => {
        if (started) return;
        started = true;

        // Fade out startup
        startupScreen.style.transition = 'opacity 0.5s ease';
        startupScreen.style.opacity = '0';

        setTimeout(() => {
            startupScreen.classList.add('hidden');
            mainApp.classList.remove('hidden');
            mainApp.style.opacity = '0';

            setTimeout(() => {
                mainApp.style.transition = 'opacity 0.5s ease';
                mainApp.style.opacity = '1';
                setupMainMenu();
            }, 50);
        }, 500);
    };

    // Support both click and touch
    startupScreen.addEventListener('click', startHandler);
    startupScreen.addEventListener('touchend', (e) => {
        e.preventDefault();
        startHandler(e);
    });
}

function startPulseAnimation(element) {
    let opacity = 1;
    let direction = -1;

    const pulse = () => {
        opacity += direction * 0.02;
        if (opacity <= 0.3) direction = 1;
        if (opacity >= 1) direction = -1;
        element.style.opacity = opacity;
        requestAnimationFrame(pulse);
    };

    requestAnimationFrame(pulse);
}

// ============================================
// PARTICLE BACKGROUND - OPTIMIZED
// ============================================

function initParticles() {
    canvas = document.getElementById('particle-canvas');
    if (!canvas) return;

    ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const onPi = window.electronAPI?.isRaspberryPi;
    if (onPi) {
        canvas.style.display = 'none';
        return;
    }

    const particleCount = 40;

    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            size: Math.random() * 2 + 1,
            alpha: Math.random() * 0.5 + 0.2,
            hue: Math.random() * 60 + 200 // Blue to purple
        });
    }

    // Use requestAnimationFrame for smooth animation
    animateParticles();
}

function animateParticles() {
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update and draw particles
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.alpha})`;
        ctx.fill();
    }

    // Draw connections (optimized - only check nearby)
    ctx.lineWidth = 1;
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const distSq = dx * dx + dy * dy;

            if (distSq < 14400) { // 120^2
                const dist = Math.sqrt(distSq);
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                const avgHue = (particles[i].hue + particles[j].hue) / 2;
                ctx.strokeStyle = `hsla(${avgHue}, 70%, 50%, ${0.15 * (1 - dist / 120)})`;
                ctx.stroke();
            }
        }
    }

    requestAnimationFrame(animateParticles);
}

// ============================================
// MAIN MENU
// ============================================

function setupMainMenu() {
    const buttons = document.querySelectorAll('.menu-button');

    buttons.forEach(btn => {
        // Remove any existing listeners by cloning
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        // Hover effects
        newBtn.addEventListener('mouseenter', () => {
            const glow = newBtn.querySelector('.btn-glow');
            if (glow) glow.style.opacity = '1';
        });

        newBtn.addEventListener('mouseleave', () => {
            const glow = newBtn.querySelector('.btn-glow');
            if (glow) glow.style.opacity = '0';
        });

        // Click/touch handler
        const clickHandler = (e) => {
            e.preventDefault();
            const page = newBtn.dataset.page;

            if (newBtn.id === 'btn-exit') {
                handleExit();
            } else if (page) {
                navigateToPage(page);
            }
        };

        newBtn.addEventListener('click', clickHandler);
        newBtn.addEventListener('touchend', clickHandler);
    });
}

function navigateToPage(page) {
    if (window.electronAPI && window.electronAPI.navigate) {
        window.electronAPI.navigate(`pages/${page}.html`);
    } else {
        window.location.href = `pages/${page}.html`;
    }
}

function handleExit() {
    if (window.electronAPI && window.electronAPI.quit) {
        window.electronAPI.quit();
    } else {
        window.close();
    }
}

// ============================================
// SYSTEM INFO
// ============================================

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
