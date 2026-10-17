"use client";
import { useRepo } from "@/components/repo";
import { Empty, Load } from "@/components/ui";
import { day } from "@/lib/fmt";
import type { FlakyTest } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function Flaky() {
  const { repo } = useRepo();
  const res = useApi<{ items: FlakyTest[] }>(`/api/repos/${repo.id}/flaky-tests`);
  return (
    <Load
      res={res}
      isEmpty={(d) => d.items.length === 0}
      empty={
        <Empty title="No flaky tests recorded">
          A test is listed here when the CI gate sees it fail repeatedly across reports and classifies it as flaky. Nothing has been classified yet.
        </Empty>
      }
    >
      {(d) => (
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>#</th><th>Test</th><th>Occurrences</th><th>First seen</th><th>Last seen</th><th>Last run</th></tr></thead>
            <tbody>
              {[...d.items].sort((a, b) => b.occurrences - a.occurrences).map((t, i) => (
                <tr key={t.test_id}>
                  <td className="text-muted">{i + 1}</td>
                  <td className="break-all font-mono">{t.test_id}</td>
                  <td className="tabular-nums">{t.occurrences}</td>
                  <td>{day(t.first_seen)}</td>
                  <td>{day(t.last_seen)}</td>
                  <td>{t.last_run_url ? <a href={t.last_run_url} target="_blank" rel="noreferrer">CI run ↗</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Load>
  );
}
