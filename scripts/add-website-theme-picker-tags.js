/**
 * Adds theme-picker.css + theme-picker.js to QubibyteWebsite HTML pages that already have theme.js.
 * Run: node scripts/add-website-theme-picker-tags.js
 */
const fs = require('fs');
const path = require('path');

const websiteRoot = path.join(__dirname, '..', 'QubibyteWebsite');
const PICKER_CSS = `    <link rel="stylesheet" href="/css/theme-picker.css">`;
const PICKER_JS = `    <script src="/js/theme-picker.js"></script>`;
const MARKER = 'theme-picker.js';

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
    if (html.includes(MARKER) || !html.includes('theme.js')) return false;
    if (!html.includes('<nav') && !html.includes('navbar')) return false;

    if (html.includes('/css/themes.css')) {
        html = html.replace(
            '<link rel="stylesheet" href="/css/themes.css">',
            `<link rel="stylesheet" href="/css/themes.css">\n${PICKER_CSS}`
        );
    } else {
        html = html.replace('</head>', `${PICKER_CSS}\n</head>`);
    }

    html = html.replace(
        '<script src="/js/theme.js"></script>',
        `<script src="/js/theme.js"></script>\n${PICKER_JS}`
    );

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
