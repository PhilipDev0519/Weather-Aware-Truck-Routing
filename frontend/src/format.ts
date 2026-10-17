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

// Value format for <input type="datetime-local">, in local time.
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Rounds down, so 0.496 shows as "0.49" and not "0.50" (which would look Moderate).
export function fixedDown(value: number, decimals: number): string {
  const scale = 10 ** decimals;
  return (Math.floor(value * scale + 1e-9) / scale).toFixed(decimals);
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

// 300 -> "NW"
export const compass = (degrees: number) => COMPASS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
