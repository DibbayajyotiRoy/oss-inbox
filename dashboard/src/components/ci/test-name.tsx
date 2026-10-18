import { cn } from "@/lib/utils";

// Lets a long path wrap after a slash (before it would have to break mid-word) without altering the copied text.
const wrap = (path: string) => path.split(/(?<=\/)/).flatMap((part, i) => [i ? <wbr key={i} /> : null, part]);

/** The failing test inside a CI report title ("CI failure: <test> on <branch>"), undefined for any other title. */
export const testOf = (title: string) => /^CI failure: (.+) on \S+$/.exec(title)?.[1];

/** A test id with the file path quieted and the test name emphasised: the part people scan for. */
export function TestName({ id, className }: { id: string; className?: string }) {
  const i = id.includes("::") ? id.lastIndexOf("::") + 2 : 0;
  return (
    <span className={cn("font-mono text-[13px] break-words", className)} title={id}>
      <span className="text-muted-foreground">{wrap(id.slice(0, i))}</span>
      <span className="font-medium text-foreground">{id.slice(i)}</span>
    </span>
  );
}
