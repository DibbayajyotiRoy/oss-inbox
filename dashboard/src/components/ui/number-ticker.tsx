"use client";

// Adapted from beui.dev's Number "Ticker" (beui.dev/components/motion/number):
// each digit is a 0–9 column that rolls to its place. Changes from upstream:
// - `animateOnMount={false}` shows the value as rendered on the server and
//   rolls only when it changes (a balance, not a reveal).
// - `format` gets the raw value, so a formatter with decimals ("812.5") is
//   not rounded first; `locale` formats as en-US, so hydration matches.
// - Digits sit on the surrounding text's baseline: each column clips with
//   `overflow: clip` (unlike `hidden`, it keeps the box's baseline) around an
//   invisible in-flow "0" that gives it width and a baseline, and the rolling
//   column is laid out so its glyph lands exactly on that baseline.
// Instant under reduced motion (useReducedMotion).

import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export interface NumberTickerProps {
  value: number;
  /** Digits to pad to (left). */
  pad?: number;
  /** Per-digit roll duration in seconds. */
  duration?: number;
  /** Stagger between digits on the entrance roll. */
  stagger?: number;
  /** Roll in from 0 on mount (upstream behaviour). False: render the value, roll only on change. */
  animateOnMount?: boolean;
  /** With animateOnMount: wait until the element enters the viewport. */
  startOnView?: boolean;
  prefix?: string;
  suffix?: string;
  /** Add a small blur during digit rolls. */
  blur?: boolean;
  className?: string;
  digitClassName?: string;
  /** en-US group separators (commas). Server-component safe. */
  locale?: boolean;
  /** Custom formatter, given the raw value. Client-only: server components use `locale`. */
  format?: (value: number) => string;
}

// A column's row height. The in-flow "0" uses it as its line height and each
// row centres a line-height-1 glyph in it, so both put the baseline at the
// same offset whatever the font's metrics.
const DIGIT_HEIGHT_EM = 1.1;
const DIGITS = Array.from({ length: 10 }, (_, n) => n);

export function NumberTicker({
  value,
  pad,
  duration = 0.9,
  stagger = 0.04,
  animateOnMount = true,
  startOnView = true,
  prefix,
  suffix,
  blur = false,
  className,
  digitClassName,
  locale,
  format,
}: NumberTickerProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const inView = useInView(containerRef, { once: true, amount: 0.6 });
  // `once`: inView stays true after the first sighting, so this never un-arms.
  const armed = !animateOnMount || !startOnView || inView;

  const text = useMemo(() => {
    const formatted = format
      ? format(value)
      : locale
        ? Math.round(value).toLocaleString("en-US")
        : String(Math.round(value));
    return pad ? formatted.padStart(pad, "0") : formatted;
  }, [value, pad, format, locale]);
  const glyphs = useMemo(() => {
    const chars = text.split("");
    // Key by place value (position from the right): a changing digit keeps its
    // identity and rolls to the new value instead of remounting and replaying
    // from 0. Growing numbers add glyphs on the left without re-keying the
    // ones, tens, hundreds already on screen.
    return chars.map((char, i) => ({ char, id: `g-${chars.length - 1 - i}` }));
  }, [text]);
  const readableText = `${prefix ?? ""}${text}${suffix ?? ""}`;

  // Stagger is an entrance flourish. Once the reveal has played (or when there
  // is none), value changes roll every digit at once: a per-digit delay on live
  // updates reads as lag.
  const [entered, setEntered] = useState(!animateOnMount);
  useEffect(() => {
    if (!armed || entered) return;
    const total = (duration + glyphs.length * stagger) * 1000;
    const t = window.setTimeout(() => setEntered(true), total);
    return () => window.clearTimeout(t);
  }, [armed, entered, duration, stagger, glyphs.length]);

  return (
    <span ref={containerRef} className={cn("whitespace-nowrap tabular-nums text-brand", className)}>
      <span className="sr-only">{readableText}</span>
      <span aria-hidden="true">
        {prefix ? <span>{prefix}</span> : null}
        {glyphs.map(({ char, id }, i) => {
          if (!/\d/.test(char)) return <span key={id}>{char}</span>;
          return (
            <Digit
              key={id}
              digit={armed ? Number(char) : 0}
              animateOnMount={animateOnMount}
              delay={entered ? 0 : i * stagger}
              duration={duration}
              blur={blur}
              className={digitClassName}
            />
          );
        })}
        {suffix ? <span>{suffix}</span> : null}
      </span>
    </span>
  );
}

function Digit({
  digit,
  animateOnMount,
  delay,
  duration,
  blur,
  className,
}: {
  digit: number;
  animateOnMount: boolean;
  delay: number;
  duration: number;
  blur: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const columnRef = useRef<HTMLSpanElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    // Blur accompanies a roll, so none on a mount that doesn't roll.
    const first = !mounted.current;
    mounted.current = true;
    if (reduce || !blur || !columnRef.current || !Number.isFinite(digit)) return;
    if (first && !animateOnMount) return;

    const node = columnRef.current;
    const controls = animate(
      node,
      { filter: ["blur(10px)", "blur(0px)"] },
      { duration: Math.min(duration * 0.75, 0.32), delay, ease: EASE_OUT },
    );

    return () => {
      controls.stop();
      node.style.filter = "blur(0px)";
    };
  }, [animateOnMount, blur, delay, digit, duration, reduce]);

  return (
    <span
      className={cn("relative inline-block overflow-clip align-baseline", className)}
      style={{ height: `${DIGIT_HEIGHT_EM}em`, lineHeight: `${DIGIT_HEIGHT_EM}em` }}
    >
      {/* Width and baseline for the column; never seen. */}
      <span className="invisible">0</span>
      <motion.span
        ref={columnRef}
        initial={animateOnMount ? { y: 0 } : false}
        animate={{ y: `-${digit * DIGIT_HEIGHT_EM}em` }}
        transition={reduce ? { duration: 0 } : { duration, delay, ease: EASE_OUT }}
        className={cn("absolute inset-x-0 top-0 flex flex-col items-center", blur ? "will-change-[transform,filter]" : "will-change-transform")}
      >
        {DIGITS.map((n) => (
          <span key={n} className="flex items-center justify-center leading-none" style={{ height: `${DIGIT_HEIGHT_EM}em` }}>
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}
