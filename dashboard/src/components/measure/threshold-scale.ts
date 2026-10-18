/** One confidence bucket of the history, as stacked counts. */
export type Bin = { x: number; wrong: number; correct: number; unlabeled: number };

export const MIN = 0.5;
export const MAX = 0.99;
export const snap = (v: number) => Math.min(MAX, Math.max(MIN, Math.round(v * 100) / 100));
