"use client";
import Link from "next/link";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { Tabs } from "@/components/ui/tabs";
import { repoPath } from "@/lib/fmt";
import { useApi } from "@/lib/use-api";

/** Empty state for a repo with no reports: copyable curl and GitHub Actions step, and where to get a token. */
export function ConnectCi({ repoId, fullName }: { repoId: number; fullName: string }) {
  const [tab, setTab] = useState("curl");
  const url = useApi<{ public_url: string }>("/api/setup/status").data?.public_url;
  const base = url ?? (typeof location === "undefined" ? "" : location.origin);
  const curl = `curl -fsS -X POST "${base}/api/v1/reports" \\
  -H "Authorization: Bearer $OSS_INBOX_CI_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "repo": "${fullName}",
    "title": "test_total fails on main",
    "failing_test": "tests/test_cart.py::test_total",
    "source": "ci"
  }'`;
  const actions = `- name: Report failure to OSS Inbox
  if: failure() && github.event_name == 'push'
  continue-on-error: true
  env:
    OSS_INBOX_CI_TOKEN: \${{ secrets.OSS_INBOX_CI_TOKEN }}
  run: |
    jq -n --arg repo "$GITHUB_REPOSITORY" --arg title "CI failed: $GITHUB_WORKFLOW / $GITHUB_JOB" \\
      --arg run "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \\
      '{repo: $repo, title: $title, run_url: $run, source: "ci"}' |
    curl -fsS -X POST "${base}/api/v1/reports" \\
      -H "Authorization: Bearer $OSS_INBOX_CI_TOKEN" -H "Content-Type: application/json" -d @-`;
  return (
    <CardSection
      title="Connect your CI"
      description="Send CI failures here. OSS Inbox opens an issue, adds to one, or ignores each."
      action={
        <Button asChild variant="outline" size="sm">
          <Link href={repoPath(repoId, "settings")}>
            <KeyRound aria-hidden />
            Get a token
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs
          aria-label="Example code"
          items={[{ id: "curl", label: "curl" }, { id: "actions", label: "GitHub Actions" }]}
          value={tab}
          onValueChange={setTab}
        />
        {tab === "curl" ? <CodeBlock code={curl} filename="Terminal" /> : <CodeBlock code={actions} filename=".github/workflows/ci.yml" />}
        <p className="text-[13px] text-muted-foreground">
          Create a token in Settings and save it in your CI as the secret <code className="font-mono text-foreground">OSS_INBOX_CI_TOKEN</code>. Only admins can create tokens. Each works for this repository only.
        </p>
      </div>
    </CardSection>
  );
}
