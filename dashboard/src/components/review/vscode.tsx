"use client";
import { Code, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CodeBlock } from "@/components/ui/code-block";
import { Dialog } from "@/components/ui/dialog";
import type { ItemSummary } from "@/lib/types";

const KEY = "jev:vscode-ok";
// The exact shape the extension accepts (src/common/uri.ts: fromOpenOrCheckoutPullRequestWebviewUri).
const PR_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/;

const remembered = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * "Open in VS Code" for a pull request. The first click asks for consent (it starts an app on this computer with
 * untrusted code); "Don't ask again" skips the dialog next time. Renders nothing for anything but a GitHub PR.
 * Needs the GitHub Pull Requests extension; the dialog offers the browser editor and `gh pr checkout` as fallbacks.
 */
export function OpenInVSCode({ item }: { item: Pick<ItemSummary, "kind" | "html_url" | "author"> }) {
  const [open, setOpen] = useState(false);
  const [again, setAgain] = useState(false);
  const m = item.kind === "pr" ? PR_URL.exec(item.html_url ?? "") : null;
  if (!m) return null;
  const [, owner, repo, n] = m;
  const launch = () => {
    window.location.href = `vscode://github.vscode-pull-request-github/checkout-pull-request?uri=${encodeURIComponent(item.html_url!)}`;
  };
  const go = () => {
    if (again) {
      try {
        localStorage.setItem(KEY, "1");
      } catch {}
    }
    setOpen(false);
    launch();
  };
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => (remembered() ? launch() : setOpen(true))}>
        <Code aria-hidden />Open in VS Code
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Open PR #${n} in VS Code?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={go}>Open in VS Code</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-pretty">
            This opens VS Code on your computer and checks out the PR branch from {item.author ? `@${item.author}` : "its author"}. The code is untrusted,
            so VS Code will ask whether you trust the folder. Nothing is sent to Jev Triage.
          </p>
          <p className="text-muted-foreground">You need the GitHub Pull Requests extension in VS Code for this.</p>
          <label className="flex w-fit cursor-pointer items-center gap-2">
            <Checkbox checked={again} onCheckedChange={setAgain} />
            Don&apos;t ask again
          </label>
          <div className="flex flex-col gap-3 border-t pt-4">
            <p className="font-medium">Other ways</p>
            <p>
              <a href={`https://vscode.dev/github/${owner}/${repo}/pull/${n}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-4">Open in browser editor<ExternalLink aria-hidden className="size-3.5" /></a>
              <span className="text-muted-foreground"> (nothing to install)</span>
            </p>
            <p className="text-muted-foreground">Or run this in a terminal:</p>
            <CodeBlock code={`gh pr checkout ${n} --repo ${owner}/${repo}`} />
          </div>
        </div>
      </Dialog>
    </>
  );
}
