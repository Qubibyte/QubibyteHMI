/**
 * Adds software-mode boot + software-mode.js to QubibyteWebsite HTML pages.
 * Run: node scripts/add-website-software-mode-tags.js
 */
const fs = require('fs');
const path = require('path');

const websiteRoot = path.join(__dirname, '..', 'QubibyteWebsite');
const BOOT = '    <script src="/js/software-mode-boot-inline.js"></script>';
const SOFTWARE_JS = '    <script src="/js/software-mode.js"></script>';
const MARKER = 'software-mode-boot-inline.js';

function walk(dir, files = []) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) files = walk(full, files);
        else if (name.endsWith('.html')) files.push(full);
    }
    return files;
}

function patch(filePath) {
    let html = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    if (!html.includes(MARKER) && html.includes('theme-boot-inline.js')) {
        html = html.replace(
            /<script src="\/js\/theme-boot-inline\.js"><\/script>/,
            `<script src="/js/theme-boot-inline.js"></script>\n${BOOT}`
        );
        changed = true;
    }

    if (!html.includes('software-mode.js') && html.includes('theme.js')) {
        html = html.replace(
            /<script src="\/js\/theme\.js"><\/script>/,
            `<script src="/js/theme.js"></script>\n${SOFTWARE_JS}`
        );
        changed = true;
    }

    if (changed) fs.writeFileSync(filePath, html, 'utf8');
    return changed;
}

let count = 0;
for (const file of walk(websiteRoot)) {
    if (patch(file)) {
        console.log('patched', path.relative(websiteRoot, file));
        count++;
    }
}
console.log(`Done. Patched ${count} files.`);
