// Renders `backtick` spans in issue titles and short text as <code>; everything else stays plain text.
export function InlineCode({ text }: { text: string }) {
  return text.split(/(`[^`\n]+`)/).map((part, i) =>
    part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={i} className="rounded-sm bg-muted px-1 py-px font-mono text-[0.92em]">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}
