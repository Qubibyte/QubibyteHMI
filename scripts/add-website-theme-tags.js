/**
 * Adds theme boot + stylesheet + theme.js to all QubibyteWebsite HTML pages.
 * Run: node scripts/add-website-theme-tags.js
 */
const fs = require('fs');
const path = require('path');

const websiteRoot = path.join(__dirname, '..', 'QubibyteWebsite');

const BOOT = `    <script src="/js/theme-boot-inline.js"></script>`;
const THEME_CSS = `    <link rel="stylesheet" href="/css/themes.css">`;
const THEME_JS = `    <script src="/js/theme.js"></script>`;

const MARKER = 'theme-boot-inline.js';

function walk(dir, files = []) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) files = walk(full, files);
        else if (name.endsWith('.html')) files.push(full);
    }
    return files;
}

function patchHtml(filePath) {
    let html = fs.readFileSync(filePath, 'utf8');
    if (html.includes(MARKER)) return false;

    if (!html.includes('<head')) return false;

    html = html.replace(/<head([^>]*)>/i, (m) => `${m}\n${BOOT}`);

    if (html.includes('</head>')) {
        html = html.replace('</head>', `${THEME_CSS}\n${THEME_JS}\n</head>`);
    } else {
        return false;
    }

    fs.writeFileSync(filePath, html, 'utf8');
    return true;
}

let count = 0;
for (const file of walk(websiteRoot)) {
    if (patchHtml(file)) {
        console.log('patched', path.relative(websiteRoot, file));
        count++;
    }
}
console.log(`Done. Patched ${count} files.`);
