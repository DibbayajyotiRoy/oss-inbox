export const pct = (x: number | null | undefined, d = 0) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
export const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
export const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
export function age(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}
export const issueUrl = (fullName: string, n: number) => `https://github.com/${fullName}/issues/${n}`;
export const repoPath = (id: number | string, tab = "queue") => `/repos/${id}/${tab}`;
