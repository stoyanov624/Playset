// How dates, counts and waits read on screen (en-GB, as the design lock sets).

// Show dates are calendar days with no time zone, so they are read and written in UTC.
const SHOW_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** "2026-11-27" → "27 Nov 2026". */
export function formatShowDate(iso: string): string {
  return SHOW_DATE.format(parseIsoDate(iso));
}

/** The day, and the month with the year, for the date block of a Setlist row. */
export function showDateParts(iso: string): { day: string; monthYear: string } {
  const parts = SHOW_DATE.formatToParts(parseIsoDate(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: part("day"), monthYear: `${part("month")} ${part("year")}` };
}

/** "1 song", "21 songs". */
export function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** A wait in seconds as m:ss ("0:42", "10:00"). */
export function formatWait(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
