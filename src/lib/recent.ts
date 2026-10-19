export type RecentEntry = {
  path: string;
  name: string;
  location: string;
  openedAt: number;
  exists: boolean;
};

const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelativeTime(timestamp: number, now: number) {
  const elapsed = Math.max(0, now - timestamp);
  for (const [unit, size] of units) {
    if (elapsed >= size) {
      return formatter.format(-Math.floor(elapsed / size), unit);
    }
  }
  return "just now";
}
