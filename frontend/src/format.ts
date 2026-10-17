export function formatDuration(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export const formatTime = (iso: string | Date) => timeFormat.format(new Date(iso));

const clockFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

// Short form for tight spots, e.g. "Sat 6:08 AM". The time never wraps away from its AM/PM.
export const formatClock = (iso: string | Date) =>
  clockFormat
    .format(new Date(iso))
    .replace(",", "")
    .replace(/\s(AM|PM)$/i, "\u00a0$1");

export const formatMiles = (miles: number) =>
  `${miles.toLocaleString(undefined, { maximumFractionDigits: miles < 10 ? 1 : 0 })} mi`;

// "YYYY-MM-DDTHH:mm" in local time (the departure value; `new Date()` reads it back as local).
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const timeOfDayFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

// "9:45 PM" (or "21:45", by locale)
export const formatTimeOfDay = (date: Date) => timeOfDayFormat.format(date);

// How far off a departure is: "now", "in 40 min", "in 3 h 15 min", "in 2 days 4 h", "2 h ago".
export function formatRelative(target: Date, now: Date): string {
  const minutes = Math.round((target.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(minutes);
  if (abs < 1) return "now";
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const mins = abs % 60;
  const parts = days
    ? [`${days} day${days > 1 ? "s" : ""}`, hours && `${hours} h`]
    : [hours && `${hours} h`, mins && `${mins} min`];
  const text = parts.filter(Boolean).join(" ");
  return minutes > 0 ? `in ${text}` : `${text} ago`;
}

// Typed time to minutes after midnight: "7:30 pm", "7.30pm", "730p", "19:30", "1930", "7pm", "7". Null if unreadable.
export function parseTime(text: string): number | null {
  const m = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(a|p|am|pm)?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (minutes > 59) return null;
  if (m[3]) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (m[3].startsWith("p") ? 12 : 0);
  } else if (hours > 23) return null;
  return hours * 60 + minutes;
}

// Rounds down, so 0.496 shows as "0.49" and not "0.50" (which would look Moderate).
export function fixedDown(value: number, decimals: number): string {
  const scale = 10 ** decimals;
  return (Math.floor(value * scale + 1e-9) / scale).toFixed(decimals);
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

// 300 -> "NW"
export const compass = (degrees: number) => COMPASS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
