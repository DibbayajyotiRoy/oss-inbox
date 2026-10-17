"use client";
// Compatibility shim: the pre-design-system names, built on the new primitives so unmigrated pages keep
// working. New code imports from "@/components/ui/<primitive>" (see COMPONENTS.md). Delete once unused.
import type { ReactNode } from "react";
import { Badge as BadgeBase } from "./ui/badge";
import { CopyButton } from "./ui/copy-button";
import { EmptyState } from "./ui/empty-state";
import { ErrorState, Load, LoadMore as LoadMoreBase } from "./ui/load";
import { Meter } from "./ui/meter";
import { Stat as StatBase } from "./ui/stat-strip";

export { Load };
export const ErrorBox = ErrorState;

const tones = { neutral: "secondary", ok: "success", warn: "warning", bad: "destructive", info: "info" } as const;
type Tone = keyof typeof tones;

export const Badge = ({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) => (
  <BadgeBase variant={tones[tone]} title={title}>{children}</BadgeBase>
);

/** Old probability bar; `label="—"` meant "no value". `tone` is ignored: the state follows value vs `marker`. */
export const Bar = ({ p, marker, label }: { p: number; marker?: number; tone?: Tone; label?: string }) => (
  <Meter value={label === "—" ? null : p} threshold={marker} />
);

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <EmptyState title={title} description={children} />
);

export const Copy = ({ text, label = "Copy" }: { text: string; label?: string }) => (
  <CopyButton value={text} label={label} variant="outline" />
);

export const Stat = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <StatBase label={label} value={value} detail={sub} />
);

export const LoadMore = ({ p }: { p: Parameters<typeof LoadMoreBase>[0]["list"] }) => <LoadMoreBase list={p} />;
