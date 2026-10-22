export const MONTHS = ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli", "August", "September", "Oktober", "November", "December"];
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const check = (condition, message) => { if (!condition) throw new Error(message); };

// Keep optional and unknown fields intact when switching between JSON and forms.
export function parseConfig(source) {
  const data = JSON.parse(source);
  check(object(data), "Konfigurationen skal være et JSON-objekt.");
  check(data.title === undefined || typeof data.title === "string", "title skal være en tekststreng.");
  check(data.year === undefined || (Number.isInteger(data.year) && data.year > 0 && data.year <= 9999), "year skal være et heltal mellem 1 og 9999.");
  if (data.months !== undefined) {
    check(Array.isArray(data.months) && data.months.length === 12 && data.months.every(name => typeof name === "string" && name.trim()), "months skal indeholde præcis 12 månedsnavne.");
  }
  if (data.colors !== undefined) {
    check(Array.isArray(data.colors) && data.colors.length === 4 && data.colors.every(color => typeof color === "string" && /^#[\da-f]{6}$/i.test(color)), "colors skal indeholde fire farver i formatet #RRGGBB.");
  }
  check(data.events === undefined || Array.isArray(data.events), "events skal være en liste.");
  for (const [index, event] of (data.events ?? []).entries()) {
    const prefix = `Aktivitet ${index + 1}`;
    check(object(event), `${prefix} skal være et objekt.`);
    check(Number.isInteger(event.month) && event.month >= 1 && event.month <= 12, `${prefix}: month skal være et heltal mellem 1 og 12.`);
    check(typeof event.title === "string" && event.title.trim().length > 0, `${prefix}: Angiv en titel.`);
    for (const key of ["description", "date"]) {
      check(event[key] === undefined || typeof event[key] === "string", `${prefix}: ${key} skal være en tekststreng.`);
    }
  }
  return data;
}

export function compilerData(data) {
  return JSON.stringify({ ...data, year: data.year ?? new Date().getFullYear() });
}
