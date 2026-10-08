/** Asia/Dubai is UTC+4 all year (no DST). */
export const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC instant of local (Dubai) midnight for the day containing `date`, shifted by `addDays`. */
export function dubaiDayStart(date = new Date(), addDays = 0): Date {
  const local = date.getTime() + DUBAI_OFFSET_MS;
  const midnightLocal = Math.floor(local / DAY_MS) * DAY_MS;
  return new Date(midnightLocal - DUBAI_OFFSET_MS + addDays * DAY_MS);
}

/** "YYYY-MM-DD" in Dubai time. */
export function dubaiDateKey(date: Date): string {
  return new Date(date.getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
}
