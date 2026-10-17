from dataclasses import dataclass, field

from app.settings import settings


@dataclass(frozen=True)
class QuestionSpec:
    id: str
    type: str  # choice | score | noul
    instructions: str
    criteria: dict | list | None = None


@dataclass
class Answer:
    question_id: str
    answer: str
    probabilities: dict[str, float]  # noul: {"true": p, "false": 1-p}; score: {"0": .., "1": ..}
    confidence: float


@dataclass
class DecisionResult:
    model_version: str
    backend: str
    answers: dict[str, Answer] = field(default_factory=dict)
    latency_ms: int = 0
    tokens_in: int = 0
    cost_usd: float = 0.0
    calibrated: bool = True


class DecisionError(Exception):
    pass


def pick(type: str, probabilities: dict[str, float]) -> tuple[str, float]:
    """Chosen answer and its probability (CONTRACT rule 3). Backends normalize noul to {"true", "false"}."""
    if not probabilities:
        raise DecisionError(f"empty probabilities for {type} question")
    answer = max(probabilities, key=probabilities.get)
    return answer, float(probabilities[answer])


def get_backend():
    if settings.decision_backend == "anthropic":
        from app.decision.anthropic_llm import AnthropicBackend
        return AnthropicBackend()
    from app.decision.jev import JevBackend
    return JevBackend()
