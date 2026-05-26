/**
 * Resolves qubibyte:// URLs to files under QubibyteWebsite/ (and optional hmi/ prefix).
 */
const path = require('path');
const fs = require('fs');

function parseRelativePath(requestUrl) {
  const url = new URL(requestUrl);
  let relative = '';

  if (url.hostname === 'local' || url.hostname === '') {
    relative = decodeURIComponent(url.pathname).replace(/^\//, '');
  } else {
    relative = decodeURIComponent(
      `${url.hostname}${url.pathname}`.replace(/\/$/, '')
    );
  }

  return relative.replace(/\\/g, '/');
}

function resolveQubibyteFilePath(requestUrl, websiteRoot, appRoot) {
  let relative = parseRelativePath(requestUrl);

  if (relative.startsWith('hmi/')) {
    const hmiPath = path.normalize(path.join(appRoot, relative.slice(4)));
    if (hmiPath.startsWith(appRoot) && fileExists(hmiPath)) return hmiPath;
    const withIndex = tryIndexHtml(hmiPath);
    if (withIndex && withIndex.startsWith(appRoot)) return withIndex;
    return null;
  }

  if (!relative || relative === '/') relative = 'index.html';
  if (relative.endsWith('/')) relative = relative.slice(0, -1);

  const candidates = buildCandidates(relative);

  for (const candidate of candidates) {
    const filePath = path.normalize(path.join(websiteRoot, candidate));
    if (!filePath.startsWith(websiteRoot)) continue;
    if (fileExists(filePath)) return filePath;
  }

  return null;
}

function tryIndexHtml(filePath) {
  if (fileExists(filePath)) return filePath;
  if (filePath.endsWith('.html')) return null;
  const indexPath = path.join(filePath, 'index.html');
  return fileExists(indexPath) ? indexPath : null;
}

function buildCandidates(relative) {
  const list = [];
  const add = (p) => {
    const n = p.replace(/\\/g, '/');
    if (n && !list.includes(n)) list.push(n);
  };

  add(relative);

  const base = path.posix.basename(relative);
  const hasExtension = base.includes('.') && !base.endsWith('.');

  if (!hasExtension) {
    add(`${relative}/index.html`);
    add(`${relative}.html`);
  }

  if (relative.endsWith('/index.html')) {
    add(relative.replace(/\/index\.html$/, ''));
    add(relative.replace(/\/index\.html$/, '.html'));
  }

  return list;
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

module.exports = { resolveQubibyteFilePath, parseRelativePath };
