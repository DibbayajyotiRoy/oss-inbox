import { cn } from "@/lib/utils"
import { CopyButton } from "./copy-button"

/** Monospace block with a copy button (icon crossfade). Optional `filename` header and faint line numbers. */
export function CodeBlock({
  code,
  filename,
  lineNumbers = false,
  className,
}: {
  code: string
  filename?: string
  lineNumbers?: boolean
  className?: string
}) {
  const lines = code.replace(/\n$/, "").split("\n")
  return (
    <div data-slot="code-block" className={cn("relative overflow-hidden rounded-lg border border-border bg-muted/30", className)}>
      {filename ? (
        <div className="flex h-10 items-center border-b border-border bg-muted/40 pr-14 pl-4">
          <span className="truncate font-mono text-xs text-foreground">{filename}</span>
        </div>
      ) : null}
      <CopyButton value={code} className={cn("absolute right-1.5 z-10", filename ? "top-1.5" : "top-1")} />
      <pre
        tabIndex={0}
        aria-label={filename ? `${filename} contents` : "Code"}
        className="overflow-x-auto py-3 font-mono text-[13px] leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <code className="grid min-w-max">
          {lines.map((line, i) => (
            <span key={i} className={cn("flex pr-12", !lineNumbers && "pl-4")}>
              {lineNumbers ? (
                <span aria-hidden className="w-10 shrink-0 pr-4 text-right text-muted-foreground/45 select-none">
                  {i + 1}
                </span>
              ) : null}
              <span className="whitespace-pre">{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}
