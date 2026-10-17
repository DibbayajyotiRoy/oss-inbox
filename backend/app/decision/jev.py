"""Jev (typesafe.ai) backend: calibrated probabilities from one /v1/systemone call."""
import re
import time

import httpx

from app.decision import Answer, DecisionError, DecisionResult, pick
from app.settings import settings

USD_PER_INPUT_TOKEN = 0.042 / 1e6
RETRIES = 3
MAX_WAIT_S = 10.0


def safe_ids(ids) -> dict[str, str]:
    """{transport_id: original_id}. Non-alphanumerics become '_'; collisions get a numeric suffix."""
    out: dict[str, str] = {}
    for qid in ids:
        base = sid = re.sub(r"[^0-9A-Za-z]", "_", qid)
        n = 1
        while sid in out:
            n += 1
            sid = f"{base}_{n}"
        out[sid] = qid
    return out


def _delay(r: httpx.Response, attempt: int) -> float:
    try:
        wait = float(r.headers["Retry-After"])
    except (KeyError, ValueError):
        wait = 0.5 * 2**attempt
    return max(0.0, min(wait, MAX_WAIT_S))


def _post(client: httpx.Client, url: str, body: dict) -> dict:
    headers = {"Authorization": f"Bearer {settings.typesafe_api_key}"}
    for attempt in range(RETRIES + 1):
        r = client.post(url, json=body, headers=headers)
        if (r.status_code != 429 and r.status_code < 500) or attempt == RETRIES:
            break
        time.sleep(_delay(r, attempt))
    r.raise_for_status()
    return r.json()


def _request(q) -> dict:
    if q.type == "choice" and not q.criteria:
        raise DecisionError(f"choice question {q.id} needs criteria")
    out = {"type": q.type, "instructions": q.instructions}
    if q.criteria is not None:
        out["criteria"] = q.criteria
    return out


def _answer(q, a: dict) -> Answer:
    if q.type == "noul":
        p = min(max(float(a["noul"]), 0.0), 1.0)
        probs = {"true": p, "false": 1 - p}
    else:
        probs = {str(k): float(v) for k, v in a["probabilities"].items()}
    answer, confidence = pick(q.type, probs)
    return Answer(q.id, answer, probs, confidence)


class JevBackend:
    name = "jev"
    calibrated = True

    def __init__(self, transport: httpx.BaseTransport | None = None):
        self._transport = transport

    def decide(self, state, questions, model=None) -> DecisionResult:
        if not settings.typesafe_api_key:
            raise DecisionError("TYPESAFE_API_KEY is not set")
        model = model or settings.jev_model
        ids = safe_ids(q.id for q in questions)
        by_sid = dict(zip(ids, questions))
        body = {"model": model, "state": state, "questions": {sid: _request(q) for sid, q in by_sid.items()}}
        url = settings.jev_base_url.rstrip("/") + "/v1/systemone"
        t0 = time.monotonic()
        try:
            with httpx.Client(timeout=20, transport=self._transport) as client:
                data = _post(client, url, body)
            answers = {q.id: _answer(q, data["answers"][sid]) for sid, q in by_sid.items()}
            tokens_in = int(data.get("usage", {}).get("input_tokens", 0))
            version = data.get("model") or model
        except httpx.HTTPError as e:
            raise DecisionError(f"jev request failed: {e}") from e
        except (KeyError, TypeError, ValueError, AttributeError) as e:
            raise DecisionError(f"malformed jev response: {e!r}") from e
        return DecisionResult(
            model_version=version, backend=self.name, answers=answers,
            latency_ms=int((time.monotonic() - t0) * 1000), tokens_in=tokens_in,
            cost_usd=tokens_in * USD_PER_INPUT_TOKEN, calibrated=self.calibrated,
        )
