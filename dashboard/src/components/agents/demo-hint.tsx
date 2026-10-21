"use client";
import { Bot } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import { claudeCode, useMcpUrl } from "./connect";

/** Demo login: the one command that lets an agent read the sample queue. No token, read-only. */
export function DemoAgentHint() {
  const url = useMcpUrl();
  return (
    <section aria-label="Try it from your agent" className="mt-2 flex flex-col gap-2 border-t pt-4">
      <h2 className="flex items-center gap-1.5 text-[13px] font-medium"><Bot aria-hidden className="size-3.5" />Try it from your agent</h2>
      <CodeBlock code={claudeCode(url)} />
      <p className="text-xs text-muted-foreground">Read-only sample data. No token needed. Works with any MCP client.</p>
    </section>
  );
}
