"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/load";
import { Busy, Skeleton } from "@/components/ui/skeleton";
import { StepDots } from "@/components/ui/step-dots";

/** Calls `fn` every `ms` while `ms` is a number (null pauses). `fn` may change every render. */
export function useInterval(fn: () => void, ms: number | null) {
  const last = useRef(fn);
  useEffect(() => {
    last.current = fn;
  });
  useEffect(() => {
    if (ms === null) return;
    const t = setInterval(() => last.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function Brand() {
  return (
    <Link href="/" className="hover-pill relative inline-flex items-center gap-2 rounded-md font-semibold outline-none [--pill-inset:-4px_-8px] focus-visible:ring-2 focus-visible:ring-ring">
      <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-5">
        <path d="M2.5 11.5a6 6 0 1 1 11 0" />
        <path d="m8 9 2.5-3.5" />
      </svg>
      Jev Triage
    </Link>
  );
}

/** The onboarding frame: h-16 header, a scrolling middle, and (when given) a pinned footer. Outside the app shell. */
export function Frame({ right, footer, children }: { right?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="shrink-0">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          {right}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      {footer}
    </div>
  );
}

export function FlowSkeleton() {
  return (
    <Frame>
      <Busy className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-10 sm:px-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-6 h-40 w-full" />
      </Busy>
    </Frame>
  );
}

export function FlowError({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <Frame>
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <ErrorState error={error} retry={retry} />
      </div>
    </Frame>
  );
}

export interface FlowStep {
  id: string;
  /** One or two words, shown as "Step n of N · name". */
  name: string;
  /** At most 6 words. */
  title: string;
  /** At most 8 words. */
  subtitle?: string;
  /** Tags the step "Optional". The step body still renders its own Continue. */
  optional?: boolean;
  /** Adds a ghost button with this label that moves on without doing the step. */
  skip?: string;
  body: ReactNode;
}

const FlowContext = createContext<{ next: () => void; slot: HTMLElement | null }>({ next: () => {}, slot: null });
export const useFlow = () => useContext(FlowContext);

/** The footer's primary button. Render it from inside a step body (it portals into the footer); `onClick` defaults to "next step". */
export function Primary({ children, onClick, variant = "primary", ...props }: ButtonProps) {
  const { slot, next } = useFlow();
  if (!slot) return null;
  return createPortal(
    // Only the primary variant answers Enter; a ghost companion ("Continue without waiting") does not.
    <Button data-primary={variant === "primary" ? "" : undefined} variant={variant} size="lg" onClick={onClick ?? next} {...props}>
      {children}
    </Button>,
    slot,
  );
}

export function Continue(props: ButtonProps) {
  return (
    <Primary {...props}>
      Continue
      <ArrowRight />
    </Primary>
  );
}

// Enter keeps its native meaning on these unless the element opts in with data-enter-continues.
const NATIVE_ENTER = "a[href], button, input, select, textarea, summary, [role='button'], [role='tab'], [role='radio'], [role='switch'], [role='menuitem']";

/**
 * Webora-style wizard: step dots, a heading that takes focus on every step change, an 8px directional slide
 * (instant under reduced motion), Back / Skip / primary footer, and Enter to continue.
 */
export function Flow({ steps, initial = 0, right }: { steps: FlowStep[]; initial?: number; right?: ReactNode }) {
  const [nav, setNav] = useState({ i: Math.min(initial, steps.length - 1), dir: 1 });
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const slide = useRef<HTMLDivElement>(null);
  const prev = useRef(nav.i);
  const step = steps[nav.i];
  const go = (to: number) => setNav((n) => ({ i: Math.max(0, Math.min(steps.length - 1, to)), dir: to >= n.i ? 1 : -1 }));
  const next = () => go(nav.i + 1);

  useEffect(() => {
    if (prev.current === nav.i) return;
    prev.current = nav.i;
    scroller.current?.parentElement?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    slide.current?.animate(
      [{ opacity: 0, transform: `translateX(${nav.dir * 8}px)` }, { opacity: 1, transform: "none" }],
      { duration: 250, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  }, [nav]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.repeat || e.isComposing || e.defaultPrevented || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest(NATIVE_ENTER) && !t.closest("[data-enter-continues]")) return;
      if (t?.closest("[role='dialog']")) return;
      const btn = slot?.querySelector<HTMLButtonElement>("[data-primary]");
      if (btn && !btn.disabled) {
        e.preventDefault();
        btn.click();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [slot]);

  return (
    <Frame
      right={right}
      footer={
        <footer className="shrink-0 border-t bg-background">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {nav.i > 0 ? (
              <Button variant="ghost" size="lg" onClick={() => go(nav.i - 1)}>
                <ArrowLeft />
                Back
              </Button>
            ) : (
              <span aria-hidden />
            )}
            <div className="flex items-center gap-2">
              {step.skip ? (
                <Button variant="ghost" size="lg" onClick={next}>
                  {step.skip}
                </Button>
              ) : null}
              <div ref={setSlot} className="contents" />
            </div>
          </div>
        </footer>
      }
    >
      <div ref={scroller} className="mx-auto w-full max-w-3xl px-4 pt-8 pb-10 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-250 sm:px-6 sm:pt-12">
        <div className="mb-6 flex items-center gap-3">
          <StepDots step={nav.i + 1} total={steps.length} name={step.name} />
          {step.optional ? <span className="text-xs text-muted-foreground">Optional</span> : null}
        </div>
        <div ref={slide}>
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
            {step.title}
          </h1>
          {step.subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{step.subtitle}</p> : null}
          <div key={step.id} className="mt-8">
            <FlowContext value={{ next, slot }}>{step.body}</FlowContext>
          </div>
        </div>
      </div>
    </Frame>
  );
}
