"use client";
import { Bot } from "lucide-react";
import { OUTCOME } from "@/components/review/item-sections";
import { kindName, reasonText } from "@/components/review/row";
import { Button } from "@/components/ui/button";
import { writeClipboard } from "@/components/ui/copy-button";
import { toast } from "@/components/ui/toaster";
import { pct } from "@/lib/fmt";
import { answerText } from "@/lib/questions";
import type { Decision, ItemSummary, QueueEntry } from "@/lib/types";

type Reading = Pick<Decision, "question_id" | "answer" | "confidence" | "threshold" | "outcome">;

/** A compact markdown block about one item, to paste into any AI chat. `why` is the plain-words reason it needs a person. */
export function itemContext(i: ItemSummary & { state?: string }, readings: Reading[], why?: string, held?: boolean) {
  const lines = readings.map((x) => {
    const o = (OUTCOME[x.outcome]?.label ?? x.outcome).toLowerCase();
    return `- ${answerText(x.question_id, x.answer)}: ${pct(x.confidence)} sure, acts on its own at ${pct(x.threshold)} (${o})`;
  });
  return [
    `## ${i.title}${i.number ? ` (#${i.number})` : ""}`,
    [kindName(i.kind), i.html_url, i.author && `by ${i.author}`, i.state, `OSS Inbox item ${i.id}`].filter(Boolean).join(" · "),
    ...(why ? [`${held ? "Why it is held" : "Why it needs a person"}: ${why}`] : []),
    "",
    ...(lines.length ? ["What Jev decided:", ...lines] : ["Jev has not looked at it yet."]),
  ].join("\n") + "\n";
}

/** From a queue row: every suggestion is still waiting (or held). */
export const queueContext = (e: QueueEntry, held: boolean) =>
  itemContext(e.item, e.suggestions.map((s) => ({ ...s, outcome: held ? "held" : "queued" })), reasonText(e), held);

export async function copyForAgent(text: string) {
  try {
    await writeClipboard(text);
    toast.success("Copied for your agent", { description: "Paste it into any AI chat." });
  } catch {
    toast.error("Couldn't copy to clipboard");
  }
}

/** `text` is built on click, so a row that is never copied costs nothing. */
export function CopyForAgent({ text, size = "sm" }: { text: () => string; size?: "sm" | "md" }) {
  return (
    <Button variant="outline" size={size} onClick={() => copyForAgent(text())}>
      <Bot aria-hidden />Copy for agent
    </Button>
  );
}
