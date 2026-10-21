"use client";
import { useState, useSyncExternalStore } from "react";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { Tabs } from "@/components/ui/tabs";

const noop = () => () => {};
/** This dashboard's address; the MCP endpoint is `${origin}/api/mcp` (the dashboard proxies /api to the server). */
export const useMcpUrl = () => useSyncExternalStore(noop, () => `${location.origin}/api/mcp`, () => "https://your-inbox.example/api/mcp");

const NAME = "oss-inbox";
const json = (o: unknown) => JSON.stringify(o, null, 2) + "\n";
const entry = (url: string, token: string) => ({ url, headers: { Authorization: `Bearer ${token}` } });

/** Ready-to-paste setup for each client. Templates, not logic. */
export const claudeCode = (url: string, token?: string) =>
  `claude mcp add --transport http ${token ? NAME : `${NAME}-demo`} ${url}${token ? ` --header "Authorization: Bearer ${token}"` : ""}`;
const cursor = (url: string, token: string) => json({ mcpServers: { [NAME]: entry(url, token) } });
const vscode = (url: string, token: string) => json({ servers: { [NAME]: { type: "http", ...entry(url, token) } } });

const TABS = [
  { id: "claude", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "vscode", label: "VS Code" },
  { id: "other", label: "Other" },
];

/** The four ways to connect with this token: one command or file per client, then plain URL + header for anything else. */
export function Connect({ url, token }: { url: string; token: string }) {
  const [tab, setTab] = useState("claude");
  const rows = [["URL", url], ["Header", `Authorization: Bearer ${token}`]];
  return (
    <div className="flex flex-col gap-3">
      <Tabs aria-label="Agent" value={tab} onValueChange={setTab} items={TABS} />
      {tab === "claude" && <CodeBlock code={claudeCode(url, token)} filename="Run in your terminal" />}
      {tab === "cursor" && <CodeBlock code={cursor(url, token)} filename=".cursor/mcp.json" />}
      {tab === "vscode" && <CodeBlock code={vscode(url, token)} filename=".vscode/mcp.json" />}
      {tab === "other" && (
        <dl className="divide-y divide-border rounded-lg border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
              <dt className="w-14 shrink-0 text-xs text-muted-foreground">{k}</dt>
              <dd className="min-w-0 flex-1 font-mono text-[13px] break-all">{v}</dd>
              <CopyButton value={v} />
            </div>
          ))}
        </dl>
      )}
      <p className="text-xs text-muted-foreground">Works with any client that speaks MCP over HTTP.</p>
    </div>
  );
}
