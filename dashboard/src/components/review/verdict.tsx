import { Meter } from "@/components/ui/meter";
import { pct } from "@/lib/fmt";
import { answerText, questionLabel } from "@/lib/questions";
import { cn } from "@/lib/utils";

/** One answer in plain words, "Not backed by evidence" with a Meter reading "91% sure". The question is the hover title. */
export function Verdict({ id, answer, confidence, threshold, small, className }: {
  id: string; answer: string; confidence: number; threshold?: number; small?: boolean; className?: string;
}) {
  const text = answerText(id, answer);
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span title={questionLabel(id)} className={cn("min-w-0 flex-1 text-pretty", small ? "truncate text-xs text-muted-foreground" : "text-sm")}>{text}</span>
      <Meter className="w-36 shrink-0" value={confidence} threshold={threshold} label={text} hideLabel valueText={`${pct(confidence)} sure`} />
    </div>
  );
}
