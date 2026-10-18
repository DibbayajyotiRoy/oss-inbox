// Plain-language text for every question Jev answers (backend/app/questions.py). Ids may carry a "#N" suffix (gate.same_as#12).
// Anything unknown prints as it is, so a new question never breaks a screen.
const map = (m: Record<string, string>) => (a: string) => m[a] ?? a;
const yn = (t: string, f: string) => map({ true: t, false: f });
const same = (a: string, n?: string) => (a === "true" ? `Same problem as #${n}` : `Not the same problem as #${n}`);
const repro = yn("Has steps to reproduce", "Missing steps to reproduce");

/** base id -> [question as a question, answer as a short phrase]. */
const Q: Record<string, [string, (a: string, n?: string) => string]> = {
  "issue.type": ["What kind of issue?", map({ bug: "Bug report", feature: "Feature request", question: "Support question", docs: "Docs problem" })],
  "issue.has_repro": ["Has steps to reproduce?", repro],
  "issue.has_version": ["Says which version?", yn("Says which version", "Missing the version")],
  "issue.has_logs": ["Includes logs or an error?", yn("Includes logs or an error", "Missing logs or an error")],
  "pr.breaking": ["Breaking change?", yn("Breaking change", "Not breaking")],
  "pr.follows_rules": ["Follows contributing rules?", map({ "0": "Ignores most rules", "1": "Misses some rules", "2": "Follows the rules" })],
  "route.repo": ["Which repository?", (a) => `Belongs in ${a}`],
  "route.area": ["Which area?", (a) => `Area: ${a}`],
  priority: ["How urgent?", map({ p0: "Priority: urgent (p0)", p1: "Priority: high (p1)", p2: "Priority: normal (p2)", p3: "Priority: low (p3)" })],
  spam: ["Spam?", yn("Looks like spam", "Not spam")],
  "gate.reproducible": ["Can it be reproduced?", repro],
  "gate.grounded": ["Matches this repo?", yn("Mentions code that is in this repo", "Mentions code that isn't in this repo")],
  "gate.known_non_issue": ["Already known or turned down?", yn("Describes something already known or turned down", "Not a known non-issue")],
  "gate.claim_supported": ["Backed by evidence?", yn("Backed by evidence", "Not backed by evidence")],
  "gate.security_claim": ["Claims a security problem?", yn("Claims a security issue", "No security claim")],
  "gate.same_as": ["Same as #N?", same],
  "ci.kind": ["What broke the CI run?", map({ code_bug: "Real bug in the code", flaky_test: "Flaky test (fails at random)", infrastructure: "Runner or network problem" })],
  "ci.same_as": ["Same as #N?", same],
};

const split = (id: string) => id.split("#") as [string, string?];

/** "Breaking change?" for `pr.breaking`, "Same as #12?" for `gate.same_as#12`. */
export function questionLabel(id: string) {
  const [base, n] = split(id);
  return Q[base]?.[0].replace("#N", n ? `#${n}` : "another item") ?? id;
}

/** "Not backed by evidence" for `gate.claim_supported` + "false". */
export function answerText(id: string, answer: string) {
  const [base, n] = split(id);
  return Q[base]?.[1](answer, n) ?? answer;
}

/** The answers that are a reason to look closer (a held report shows these first). */
const WORRY: Record<string, string> = {
  "gate.security_claim": "true",
  "gate.grounded": "false",
  "gate.known_non_issue": "true",
  "gate.claim_supported": "false",
  "gate.reproducible": "false",
  "gate.same_as": "true",
};
export const isWorry = (id: string, answer: string) => WORRY[split(id)[0]] === answer;
