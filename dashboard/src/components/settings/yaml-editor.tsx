"use client";
import { useRef, type KeyboardEvent } from "react";

/**
 * Plain textarea with a line-number gutter (CSS counter), Tab = 2 spaces, Enter keeps the indent, mod+S saves.
 * Esc then Tab leaves the field, so keyboard users are never trapped.
 * ponytail: no syntax highlighting or error squiggles; reach for CodeMirror if the config grows beyond a screen or two.
 */
export function YamlEditor({ id, value, onChange, onSave, invalid, describedBy }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const gutter = useRef<HTMLDivElement>(null);
  const escaped = useRef(false);
  const lines = value.split("\n").length;

  function insert(el: HTMLTextAreaElement, text: string) {
    // execCommand keeps the native undo stack; setRangeText is the fallback.
    if (!document.execCommand("insertText", false, text)) {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
      onChange(el.value);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      return onSave();
    }
    if (e.key === "Tab" && !e.shiftKey && !escaped.current) {
      e.preventDefault();
      return insert(el, "  ");
    }
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
      const before = el.value.slice(0, el.selectionStart);
      const line = before.slice(before.lastIndexOf("\n") + 1);
      e.preventDefault();
      return insert(el, "\n" + /^ */.exec(line)![0] + (/:\s*$/.test(line) ? "  " : ""));
    }
    escaped.current = e.key === "Escape";
  }

  return (
    <div className="flex h-[min(32rem,60dvh)] min-h-64 overflow-hidden rounded-lg border border-input bg-card shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring has-[[aria-invalid=true]]:border-destructive">
      <div
        ref={gutter}
        aria-hidden
        className="w-12 shrink-0 overflow-hidden border-r bg-muted/30 pt-3 pb-8 text-right font-mono text-base leading-6 text-muted-foreground/60 sm:text-[13px] select-none [counter-reset:ln]"
      >
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="pr-3 [counter-increment:ln] before:content-[counter(ln)]" />
        ))}
      </div>
      <textarea
        id={id}
        value={value}
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
        className="block min-w-0 flex-1 resize-none overflow-auto bg-transparent px-3 py-3 font-mono text-base leading-6 whitespace-pre sm:text-[13px] outline-none"
      />
    </div>
  );
}
