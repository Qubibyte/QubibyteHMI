/**
 * Theme background colors for anti-flash (main process + protocol injection).
 */
const VALID_THEMES = new Set(['dark', 'light', 'midnight', 'quantum']);

const WEBSITE_PAINT = {
  dark: { bg: '#0a0a1a', fg: '#f1f5f9', scheme: 'dark' },
  light: { bg: '#f0f0f5', fg: '#1a1a2e', scheme: 'light' },
  midnight: { bg: '#0f172a', fg: '#e2e8f0', scheme: 'dark' },
  quantum: { bg: '#1a0a25', fg: '#f5f0ff', scheme: 'dark' }
};

const HMI_PAINT = {
  dark: { bg: '#0a0a0f', fg: '#ffffff', scheme: 'dark' },
  light: { bg: '#f0f0f5', fg: '#1a1a2e', scheme: 'light' },
  midnight: { bg: '#0f172a', fg: '#e2e8f0', scheme: 'dark' },
  quantum: { bg: '#1a0a25', fg: '#f5f0ff', scheme: 'dark' }
};

function normalizeTheme(theme) {
  return VALID_THEMES.has(theme) ? theme : 'dark';
}

function resolveThemeFromUrl(requestUrl, fallbackTheme) {
  try {
    const url = new URL(requestUrl);
    const fromQuery = url.searchParams.get('theme');
    if (VALID_THEMES.has(fromQuery)) return fromQuery;

    const hashMatch = url.hash && url.hash.match(/(?:^|[&#])theme=([a-z]+)/i);
    if (hashMatch && VALID_THEMES.has(hashMatch[1])) return hashMatch[1];
  } catch {
    /* ignore */
  }
  return normalizeTheme(fallbackTheme);
}

function getPaint(theme, isHmi) {
  const map = isHmi ? HMI_PAINT : WEBSITE_PAINT;
  return map[normalizeTheme(theme)] || map.dark;
}

function getBackgroundColor(theme, isHmi) {
  return getPaint(theme, isHmi).bg;
}

function injectThemeFlashGuard(html, theme, isHmi) {
  if (!html || html.includes('id="qubibyte-flash-guard"')) return html;

  const paint = getPaint(theme, isHmi);
  const extra = isHmi ? ',.embed-body,.embed-frame' : '';
  const tag =
    `<style id="qubibyte-flash-guard">` +
    `html,body${extra}{background:${paint.bg}!important;color:${paint.fg}!important}` +
    `html{color-scheme:${paint.scheme}!important}</style>`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
  }
  return `${tag}${html}`;
}

function appendThemeQuery(url, theme) {
  const t = normalizeTheme(theme);
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('theme')) {
      parsed.searchParams.set('theme', t);
    }
    return parsed.href;
  } catch {
    return url;
  }
}

module.exports = {
  VALID_THEMES,
  normalizeTheme,
  resolveThemeFromUrl,
  getPaint,
  getBackgroundColor,
  injectThemeFlashGuard,
  appendThemeQuery
};
