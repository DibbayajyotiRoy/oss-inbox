"use client";
import { Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CopyForAgent, queueContext } from "@/components/agents/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineCode } from "@/components/ui/inline-code";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { age, pct } from "@/lib/fmt";
import { answerText, isWorry, questionLabel } from "@/lib/questions";
import { featureName, type ItemDetail, type QueueEntry, type Run, type Suggestion } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { OpenedBy } from "./author";
import { Markdown } from "./markdown";
import { itemRef, kindName, reasonText } from "./row";
import { Verdict } from "./verdict";
import { OpenInVSCode } from "./vscode";

export type Act = "accept" | "dismiss" | "release";

/** Options of a suggestion, most probable first. Key `n` picks the nth. */
export const optionsOf = (s: Suggestion) => {
  const o = s.options.length ? s.options : Object.keys(s.probabilities);
  return [...o].sort((a, b) => (s.probabilities[b] ?? 0) - (s.probabilities[a] ?? 0)).slice(0, 9);
};

/** Lags `value` so holding j/k does not fetch every row it passes. */
function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const keycap = "max-lg:hidden";

const Tip = ({ tip, children }: { tip: string; children: ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="top" className="max-w-64 text-pretty">{tip}</TooltipContent>
  </Tooltip>
);

const OPEN = "See everything Jev found about this item.";
const HELP = {
  review: [
    ["Accept", "Jev was right. Your answer is saved and Jev learns from it."],
    ["Dismiss", "Skip it. Nothing is saved and Jev learns nothing."],
    ["Open", OPEN],
  ],
  held: [
    ["Release to triage", "It's fine. It goes to normal triage, like any other item."],
    ["Confirm hold", "The hold was right. Jev learns from it."],
    ["Dismiss", "Close it. Jev learns nothing."],
  ],
} as const;

/** Dismiss / Open / Accept (Confirm hold and Release to triage when held). Accept says what it saves ("Accept: Not breaking"). */
export function Actions({ e, held, picks, onAct }: { e: QueueEntry; held: boolean; picks: Record<number, string>; onAct: (a: Act) => void }) {
  const n = e.suggestions.length;
  const ans = (s: Suggestion) => picks[s.decision_id] ?? s.answer;
  const changed = e.suggestions.filter((s) => ans(s) !== s.answer).length;
  const what = n === 1 ? `: ${answerText(e.suggestions[0].question_id, ans(e.suggestions[0]))}` : n ? ` ${n} answers${changed ? ` (${changed} changed)` : ""}` : "";
  const dim = "border-primary-foreground/25 bg-transparent text-primary-foreground/70";
  const help = HELP[held ? "held" : "review"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tip tip={help[held ? 2 : 1][1]}>
        <Button variant="outline" size="sm" onClick={() => onAct("dismiss")}>
          Dismiss<Kbd className={keycap}>D</Kbd>
        </Button>
      </Tip>
      <div className="flex flex-1 basis-24 items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="rounded-sm text-xs text-muted-foreground outline-none link-grow hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">What do these do?</button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-72 text-pretty">
            <ul className="flex flex-col gap-1">
              {help.map(([name, text]) => (
                <li key={name}><span className="font-medium">{name}:</span> {text}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </div>
      <Tip tip={OPEN}>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/items/${e.item.id}`}>Open</Link>
        </Button>
      </Tip>
      {held ? (
        <>
          <Tip tip={help[1][1]}>
            <Button variant="outline" size="sm" onClick={() => onAct("accept")}>
              Confirm hold<Kbd className={keycap}>A</Kbd>
            </Button>
          </Tip>
          <Tip tip={help[0][1]}>
            <Button size="sm" onClick={() => onAct("release")}>
              Release to triage<Kbd className={cn(keycap, dim)}>R</Kbd>
            </Button>
          </Tip>
        </>
      ) : (
        <Tip tip={help[0][1]}>
          <Button size="sm" onClick={() => onAct("accept")}>
            <span className="truncate">Accept{what}<span className="lg:hidden"> on {itemRef(e.item)}</span></span>
            <Kbd className={cn(keycap, dim)}>A</Kbd>
          </Button>
        </Tip>
      )}
    </div>
  );
}

function SuggestionCard({ s, chosen, active, onPick }: { s: Suggestion; chosen: string; active: boolean; onPick: (o: string) => void }) {
  const label = questionLabel(s.question_id);
  return (
    <section aria-label={label} className={cn("rounded-lg border p-3 motion-safe:transition-colors motion-safe:duration-150", active && "border-ring")}>
      <p className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{s.question_id}</span>
      </p>
      <Verdict id={s.question_id} answer={s.answer} confidence={s.confidence} threshold={s.threshold} />
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">Jev acts on its own at {pct(s.threshold)} sure</p>
      <p className="mt-3 text-xs text-muted-foreground">Your answer</p>
      <div role="group" aria-label={`Answer for ${label}`} className="mt-1.5 flex flex-wrap gap-1.5">
        {optionsOf(s).map((o, j) => (
          <button
            key={o}
            type="button"
            aria-pressed={o === chosen}
            onClick={() => onPick(o)}
            className={cn(
              "hover-pill relative inline-flex h-8 items-center gap-1.5 rounded-md border pr-2.5 pl-1.5 text-[13px] outline-none motion-safe:transition-[background-color,border-color] motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-ring max-lg:h-10",
              o === chosen ? "border-foreground/40 bg-accent font-medium" : "hover:border-foreground/25",
            )}
          >
            <Kbd className={keycap}>{j + 1}</Kbd>
            {o === chosen && <Check aria-hidden className="size-3.5 lg:hidden" />}
            {answerText(s.question_id, o)}
            <span className="text-muted-foreground tabular-nums">{pct(s.probabilities[o] ?? 0)}</span>
            {o === s.answer && <span className="sr-only">(Jev&apos;s answer)</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Held items: why, then every answer Jev gave at the gate (worrying ones first), or a note that a rule held it. */
function WhyHeld({ e, runs, failed }: { e: QueueEntry; runs?: Run[]; failed: boolean }) {
  const latest = runs && [...runs].sort((a, b) => b.id - a.id).find((r) => r.decisions.length);
  const gates = (latest?.decisions ?? [])
    .filter((x) => x.question_id.startsWith("gate."))
    .sort((a, b) => +isWorry(b.question_id, b.answer) - +isWorry(a.question_id, a.answer));
  return (
    <section aria-label="Why it's held" className="rounded-lg border p-3">
      <h3 className="text-[13px] font-medium">Why it&apos;s held</h3>
      <p className="mt-1 text-sm text-pretty">{reasonText(e)}</p>
      {!runs ? (
        !failed && (
          <div className="mt-3 flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        )
      ) : gates.length ? (
        <>
          <p className="mt-3 text-xs text-muted-foreground">What Jev found</p>
          <ul className="mt-1.5 flex flex-col gap-2.5">
            {gates.map((x) => (
              <li key={x.id} className={cn(!isWorry(x.question_id, x.answer) && "text-muted-foreground")}>
                <Verdict id={x.question_id} answer={x.answer} confidence={x.confidence} threshold={x.threshold} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Held by a rule, not a model answer.</p>
      )}
    </section>
  );
}

/** The description as light markdown, about six lines, fading out under "Show more". */
function Body({ text }: { text: string }) {
  const el = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const box = el.current;
    if (!box || open) return;
    const ro = new ResizeObserver(() => setLong(box.scrollHeight > box.clientHeight + 1));
    ro.observe(box);
    return () => ro.disconnect();
  }, [text, open]);
  return (
    <div>
      <div ref={el} className={cn(!open && "max-h-30 overflow-hidden", !open && long && "[mask-image:linear-gradient(to_bottom,#000_65%,transparent)]")}>
        <Markdown text={text} />
      </div>
      {(long || open) && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-1 rounded-sm text-[13px] text-muted-foreground outline-none link-grow hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/** The focused entry: header, why it is here, every answer with its option chips, then the description and actions. */
export function Preview({ e, held, picks, active, onPick, onAct, className }: {
  e: QueueEntry; held: boolean; picks: Record<number, string>; active: number;
  onPick: (s: Suggestion, o: string) => void; onAct: (a: Act) => void; className?: string;
}) {
  const id = useDebounced(e.item.id, 150);
  const detail = useApi<ItemDetail>(`/api/items/${id}`);
  const full = detail.data?.item.id === e.item.id ? detail.data : undefined;
  const d = full?.item;
  const text = d?.body?.trim().slice(0, 4000);
  return (
    <div className={cn("flex min-h-0 w-full flex-col overflow-hidden rounded-lg border bg-card", className)}>
      <div key={e.id} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 motion-safe:animate-in motion-safe:duration-150 motion-safe:fade-in-0">
        <header>
          <h2 className="text-base leading-snug font-semibold text-balance">
            <Link href={`/items/${e.item.id}`} className="outline-none link-grow"><InlineCode text={e.item.title} /></Link>
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            <Badge variant="outline">{kindName(e.item.kind)}</Badge>
            {e.item.html_url ? (
              <a href={e.item.html_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 tabular-nums link-grow hover:text-foreground">
                {itemRef(e.item)}<ExternalLink aria-hidden className="size-3" /><span className="sr-only">Open on GitHub</span>
              </a>
            ) : (
              <span className="tabular-nums">{itemRef(e.item)}</span>
            )}
            <OpenedBy who={e.item} at={e.item.created_at} />
            <span className="tabular-nums">waiting {age(e.age_hours)}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <OpenInVSCode item={e.item} />
            <CopyForAgent text={() => queueContext(e, held)} />
          </div>
        </header>

        {held ? (
          <WhyHeld e={e} runs={full?.runs} failed={!!detail.error} />
        ) : (
          <div className="flex items-start gap-2 text-sm">
            <Badge className="mt-0.5">{featureName(e.feature)}</Badge>
            <p className="min-w-0 text-pretty">{reasonText(e)}</p>
          </div>
        )}

        {e.suggestions.length > 0 && (
          <div className="flex flex-col gap-3">
            {e.suggestions.map((s, i) => (
              <SuggestionCard key={s.decision_id} s={s} chosen={picks[s.decision_id] ?? s.answer} active={e.suggestions.length > 1 && i === active} onPick={(o) => onPick(s, o)} />
            ))}
          </div>
        )}

        <div className="min-h-16">
          {text ? (
            <Body text={text} />
          ) : d || detail.error ? (
            <p className="text-sm text-muted-foreground">{detail.error ? "Couldn't load the description." : "No description."}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          )}
        </div>
      </div>
      <div className="border-t bg-card p-3">
        <Actions e={e} held={held} picks={picks} onAct={onAct} />
      </div>
    </div>
  );
}

export const PreviewSkeleton = () => (
  <div className="flex w-full flex-col gap-5 rounded-lg border bg-card p-5">
    <div className="flex flex-col gap-2">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3.5 w-1/3" />
    </div>
    <Skeleton className="h-4 w-1/2" />
    <div className="flex flex-col gap-2">
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-11/12" />
    </div>
    <Skeleton className="h-28 w-full" />
  </div>
);
