/**
 * Timezone helpers — one IANA zone per UTC offset.
 */

const FALLBACK_TIMEZONES = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo'];

/** Representative zone per offset (minutes east of UTC). */
const PREFERRED_ZONE_BY_OFFSET = {
  [-720]: 'Etc/GMT+12',
  [-660]: 'Pacific/Pago_Pago',
  [-600]: 'Pacific/Honolulu',
  [-570]: 'Pacific/Marquesas',
  [-540]: 'America/Anchorage',
  [-480]: 'America/Los_Angeles',
  [-420]: 'America/Denver',
  [-360]: 'America/Chicago',
  [-300]: 'America/New_York',
  [-240]: 'America/Halifax',
  [-210]: 'America/St_Johns',
  [-180]: 'America/Sao_Paulo',
  [-150]: 'America/Miquelon',
  [-120]: 'America/Noronha',
  [-60]: 'Atlantic/Azores',
  [0]: 'UTC',
  [60]: 'Europe/London',
  [120]: 'Europe/Berlin',
  [180]: 'Europe/Moscow',
  [210]: 'Asia/Tehran',
  [240]: 'Asia/Dubai',
  [270]: 'Asia/Kabul',
  [300]: 'Asia/Karachi',
  [330]: 'Asia/Kolkata',
  [345]: 'Asia/Kathmandu',
  [360]: 'Asia/Dhaka',
  [390]: 'Asia/Yangon',
  [420]: 'Asia/Bangkok',
  [480]: 'Asia/Shanghai',
  [525]: 'Australia/Eucla',
  [540]: 'Asia/Tokyo',
  [570]: 'Australia/Darwin',
  [600]: 'Australia/Sydney',
  [630]: 'Australia/Lord_Howe',
  [660]: 'Pacific/Guadalcanal',
  [720]: 'Pacific/Auckland',
  [765]: 'Pacific/Chatham',
  [780]: 'Pacific/Tongatapu',
  [840]: 'Pacific/Kiritimati'
};

/** Short city/region name shown in parentheses for each offset. */
const OFFSET_CITY_NAMES = {
  [-720]: 'International Date Line',
  [-660]: 'Samoa',
  [-600]: 'Honolulu',
  [-570]: 'Marquesas',
  [-540]: 'Anchorage',
  [-480]: 'Los Angeles',
  [-420]: 'Denver',
  [-360]: 'Chicago',
  [-300]: 'New York',
  [-240]: 'Halifax',
  [-210]: 'St. Johns',
  [-180]: 'Sao Paulo',
  [-150]: 'Miquelon',
  [-120]: 'Noronha',
  [-60]: 'Azores',
  [0]: 'UTC',
  [60]: 'London',
  [120]: 'Berlin',
  [180]: 'Moscow',
  [210]: 'Tehran',
  [240]: 'Dubai',
  [270]: 'Kabul',
  [300]: 'Karachi',
  [330]: 'Kolkata',
  [345]: 'Kathmandu',
  [360]: 'Dhaka',
  [390]: 'Yangon',
  [420]: 'Bangkok',
  [480]: 'Shanghai',
  [525]: 'Eucla',
  [540]: 'Tokyo',
  [570]: 'Darwin',
  [600]: 'Sydney',
  [630]: 'Lord Howe',
  [660]: 'Guadalcanal',
  [720]: 'Auckland',
  [765]: 'Chatham',
  [780]: 'Tonga',
  [840]: 'Kiritimati'
};

/** IANA id → Windows `Set-TimeZone -Id` name. */
const IANA_TO_WINDOWS_TZ = {
  'Etc/GMT+12': 'Dateline Standard Time',
  'Pacific/Pago_Pago': 'UTC-11',
  'Pacific/Honolulu': 'Hawaiian Standard Time',
  'Pacific/Marquesas': 'Marquesas Standard Time',
  'America/Anchorage': 'Alaskan Standard Time',
  'America/Los_Angeles': 'Pacific Standard Time',
  'America/Denver': 'Mountain Standard Time',
  'America/Chicago': 'Central Standard Time',
  'America/New_York': 'Eastern Standard Time',
  'America/Halifax': 'Atlantic Standard Time',
  'America/St_Johns': 'Newfoundland Standard Time',
  'America/Sao_Paulo': 'E. South America Standard Time',
  'America/Miquelon': 'Greenland Standard Time',
  'America/Noronha': 'UTC-02',
  'Atlantic/Azores': 'Azores Standard Time',
  UTC: 'UTC',
  'Europe/London': 'GMT Standard Time',
  'Europe/Berlin': 'W. Europe Standard Time',
  'Europe/Moscow': 'Russian Standard Time',
  'Asia/Tehran': 'Iran Standard Time',
  'Asia/Dubai': 'Arabian Standard Time',
  'Asia/Kabul': 'Afghanistan Standard Time',
  'Asia/Karachi': 'Pakistan Standard Time',
  'Asia/Kolkata': 'India Standard Time',
  'Asia/Kathmandu': 'Nepal Standard Time',
  'Asia/Dhaka': 'Bangladesh Standard Time',
  'Asia/Yangon': 'Myanmar Standard Time',
  'Asia/Bangkok': 'SE Asia Standard Time',
  'Asia/Shanghai': 'China Standard Time',
  'Australia/Eucla': 'Aus Central W. Standard Time',
  'Asia/Tokyo': 'Tokyo Standard Time',
  'Australia/Darwin': 'AUS Central Standard Time',
  'Australia/Sydney': 'AUS Eastern Standard Time',
  'Australia/Lord_Howe': 'Lord Howe Standard Time',
  'Pacific/Guadalcanal': 'Central Pacific Standard Time',
  'Pacific/Auckland': 'New Zealand Standard Time',
  'Pacific/Chatham': 'Chatham Islands Standard Time',
  'Pacific/Tongatapu': 'Tonga Standard Time',
  'Pacific/Kiritimati': 'Line Islands Standard Time'
};

function getTimezoneList() {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone').slice();
    }
  } catch {
    /* ignore */
  }
  return FALLBACK_TIMEZONES.slice();
}

function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function getTimezoneOffsetMinutes(tz, at = new Date()) {
  try {
    const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(at.toLocaleString('en-US', { timeZone: tz }));
    return Math.round((local - utc) / 60000);
  } catch {
    return 0;
  }
}

function formatUtcOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  if (mins === 0) return `UTC${sign}${hours}`;
  return `UTC${sign}${hours}:${String(mins).padStart(2, '0')}`;
}

function regionLabel(tz) {
  const part = tz.split('/').pop() || tz;
  return part.replace(/_/g, ' ');
}

function cityNameForOffset(offsetMinutes, id) {
  if (OFFSET_CITY_NAMES[offsetMinutes]) return OFFSET_CITY_NAMES[offsetMinutes];
  const fromId = regionLabel(id);
  return fromId || 'Standard';
}

function formatTimezoneOptionLabel(offsetMinutes, id) {
  return `${formatUtcOffset(offsetMinutes)} (${cityNameForOffset(offsetMinutes, id)})`;
}

function ianaToWindowsTimezone(iana) {
  if (!iana) return null;
  if (IANA_TO_WINDOWS_TZ[iana]) return IANA_TO_WINDOWS_TZ[iana];
  return null;
}

function resolveTimezone(stored) {
  const candidate = typeof stored === 'string' ? stored.trim() : '';
  if (candidate && isValidTimezone(candidate)) return candidate;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function buildUniqueOffsetOptions(at = new Date()) {
  const byOffset = new Map();

  for (const [mins, id] of Object.entries(PREFERRED_ZONE_BY_OFFSET)) {
    const offsetMinutes = Number(mins);
    if (isValidTimezone(id)) {
      byOffset.set(offsetMinutes, id);
    }
  }

  for (const id of getTimezoneList()) {
    const offsetMinutes = getTimezoneOffsetMinutes(id, at);
    if (!byOffset.has(offsetMinutes)) {
      byOffset.set(offsetMinutes, id);
    }
  }

  return [...byOffset.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([offsetMinutes, id]) => ({
      id,
      offsetMinutes,
      label: formatTimezoneOptionLabel(offsetMinutes, id)
    }));
}

function matchTimezoneToOption(stored, options, at = new Date()) {
  const list = Array.isArray(options) ? options : [];
  const resolved = resolveTimezone(stored);

  const exact = list.find((o) => o.id === resolved);
  if (exact) return exact.id;

  const mins = getTimezoneOffsetMinutes(resolved, at);
  const byOffset = list.find((o) => o.offsetMinutes === mins);
  if (byOffset) return byOffset.id;

  return list.length ? list[0].id : resolved;
}

function getTimezoneOptions(at = new Date()) {
  return buildUniqueOffsetOptions(at);
}

const exportObj = {
  getTimezoneList,
  isValidTimezone,
  resolveTimezone,
  getTimezoneOffsetMinutes,
  formatUtcOffset,
  formatTimezoneOptionLabel,
  cityNameForOffset,
  buildUniqueOffsetOptions,
  matchTimezoneToOption,
  getTimezoneOptions,
  ianaToWindowsTimezone,
  FALLBACK_TIMEZONES,
  PREFERRED_ZONE_BY_OFFSET,
  OFFSET_CITY_NAMES,
  IANA_TO_WINDOWS_TZ
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportObj;
}

if (typeof window !== 'undefined') {
  window.QubibyteTimezones = exportObj;
}
