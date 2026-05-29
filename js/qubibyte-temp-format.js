/**
 * Header / settings temperature display formatting.
 */

function normalizeTempUnit(unit) {
  return unit === 'C' ? 'C' : 'F';
}

function tempUnavailable(unit) {
  return normalizeTempUnit(unit) === 'C' ? 'N/A°C' : 'N/A°F';
}

function formatTemperatureFromValues(tempC, tempF, unit) {
  const u = normalizeTempUnit(unit);
  if (tempC != null && Number.isFinite(tempC)) {
    if (u === 'C') return `${tempC.toFixed(1)}°C`;
    const f = tempF != null && Number.isFinite(tempF) ? tempF : (tempC * 9) / 5 + 32;
    return `${f.toFixed(1)}°F`;
  }
  return tempUnavailable(u);
}

function parseTemperatureString(text) {
  const t = (text || '').trim();
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([CF])$/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const u = m[2].toUpperCase();
  if (!Number.isFinite(value)) return null;
  if (u === 'C') {
    return { tempC: value, tempF: (value * 9) / 5 + 32 };
  }
  return { tempC: ((value - 32) * 5) / 9, tempF: value };
}

function convertTemperatureString(text, unit) {
  const parsed = parseTemperatureString(text);
  if (!parsed) return text;
  return formatTemperatureFromValues(parsed.tempC, parsed.tempF, unit);
}

const exportObj = {
  normalizeTempUnit,
  tempUnavailable,
  formatTemperatureFromValues,
  parseTemperatureString,
  convertTemperatureString
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportObj;
}

if (typeof window !== 'undefined') {
  window.QubibyteTempFormat = exportObj;
}
