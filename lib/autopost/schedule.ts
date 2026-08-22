// Deciding whether an AutoPost is due right now.
//
// The user picks a wall-clock time in their own zone ("09:00", "Asia/Dhaka").
// The cron runs in UTC, on a best-effort schedule — GitHub Actions can fire
// several minutes late, and can fire more than once inside the same window.
// So "is it due?" can't be a simple timestamp comparison; it needs to answer:
//
//   1. What is the local date/time for this automation right now?
//   2. Has its scheduled moment for today already passed?
//   3. Did we already publish for that moment?
//
// (3) is what makes late and duplicate cron runs safe. Each occurrence gets a
// stable string key ("2026-08-15T09:00"); once a run is recorded under that key
// the same occurrence can never fire again, no matter how often cron calls us.

// How late a run may still go out. A cron that was delayed — or one that failed
// and is retried on the next tick — should still publish the morning post.
// Beyond this the occurrence is treated as missed rather than posted hours off
// schedule, which for a "9am post" landing at 3pm is the kinder failure.
//
// Sized against how erratically the scheduler actually fires, not how often it
// is asked to: observed gaps between GitHub-scheduled runs reach an hour, so a
// window only slightly wider than one gap would drop a post whenever two ticks
// were skipped in a row.
export const GRACE_MINUTES = 180;

// The automation's local wall-clock, as plain numbers.
//
// Intl is the only timezone database available to us, so the parts are read
// back out of a formatter rather than computed. `en-CA` yields ISO-ish
// YYYY-MM-DD for the date parts, and hourCycle h23 avoids a "24" hour.
export function localParts(now: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });

  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }

  const WEEKDAYS: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`, // YYYY-MM-DD, local
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday] ?? 0, // 0=Sun..6=Sat
  };
}

// "HH:MM" → minutes since local midnight. Returns null on anything malformed so
// a bad stored value disables the automation rather than firing it at midnight.
export function parseTimeOfDay(timeOfDay: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((timeOfDay || "").trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

// Validates a timezone string before it's stored. An unknown zone would make
// every later localParts() call throw inside the cron, taking down all the other
// automations in the same run — so it's rejected at write time instead.
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export type DueCheck =
  | { due: true; runKey: string }
  | { due: false; reason: string };

type Schedulable = {
  enabled?: boolean;
  frequency?: string;
  timeOfDay?: string;
  timezone?: string;
  daysOfWeek?: number[];
  lastRunKey?: string;
  targets?: unknown[];
};

// Should this automation publish on this cron tick?
//
// `now` is passed in rather than read from the clock so a whole cron run judges
// every automation against one instant, and so this is testable.
export function isDue(auto: Schedulable, now: Date): DueCheck {
  if (!auto.enabled) return { due: false, reason: "disabled" };
  if (!auto.targets?.length) return { due: false, reason: "no_targets" };

  const timezone = auto.timezone || "UTC";
  if (!isValidTimezone(timezone)) {
    return { due: false, reason: "invalid_timezone" };
  }

  const scheduledMinutes = parseTimeOfDay(auto.timeOfDay || "");
  if (scheduledMinutes === null) {
    return { due: false, reason: "invalid_time" };
  }

  const local = localParts(now, timezone);

  if (auto.frequency === "weekly") {
    const days = auto.daysOfWeek || [];
    if (days.length === 0) return { due: false, reason: "no_days_selected" };
    if (!days.includes(local.weekday)) return { due: false, reason: "not_today" };
  }

  // The occurrence this tick belongs to — the automation's scheduled moment on
  // today's local date. Stable across every cron tick within the same day, which
  // is exactly what makes it usable as a de-duplication key.
  const runKey = `${local.date}T${auto.timeOfDay}`;

  if (auto.lastRunKey === runKey) {
    return { due: false, reason: "already_ran" };
  }

  const nowMinutes = local.hour * 60 + local.minute;
  if (nowMinutes < scheduledMinutes) {
    return { due: false, reason: "not_yet" };
  }
  // Late, but not so late that posting would be worse than skipping. Note this
  // compares within the local day: an occurrence missed entirely (server down
  // overnight) simply never fires, rather than firing at the next day's first
  // tick, because by then nowMinutes is small again and reads as "not_yet".
  if (nowMinutes - scheduledMinutes > GRACE_MINUTES) {
    return { due: false, reason: "missed_window" };
  }

  return { due: true, runKey };
}
