import { useMemo } from "react";

const UNITS: Array<{
  unit: Intl.RelativeTimeFormatUnit;
  ms: number;
}> = [
  { unit: "year", ms: 365.25 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30.44 * 24 * 60 * 60 * 1000 },
  { unit: "week", ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
  { unit: "second", ms: 1000 },
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function relativeTime(epochMs: number): string {
  const diff = epochMs - Date.now();
  for (const { unit, ms } of UNITS) {
    if (Math.abs(diff) >= ms || unit === "second") {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return "just now";
}

function absoluteTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export function Timestamp({ ms }: { ms: number }) {
  const relative = useMemo(() => relativeTime(ms), [ms]);
  const absolute = useMemo(() => absoluteTime(ms), [ms]);

  return (
    <time
      dateTime={new Date(ms).toISOString()}
      title={absolute}
      className="text-xs text-zinc-500 whitespace-nowrap"
    >
      {relative}
    </time>
  );
}
