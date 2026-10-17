export const pct = (x: number | null | undefined, d = 0) => (x == null ? "–" : `${(x * 100).toFixed(d)}%`);
/** A number to `d` decimals (ECE and the like), "–" when unmeasured. */
export const fixed = (x: number | null | undefined, d = 3) => (x == null ? "–" : x.toFixed(d));
export const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
export const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536e6], ["month", 2592e6], ["day", 864e5], ["hour", 36e5], ["minute", 6e4]];
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "always", style: "narrow" });
/** "3h ago", "2d ago". Reads the clock: render it only after data has loaded. Pair with `when(iso)` as the title. */
export function ago(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  const hit = UNITS.find(([, ms]) => Math.abs(diff) >= ms);
  return hit ? rtf.format(Math.round(diff / hit[1]), hit[0]) : "just now";
}
/** A queue wait given in hours: "12m", "5h", "3d". */
export function age(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}
export const issueUrl = (fullName: string, n: number) => `https://github.com/${fullName}/issues/${n}`;
export const repoPath = (id: number | string, tab = "queue") => `/repos/${id}/${tab}`;
