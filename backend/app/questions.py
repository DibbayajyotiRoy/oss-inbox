"""Every automated action traces back to one of these typed questions."""
from dataclasses import dataclass

from app.decision import QuestionSpec


@dataclass(frozen=True)
class Question:
    id: str
    type: str  # choice | score | noul
    instructions: str
    criteria: dict | list | None
    default_threshold: float
    feature: str


_ALL = [
    Question("issue.type", "choice", "What kind of issue is this?", {
        "bug": "Something is broken or behaves incorrectly",
        "feature": "A request for new functionality or a change in behavior",
        "question": "A usage or support question, not a defect",
        "docs": "A problem with or request for documentation",
    }, 0.85, "issue_triage"),
    Question("issue.has_repro", "noul", "Does the report include steps someone else could follow to reproduce the problem?",
             {"true": "Concrete steps, a code snippet, or a minimal example", "false": "No way to reproduce is given"},
             0.80, "issue_triage"),
    Question("issue.has_version", "noul", "Does the report state the affected version of the project?",
             {"true": "A version number, tag, or commit is stated", "false": "No version is stated"}, 0.80, "issue_triage"),
    Question("issue.has_logs", "noul", "Does the report include logs, a stack trace, or an exact error message?",
             None, 0.80, "issue_triage"),

    Question("pr.breaking", "noul", "Does this pull request change public behavior or APIs in a way that breaks existing users?",
             {"true": "Removes or changes public API, CLI flags, config, or documented behavior",
              "false": "Internal or additive change"}, 0.90, "pr_checks"),
    Question("pr.follows_rules", "score",
             "How well does this pull request follow the repository's contributing rules given in the state?",
             ["Ignores most of the rules", "Follows some rules, misses important ones", "Follows the rules"],
             0.80, "pr_checks"),

    Question("route.repo", "choice", "Which repository in the organization does this item belong to?", None, 0.90, "routing"),
    Question("route.area", "choice", "Which area or component of the project does this item touch?", None, 0.85, "routing"),

    Question("priority", "choice", "How urgent is this?", {
        "p0": "Outage, data loss, or security impact for many users; needs action now",
        "p1": "Important breakage with no reasonable workaround",
        "p2": "Normal priority; a workaround exists or impact is limited",
        "p3": "Nice to have; cosmetic or minor",
    }, 0.90, "priority"),
    Question("spam", "noul", "Is this spam, advertising, or an empty low-effort submission with no actionable content?",
             None, 0.95, "spam"),

    Question("gate.reproducible", "noul",
             "Does the report give steps a maintainer could follow to observe the claimed problem?", None, 0.85, "inbound_gate"),
    Question("gate.grounded", "noul",
             "Does the report reference code, files, functions, or behavior that exist in this repository, per the repository facts in the state?",
             {"true": "References match the repository facts", "false": "References are missing from the repository or invented"},
             0.85, "inbound_gate"),
    Question("gate.known_non_issue", "noul",
             "Does the report describe behavior the project documents as intended or has already rejected?", None, 0.90, "inbound_gate"),
    Question("gate.claim_supported", "noul",
             "Is the claimed impact backed by concrete evidence in the report (output, trace, proof of concept)?", None, 0.85, "inbound_gate"),
    Question("gate.security_claim", "noul", "Does the report claim a security vulnerability?", None, 0.80, "inbound_gate"),
    Question("gate.same_as", "noul", "Does the report describe the same problem as the `candidate` issue in the state?",
             None, 0.90, "inbound_gate"),

    Question("ci.kind", "choice", "What caused this CI failure?", {
        "code_bug": "A real defect in the code under test",
        "flaky_test": "A nondeterministic test (timing, ordering, randomness) unrelated to the change",
        "infrastructure": "Runner, network, dependency registry, or quota problem outside the code",
    }, 0.85, "ci_gate"),
    Question("ci.same_as", "noul", "Is this CI failure the same problem as the `candidate` issue in the state?",
             None, 0.90, "ci_gate"),
]

QUESTIONS: dict[str, Question] = {q.id: q for q in _ALL}


def base_id(qid: str) -> str:
    return qid.split("#", 1)[0]


def spec(qid: str, *, criteria=None, instructions=None, suffix=None) -> QuestionSpec:
    q = QUESTIONS[qid]
    return QuestionSpec(
        id=f"{qid}#{suffix}" if suffix is not None else qid,
        type=q.type,
        instructions=instructions if instructions is not None else q.instructions,
        criteria=criteria if criteria is not None else q.criteria,
    )
