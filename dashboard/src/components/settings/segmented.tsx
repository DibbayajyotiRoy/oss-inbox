"use client";
import { useRef, type KeyboardEvent } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { indicatorMotion, useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { cn } from "@/lib/utils";

export type SegOption<T extends string> = {
  id: T;
  label: string;
  /** Why this option cannot be picked; shown in a tooltip. Stays focusable so keyboard users can read it. */
  blocked?: string | false;
};

/** Radio group drawn as a segmented control with a gliding fill (the Tabs look, but options can be blocked). */
export function Segmented<T extends string>({ value, options, onChange, label, busy }: {
  value: T;
  options: SegOption<T>[];
  onChange: (id: T) => void;
  label: string;
  busy?: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  useSlidingIndicator(list, fill, '[role="radio"][data-state="on"]');

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    for (let n = 1; n <= options.length; n++) {
      const j = (i + step * n + options.length * n) % options.length;
      if (options[j].blocked) continue;
      list.current?.querySelectorAll<HTMLElement>('[role="radio"]')[j]?.focus();
      return onChange(options[j].id);
    }
  }

  return (
    <div
      ref={list}
      role="radiogroup"
      aria-label={label}
      aria-busy={busy || undefined}
      className={cn("relative isolate inline-flex w-fit items-center gap-0.5 rounded-lg border bg-card p-0.5 motion-safe:transition-opacity motion-safe:duration-150", busy && "opacity-60")}
    >
      <span ref={fill} aria-hidden className={cn(indicatorMotion, "inset-y-0.5 rounded-md bg-accent")} />
      {options.map((o, i) => {
        const on = o.id === value;
        const btn = (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={!!o.blocked || busy || undefined}
            data-state={on ? "on" : "off"}
            tabIndex={on ? 0 : -1}
            onClick={() => !o.blocked && !busy && onChange(o.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative h-8 rounded-md px-3 text-[13px] font-medium outline-none motion-safe:transition-colors motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-ring",
              on ? "text-foreground" : "text-muted-foreground",
              o.blocked ? cn("cursor-not-allowed", !on && "opacity-50") : !on && "hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
        return o.blocked ? (
          <Tooltip key={o.id}>
            <TooltipTrigger asChild>{btn}</TooltipTrigger>
            <TooltipContent>{o.blocked}</TooltipContent>
          </Tooltip>
        ) : (
          btn
        );
      })}
    </div>
  );
}
