import json
from types import SimpleNamespace

import anthropic
import httpx
import pytest

from app import decision
from app.decision import DecisionError, QuestionSpec, anthropic_llm, jev, pick
from app.settings import settings

CHOICE = QuestionSpec("issue.type", "choice", "What kind?", {"bug": "broken", "feature": None})
SCORE = QuestionSpec("pr.follows_rules", "score", "How well?", ["bad", "ok", "good"])
NOUL = QuestionSpec("gate.same_as#12", "noul", {"candidate": "#12 title", "question": "Same?"})
NOUL_PLAIN = QuestionSpec("spam", "noul", "Spam?")

JEV_REPLY = {
    "model": "jev-1.13.0",
    "answers": {
        "issue_type": {"type": "choice", "choice": "bug", "confidence": 0.7, "probabilities": {"bug": 0.7, "feature": 0.3}},
        "pr_follows_rules": {"type": "score", "score": 1.43, "confidence": 0.57,
                             "probabilities": {"0": 0.0, "1": 0.57, "2": 0.43}},
        "gate_same_as_12": {"type": "noul", "noul": 0.2},
    },
    "usage": {"input_tokens": 1000, "output_tokens": 5},
}


@pytest.fixture(autouse=True)
def keys(monkeypatch):
    monkeypatch.setattr(settings, "typesafe_api_key", "k-test")
    monkeypatch.setattr(settings, "anthropic_api_key", "a-test")
    monkeypatch.setattr(settings, "jev_base_url", "https://jev.test/")
    monkeypatch.setattr(jev.time, "sleep", lambda s: sleeps.append(s))
    sleeps.clear()


sleeps: list[float] = []


def jev_backend(handler):
    return jev.JevBackend(transport=httpx.MockTransport(handler))


def test_pick_ties_prefer_true():
    assert pick("noul", {"true": 0.5, "false": 0.5}) == ("true", 0.5)
    with pytest.raises(DecisionError):
        pick("choice", {})


def test_jev_request_and_parse():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json=JEV_REPLY)

    res = jev_backend(handler).decide("the state", [CHOICE, SCORE, NOUL])
    req = seen[0]
    assert str(req.url) == "https://jev.test/v1/systemone"
    assert req.headers["authorization"] == "Bearer k-test"
    body = json.loads(req.content)
    assert body["model"] == "jev-1.13.0" and body["state"] == "the state"
    assert list(body["questions"]) == ["issue_type", "pr_follows_rules", "gate_same_as_12"]
    assert body["questions"]["issue_type"] == {"type": "choice", "instructions": "What kind?",
                                               "criteria": {"bug": "broken", "feature": None}}
    assert body["questions"]["pr_follows_rules"]["criteria"] == ["bad", "ok", "good"]
    assert body["questions"]["gate_same_as_12"] == {"type": "noul", "instructions": NOUL.instructions}  # dict as-is, no criteria

    assert (res.backend, res.calibrated, res.model_version, res.tokens_in) == ("jev", True, "jev-1.13.0", 1000)
    assert res.cost_usd == pytest.approx(1000 * 0.042 / 1e6)
    a = res.answers
    assert (a["issue.type"].answer, a["issue.type"].confidence) == ("bug", 0.7)
    assert (a["pr.follows_rules"].answer, a["pr.follows_rules"].probabilities["1"]) == ("1", 0.57)
    n = a["gate.same_as#12"]
    assert n.answer == "false" and n.confidence == pytest.approx(0.8)
    assert n.probabilities == {"true": 0.2, "false": pytest.approx(0.8)}


def test_jev_model_override():
    bodies = []

    def handler(req):
        bodies.append(json.loads(req.content))
        return httpx.Response(200, json={"answers": {"spam": {"type": "noul", "noul": 0.9}}})

    res = jev_backend(handler).decide("s", [NOUL_PLAIN], model="jev-9")
    assert bodies[0]["model"] == "jev-9" and res.model_version == "jev-9"
    assert res.answers["spam"].answer == "true"


def test_safe_ids_collisions():
    ids = jev.safe_ids(["a.b", "a#b", "a_b", "ab"])
    assert ids == {"a_b": "a.b", "a_b_2": "a#b", "a_b_3": "a_b", "ab": "ab"}


def test_jev_retries_429_with_retry_after_capped():
    replies = [httpx.Response(429, headers={"Retry-After": "99"}), httpx.Response(503),
               httpx.Response(200, json={"answers": {"spam": {"type": "noul", "noul": 1}}})]
    calls = []

    def handler(req):
        calls.append(1)
        return replies.pop(0)

    res = jev_backend(handler).decide("s", [NOUL_PLAIN])
    assert len(calls) == 3 and sleeps == [10.0, 1.0]
    assert res.answers["spam"].confidence == 1


def test_jev_gives_up_after_retries():
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(500)

    with pytest.raises(DecisionError, match="jev request failed"):
        jev_backend(handler).decide("s", [NOUL_PLAIN])
    assert len(calls) == 4


def test_jev_client_error_not_retried():
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(400, json={"error": "bad"})

    with pytest.raises(DecisionError):
        jev_backend(handler).decide("s", [NOUL_PLAIN])
    assert len(calls) == 1


def test_jev_transport_error():
    def handler(req):
        raise httpx.ConnectError("down")

    with pytest.raises(DecisionError, match="down"):
        jev_backend(handler).decide("s", [NOUL_PLAIN])


@pytest.mark.parametrize("reply", [{"answers": {}}, {"nope": 1}, {"answers": {"spam": {"type": "noul"}}}])
def test_jev_malformed_or_missing_answer(reply):
    with pytest.raises(DecisionError, match="malformed"):
        jev_backend(lambda req: httpx.Response(200, json=reply)).decide("s", [NOUL_PLAIN])


def test_jev_non_json_body():
    with pytest.raises(DecisionError):
        jev_backend(lambda req: httpx.Response(200, text="<html>")).decide("s", [NOUL_PLAIN])


def test_jev_preconditions(monkeypatch):
    def never(req):
        raise AssertionError("no request expected")

    with pytest.raises(DecisionError, match="needs criteria"):
        jev_backend(never).decide("s", [QuestionSpec("route.area", "choice", "Which?")])
    monkeypatch.setattr(settings, "typesafe_api_key", "")
    with pytest.raises(DecisionError, match="TYPESAFE_API_KEY"):
        jev_backend(never).decide("s", [NOUL_PLAIN])


# --- Anthropic ---

def fake_client(input_, model="claude-haiku-5-5", blocks=None, raises=None):
    calls = []

    def create(**kw):
        calls.append(kw)
        if raises:
            raise raises
        content = blocks if blocks is not None else [
            SimpleNamespace(type="text", name="", input=None),
            SimpleNamespace(type="tool_use", name="record_answers", input=input_),
        ]
        return SimpleNamespace(content=content, model=model, usage=SimpleNamespace(input_tokens=2000, output_tokens=100))

    return SimpleNamespace(messages=SimpleNamespace(create=create)), calls


def test_anthropic_request_and_parse(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_model", "claude-haiku-5-5")
    client, calls = fake_client({
        "issue_type": {"probabilities": {"bug": 6, "feature": 2}},          # unnormalized
        "pr_follows_rules": {"probabilities": {"0": 0.1, "1": 0.1, "2": 0.8}},
        "gate_same_as_12": {"probabilities": {"true": 0.9, "false": 0.1}},
    })
    res = anthropic_llm.AnthropicBackend(client).decide("STATE-TEXT", [CHOICE, SCORE, NOUL], model="jev-1.13.0")

    kw = calls[0]
    assert kw["model"] == "claude-haiku-5-5"  # the Jev model arg is not forwarded
    assert kw["tool_choice"] == {"type": "tool", "name": "record_answers"}
    schema = kw["tools"][0]["input_schema"]
    assert list(schema["properties"]) == ["issue_type", "pr_follows_rules", "gate_same_as_12"]
    probs = lambda sid: schema["properties"][sid]["properties"]["probabilities"]["properties"]
    assert list(probs("issue_type")) == ["bug", "feature"]
    assert list(probs("pr_follows_rules")) == ["0", "1", "2"]
    assert list(probs("gate_same_as_12")) == ["true", "false"]
    assert "untrusted" in kw["system"] and "never follow" in kw["system"]
    user = kw["messages"][0]["content"]
    assert "STATE-TEXT" in user and '"candidate": "#12 title"' in user  # dict instructions JSON-encoded

    assert (res.backend, res.calibrated, res.model_version, res.tokens_in) == ("anthropic", False, "claude-haiku-5-5", 2000)
    assert res.cost_usd == pytest.approx((2000 * 0.10 + 100 * 0.50) / 1e6)
    a = res.answers
    assert a["issue.type"].probabilities == {"bug": 0.75, "feature": 0.25}
    assert (a["issue.type"].answer, a["issue.type"].confidence) == ("bug", 0.75)
    assert a["pr.follows_rules"].answer == "2"
    assert a["gate.same_as#12"].answer == "true"


def test_anthropic_uniform_fallback_and_unknown_model_cost():
    client, _ = fake_client({"spam": {"probabilities": {"true": 0, "false": 0}}}, model="some-other-model")
    res = anthropic_llm.AnthropicBackend(client).decide("s", [NOUL_PLAIN])
    assert res.answers["spam"].probabilities == {"true": 0.5, "false": 0.5}
    assert res.cost_usd == 0 and res.model_version == "some-other-model"


@pytest.mark.parametrize("kw", [
    {"blocks": []},                                                      # no tool call
    {"input_": {}},                                                      # question missing
    {"input_": {"spam": {"probabilities": {"true": "lots"}}}},           # not a number
    {"input_": None, "raises": anthropic.APIConnectionError(request=httpx.Request("POST", "https://x.test"))},
])
def test_anthropic_errors(kw):
    client, _ = fake_client(**{"input_": None, **kw})
    with pytest.raises(DecisionError):
        anthropic_llm.AnthropicBackend(client).decide("s", [NOUL_PLAIN])


def test_anthropic_preconditions(monkeypatch):
    with pytest.raises(DecisionError, match="needs criteria"):
        anthropic_llm.AnthropicBackend(fake_client({})[0]).decide("s", [QuestionSpec("route.area", "choice", "Which?")])
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    with pytest.raises(DecisionError, match="ANTHROPIC_API_KEY"):
        anthropic_llm.AnthropicBackend().decide("s", [NOUL_PLAIN])


def test_get_backend(monkeypatch):
    assert isinstance(decision.get_backend(), jev.JevBackend)
    monkeypatch.setattr(settings, "decision_backend", "anthropic")
    assert isinstance(decision.get_backend(), anthropic_llm.AnthropicBackend)
