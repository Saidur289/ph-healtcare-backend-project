// Time zone helpers. RULE: every DateTime in the database is UTC.
// Admins type wall-clock times ("09:00" on "2026-10-05") in the clinic's time zone;
// these helpers turn that into the exact UTC instant. The client shows times in the
// viewer's own time zone.

// offset (ms) of `timeZone` from UTC at the given instant, e.g. +6h for Asia/Dhaka
const getTimeZoneOffsetMs = (timeZone: string, instant: number) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
};

// "2026-10-05" + "09:30" in "Asia/Dhaka" -> Date (UTC instant)
export const zonedTimeToUtc = (date: string, time: string, timeZone: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, mins] = time.split(":").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hours, mins);
  // first guess, then correct once (handles DST changes)
  let utc = wallClockAsUtc - getTimeZoneOffsetMs(timeZone, wallClockAsUtc);
  utc = wallClockAsUtc - getTimeZoneOffsetMs(timeZone, utc);
  return new Date(utc);
};

export const isValidTimeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

// "2026-10-05" -> "2026-10-06" (pure calendar math, no local time zone involved)
export const nextCalendarDay = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
};

// accepts "2026-10-05" or a full ISO string and returns "2026-10-05"
export const toCalendarDate = (value: string) => value.slice(0, 10);
