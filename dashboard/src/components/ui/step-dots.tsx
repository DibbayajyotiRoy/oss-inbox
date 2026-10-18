import { cn } from "@/lib/utils"

/** Onboarding progress: dots plus a muted "Step 2 of 6 · Labels" caption (no chip). `step` is 1-based; `name` is one or two words. */
export function StepDots({ step, total, name, className }: { step: number; total: number; name?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <ol aria-hidden className="flex items-center gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={cn(
              "h-1.5 rounded-full motion-safe:transition-[width,background-color] motion-safe:duration-250 motion-safe:ease-settle",
              i + 1 === step ? "w-5 bg-primary" : i + 1 < step ? "w-1.5 bg-primary/60" : "w-1.5 bg-border"
            )}
          />
        ))}
      </ol>
      <p className="text-xs text-muted-foreground tabular-nums">
        Step {step} of {total}
        {name ? ` · ${name}` : null}
      </p>
    </div>
  )
}
