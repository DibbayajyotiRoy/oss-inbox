"use client";
import { useState } from "react";
import { toast } from "@/components/ui/toaster";
import { api, errText } from "./api";
import type { Mode, Rendered, Repo } from "./types";

/**
 * Feature-mode edits for one repo. OSS Inbox never writes the config file: each pick POSTs /features with the YAML
 * rendered so far, so edits chain into one file for the user to commit (`out`). Picking a mode the repo already
 * has undoes the edit, and with nothing left the rendering is dropped. Input is ignored while one is rendering.
 */
export function useModeEdits(repo: Pick<Repo, "id" | "features">) {
  const [draft, setDraft] = useState<Record<string, Mode>>({});
  const [out, setOut] = useState<Rendered>();
  const [busy, setBusy] = useState(false);
  const mode = (f: string) => draft[f] ?? repo.features[f];
  // Once a commit lands repo.features catches up and its edit drops out.
  const edits = Object.entries(draft).filter(([f, to]) => to !== repo.features[f]).map(([feature, to]) => ({ feature, from: repo.features[feature], to }));
  if (!edits.length && out) setOut(undefined);

  async function pick(feature: string, to: Mode) {
    if (busy || to === mode(feature)) return;
    const before = draft;
    const next = { ...draft, [feature]: to };
    setDraft(next);
    if (Object.entries(next).every(([f, m]) => m === repo.features[f])) return setOut(undefined);
    setBusy(true);
    try {
      setOut(await api<Rendered>(`/api/repos/${repo.id}/features`, { method: "POST", body: { feature, mode: to, yaml: out?.yaml } }));
    } catch (e) {
      setDraft(before);
      toast.error("Couldn't render the change", { description: errText(e) });
    } finally {
      setBusy(false);
    }
  }
  const discard = () => {
    setDraft({});
    setOut(undefined);
  };
  return { mode, pick, edits, out, busy, discard };
}
