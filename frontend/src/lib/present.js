function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function humanizeKey(value) {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatValue(value) {
  if (value === null || value === undefined) return "Unavailable";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `${value.length} items`;
  if (isPlainObject(value)) return `${Object.keys(value).length} fields`;
  return String(value);
}

export function inferTone(value) {
  const text = String(formatValue(value)).toLowerCase();
  if (/(down|fail|error|missing|inactive|critical|unavailable)/.test(text)) return "bad";
  if (/(pending|warning|degraded|unknown|unbound|not active)/.test(text)) return "warn";
  if (/(live|ready|active|healthy|pass|ok|green|steady)/.test(text)) return "ok";
  return "neutral";
}

export function summarizeObject(data, priorityKeys = [], max = 6) {
  if (!isPlainObject(data)) return [];
  const keys = [
    ...priorityKeys.filter((key) => key in data),
    ...Object.keys(data).filter((key) => !priorityKeys.includes(key))
  ];
  return keys.slice(0, max).map((key) => ({
    key,
    label: humanizeKey(key),
    value: formatValue(data[key]),
    tone: inferTone(data[key])
  }));
}

export function prettyJson(data) {
  return JSON.stringify(data, null, 2);
}
