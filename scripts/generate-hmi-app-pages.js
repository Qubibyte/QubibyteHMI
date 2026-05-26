/**
 * Generates HMI circuit-builder.html and nmr.html from QubibyteWebsite sources.
 * Does not modify files inside QubibyteWebsite/.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = path.join(ROOT, 'pages');

function extractHead(html) {
  const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return match ? match[1] : '';
}

function extractBodyInner(html) {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!match) throw new Error('No body found');
  return match[1].trim();
}

function stripHeaderHomeLinks(html) {
  return html
    .replace(/<a\s+href="[^"]*">\s*(<img[^>]+class="logo"[^>]*>)\s*<\/a>/gi, '$1')
    .replace(/<a\s+href="[^"]*">\s*<img([^>]+)>\s*<\/a>/gi, '<img$1>');
}

/** Root-relative /images/… → qubibyte protocol (works without editing QubibyteWebsite) */
function rewriteRootRelativeAssets(html) {
  return html.replace(/(src|href)="\/([^"]+)"/g, '$1="qubibyte:///$2"');
}

function stripScripts(html) {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').trim();
}

function extractScripts(html) {
  const re = /<script[^>]+src=[^>]+>\s*<\/script>/gi;
  return html.match(re) || [];
}

function buildPage({ sourceRel, assetBase, title, bodyClass, pageName }) {
  const sourcePath = path.join(ROOT, 'QubibyteWebsite', sourceRel);
  const html = fs.readFileSync(sourcePath, 'utf8');

  const headHtml = extractHead(html);
  const styles = extractScripts(headHtml).length
    ? []
    : (headHtml.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || []);

  const allScripts = extractScripts(html);
  const headCdnScripts = allScripts.filter((s) => /https?:\/\//.test(s));
  const bodyScripts = allScripts.filter((s) => !/https?:\/\//.test(s));

  const linkTags = headHtml.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || [];

  let bodyInner = rewriteRootRelativeAssets(stripHeaderHomeLinks(extractBodyInner(html)));
  bodyInner = stripScripts(bodyInner);

  const out = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>${title} - Qubibyte HMI</title>
    <script src="../js/theme.js"></script>
    <link rel="stylesheet" href="../styles.css">
    <link rel="stylesheet" href="../styles/hmi-hosted-app.css">
    <base href="${assetBase}">
    ${linkTags.join('\n    ')}
    ${headCdnScripts.join('\n    ')}
</head>
<body class="hmi-hosted-app ${bodyClass}">
    <div class="embed-chrome">
        <button type="button" class="embed-back-btn" id="embed-back">
            <span class="back-icon">◀</span>
            <span>MENU</span>
        </button>
        <div id="system-info" class="system-info"></div>
    </div>
    <div class="hmi-app-viewport">
${bodyInner}
    </div>
    ${bodyScripts.join('\n    ')}
    <script src="../js/hmi-app-host.js"></script>
</body>
</html>
`;

  const outPath = path.join(PAGES, pageName);
  fs.writeFileSync(outPath, out, 'utf8');
  console.log('Wrote', outPath);
}

buildPage({
  sourceRel: 'simulator/index.html',
  assetBase: 'qubibyte:///simulator/',
  title: 'Circuit Builder',
  bodyClass: 'hmi-circuit',
  pageName: 'circuit-builder.html'
});

buildPage({
  sourceRel: 'nmr/index.html',
  assetBase: 'qubibyte:///nmr/',
  title: 'NMR Conductor',
  bodyClass: 'hmi-nmr',
  pageName: 'nmr.html'
});
