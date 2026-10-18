import type { ReactNode } from "react";
import { InlineCode } from "@/components/ui/inline-code";

const LIST = /^\s*([-*]|\d+\.)\s+/;
const FENCE = /^\s*```/;
const HEAD = /^#{1,6}\s+/;

/** **bold** and `code` only; React text nodes, so a stray `<script>` stays text. */
const inline = (s: string) =>
  s.split(/\*\*([^*\n]+)\*\*/).map((p, i) =>
    i % 2 ? <strong key={i} className="font-semibold text-foreground"><InlineCode text={p} /></strong> : <InlineCode key={i} text={p} />,
  );

/**
 * A tiny GitHub-flavoured subset for issue and PR bodies: paragraphs (line breaks kept), # headings as bold lines,
 * flat bullet and numbered lists, fenced code, **bold**, `code`. Anything else (links, tables, HTML) shows as plain text.
 * ponytail: no nesting, no links; add a real parser if bodies need them.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; ) {
    const key = blocks.length;
    const line = lines[i];
    if (FENCE.test(line)) {
      const code: string[] = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++) code.push(lines[i]);
      i++;
      blocks.push(<pre key={key} className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-5 text-foreground">{code.join("\n")}</pre>);
    } else if (LIST.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      for (; i < lines.length && LIST.test(lines[i]); i++) items.push(lines[i].replace(LIST, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key} className={`ml-5 space-y-0.5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((t, j) => <li key={j}>{inline(t)}</li>)}
        </List>,
      );
    } else if (HEAD.test(line)) {
      blocks.push(<p key={key} className="font-medium text-foreground">{inline(line.replace(HEAD, ""))}</p>);
      i++;
    } else if (!line.trim()) {
      i++;
    } else {
      const para: string[] = [];
      for (; i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !LIST.test(lines[i]) && !HEAD.test(lines[i]); i++) para.push(lines[i]);
      blocks.push(<p key={key} className="whitespace-pre-line">{inline(para.join("\n"))}</p>);
    }
  }
  return <div className="space-y-2 text-sm break-words text-muted-foreground">{blocks}</div>;
}
