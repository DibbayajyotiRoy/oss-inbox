import { when } from "@/lib/fmt";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536e6], ["month", 2592e6], ["day", 864e5], ["hour", 36e5], ["minute", 6e4]];
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "always", style: "narrow" });

/** "3h ago", "2d ago". Only render after data has loaded (reads the clock). */
export function ago(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  const hit = UNITS.find(([, ms]) => Math.abs(diff) >= ms);
  return hit ? rtf.format(Math.round(diff / hit[1]), hit[0]) : "just now";
}

/** Relative time with the exact time on hover and for assistive tech. */
export function RelTime({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} title={when(iso)} className={className}>
      {ago(iso)}
    </time>
  );
}
