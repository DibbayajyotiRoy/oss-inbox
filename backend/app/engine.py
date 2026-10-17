"""One backend call per item event: persist the run, record each answer, judge eligibility (CONTRACT rule 2)."""
import hashlib
from dataclasses import dataclass

from psycopg.types.json import Jsonb

from app import db, decision
from app.decision import DecisionError, QuestionSpec
from app.questions import QUESTIONS, base_id
from app.settings import settings

_RUN = """INSERT INTO decision_runs (item_id, trigger, backend, model_version, calibrated, state_hash, state_text,
  latency_ms, tokens_in, cost_usd, error) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id"""
_DECISION = """INSERT INTO decisions (run_id, item_id, repo_id, question_id, base_question, answer, probabilities,
  confidence, threshold_at_time) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id"""


@dataclass
class Verdict:
    question_id: str
    decision_id: int
    answer: str
    probabilities: dict[str, float]
    confidence: float
    threshold: float
    above: bool
    eligible: bool


def _measured(config, repo_id: int, base: str, threshold: float) -> bool:
    ev = config.evaluation
    if not ev.require_evaluation:
        return True
    from app.metrics import question_stats  # lazy: avoids import cycles with the evaluation modules

    s = question_stats(repo_id, base)
    return s.n >= ev.min_samples and s.accuracy is not None and s.accuracy >= threshold


def run(item: dict, repo: dict, config, trigger: str, state: str,
        questions: list[QuestionSpec]) -> tuple[int, dict[str, Verdict], str | None]:
    state_hash = hashlib.sha256(state.encode()).hexdigest()
    try:
        backend = decision.get_backend()
        result = backend.decide(state, questions, config.model or None)
    except DecisionError as e:
        row = db.fetch_one(_RUN, (item["id"], trigger, settings.decision_backend, "", True, state_hash, state,
                                  0, 0, 0, str(e)))
        return row["id"], {}, str(e)

    verdicts: dict[str, Verdict] = {}
    with db.transaction() as c:
        run_id = c.execute(_RUN, (item["id"], trigger, result.backend, result.model_version, result.calibrated,
                                  state_hash, state, result.latency_ms, result.tokens_in, result.cost_usd,
                                  None)).fetchone()["id"]
        for a in result.answers.values():
            base = base_id(a.question_id)
            q = QUESTIONS[base]
            threshold = config.thresholds.get(base) or q.default_threshold
            above = a.confidence >= threshold
            eligible = (above and config.mode(q.feature) == "auto"
                        and _measured(config, repo["id"], base, threshold))
            decision_id = c.execute(_DECISION, (run_id, item["id"], repo["id"], a.question_id, base, a.answer,
                                                Jsonb(a.probabilities), a.confidence, threshold)).fetchone()["id"]
            verdicts[a.question_id] = Verdict(a.question_id, decision_id, a.answer, a.probabilities,
                                              a.confidence, threshold, above, eligible)
    return run_id, verdicts, None


def set_outcome(decision_id: int, outcome: str) -> None:
    """outcome: acted | queued | shadow | skipped"""
    db.execute("UPDATE decisions SET outcome = %s WHERE id = %s", (outcome, decision_id))
