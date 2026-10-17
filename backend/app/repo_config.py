"""Per-repo config. The YAML in the repo is the truth; repos.config is a cache of the parsed result."""
import copy
import logging
import re
from typing import Any, Literal
from urllib.parse import quote

import httpx
import yaml
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app import db
from app.github import client_for

log = logging.getLogger(__name__)

CONFIG_PATH = ".github/jev-triage.yml"
RULES_FILES = ["AGENTS.md", "CONTRIBUTING.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md"]
FEATURES = ["inbound_gate", "issue_triage", "pr_checks", "routing", "priority", "spam", "ci_gate"]
DEFAULT_LABELS: dict[str, Any] = {
    "issue.type": {"bug": "bug", "feature": "enhancement", "question": "question", "docs": "documentation"},
    "priority": {f"p{i}": f"priority: p{i}" for i in range(4)},
    "needs_info": "needs-info", "needs_tests": "needs-tests", "needs_docs": "needs-docs",
    "breaking": "breaking-change", "spam": "spam", "held": "jev: held", "duplicate": "duplicate",
    "review": "jev: needs review", "security": "security", "ci": "ci-report",
}


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")  # a typo'd key should fail loudly, not be ignored


class FeatureConfig(_Model):
    mode: Literal["off", "shadow", "auto"] = "shadow"

    @field_validator("mode", mode="before")
    @classmethod
    def _yaml_bool(cls, v):
        """YAML 1.1 reads a bare off/no as false and on/yes as true."""
        if v is False:
            return "off"
        if v is True:
            raise ValueError('YAML read a bare on/yes/true as a boolean, so write the mode in quotes: "auto" (or "shadow", "off")')
        return v


class AreaConfig(_Model):
    owner: str | None = None
    paths: list[str] = []
    description: str = ""


class CIGateConfig(_Model):
    max_issues_per_hour: int = 5
    notify_webhook_url: str | None = None


class EvaluationConfig(_Model):
    min_samples: int = 30
    require_evaluation: bool = True


class RepoConfig(_Model):
    features: dict[str, FeatureConfig] = Field(
        default_factory=lambda: {f: FeatureConfig(mode="off" if f == "spam" else "shadow") for f in FEATURES})
    labels: dict[str, Any] = Field(default_factory=lambda: copy.deepcopy(DEFAULT_LABELS))
    thresholds: dict[str, float] = {}
    areas: dict[str, AreaConfig] = {}
    rules_file: str | None = None
    comments: bool = False
    model: str | None = None
    ci_gate: CIGateConfig = CIGateConfig()
    evaluation: EvaluationConfig = EvaluationConfig()
    core_team: list[str] = ["OWNER", "MEMBER", "COLLABORATOR"]  # author_association values

    @field_validator("features")
    @classmethod
    def _known_features(cls, v):
        if bad := sorted(set(v) - set(FEATURES)):
            raise ValueError(f"unknown feature {bad}; valid features: {FEATURES}")
        return v

    def label(self, key: str, answer: str | None = None) -> str | None:
        v = self.labels.get(key)
        if key == "route.area" and answer is not None:  # area labels default to "area: <name>"
            return (v or {}).get(answer) or f"area: {answer}"
        if isinstance(v, dict):
            return v.get(answer) or None
        return v or None

    def mode(self, feature: str) -> str:
        f = self.features.get(feature)
        return f.mode if f else "shadow"


def _merge(a: dict, b: dict) -> dict:
    for k, v in b.items():
        a[k] = _merge(a[k], v) if isinstance(v, dict) and isinstance(a.get(k), dict) else v
    return a


def _yaml_dict(text: str | None, what: str) -> dict:
    try:
        d = yaml.safe_load(text) if text else None
    except yaml.YAMLError as e:
        raise ValueError(f"{what}: invalid YAML: {e}") from e
    if d is not None and not isinstance(d, dict):
        raise ValueError(f"{what}: expected a mapping of settings at the top level")
    return d or {}


def parse_config(yaml_text: str | None, org_yaml: str | None = None) -> RepoConfig:
    data = _merge(_merge(RepoConfig().model_dump(), _yaml_dict(org_yaml, "org config")), _yaml_dict(yaml_text, "repo config"))
    try:
        return RepoConfig.model_validate(data)
    except ValidationError as e:
        raise ValueError("invalid config: " + "; ".join(
            f"{'.'.join(map(str, x['loc']))}: {x['msg']}" for x in e.errors())) from e


def _cached(repo_row: dict) -> RepoConfig | None:
    raw = repo_row.get("config") or (db.fetch_one("SELECT config FROM repos WHERE id = %s", (repo_row["id"],)) or {}).get("config")
    try:
        return RepoConfig.model_validate(raw) if raw else None
    except ValidationError:  # written by an older schema
        return None


def _refresh(repo_row: dict) -> RepoConfig:
    full = repo_row["full_name"]
    org_repo = full.split("/")[0] + "/.github"
    gh = client_for(repo_row)
    own = gh.get_file(full, CONFIG_PATH)
    org = gh.get_file(org_repo, CONFIG_PATH) if full != org_repo else None
    error = None
    try:
        cfg, source = parse_config(own and own[0], org and org[0]), "repo" if own else "org" if org else "default"
    except ValueError as e:  # defaults never act, so a broken file fails safe
        log.warning("%s: %s; using defaults", full, e)
        cfg, source, error = RepoConfig(), "default", str(e)
    names = [cfg.rules_file] if cfg.rules_file else RULES_FILES
    rules = next(filter(None, (gh.get_file(full, n) for n in names)), None)
    db.execute(
        "UPDATE repos SET config = %s, config_source = %s, config_sha = %s, rules_text = %s, rules_sha = %s, config_error = %s, "
        "config_text = %s WHERE id = %s",
        (Jsonb(cfg.model_dump()), source, (own or org or (None, None))[1], rules and rules[0], rules and rules[1], error,
         own and own[0], repo_row["id"]))
    return cfg


def load(repo_row: dict, refresh: bool = False) -> RepoConfig:
    cached = _cached(repo_row)
    if cached and not refresh:
        return cached
    try:
        return _refresh(repo_row)
    except httpx.HTTPError as e:
        log.warning("config fetch failed for %s: %s", repo_row["full_name"], e)
        return cached or RepoConfig()


class _Quoted(str):
    """Rendered double-quoted, so `mode: "off"` survives a YAML 1.1 round trip (bare off is false)."""


class _Dumper(yaml.SafeDumper):
    pass


_Dumper.add_representer(_Quoted, lambda d, v: d.represent_scalar("tag:yaml.org,2002:str", str(v), style='"'))


def _quote_modes(x: Any) -> Any:
    if isinstance(x, dict):
        return {k: _Quoted(v) if k == "mode" and isinstance(v, str) else _quote_modes(v) for k, v in x.items()}
    return x


def render_yaml(data: dict) -> str:
    return yaml.dump(_quote_modes(data), Dumper=_Dumper, sort_keys=False, default_flow_style=False, allow_unicode=True)


def _edit_mode(text: str, feature: str, mode: str) -> str:
    """Line edit of one feature's mode, so comments and formatting survive. Unchanged when the file's shape defeats it."""
    text += "\n" * (bool(text) and not text.endswith("\n"))
    lines = text.splitlines(keepends=True)
    entry = f'mode: "{mode}"'
    head = next((i for i, l in enumerate(lines) if re.match(r"features:\s*(#.*)?$", l)), None)
    if head is None:
        return text if re.search(r"^features\s*:", text, re.M) else f"{text}features:\n  {feature}:\n    {entry}\n"
    content = lambda l: l.strip() and not l.lstrip().startswith("#")  # noqa: E731
    indent = lambda l: len(l) - len(l.lstrip())  # noqa: E731
    end = next((i for i in range(head + 1, len(lines)) if lines[i][0] not in " \t\r\n#"), len(lines))  # next top-level key
    for i in range(head + 1, end):
        if re.match(rf"\s+{re.escape(feature)}:", lines[i]):
            for j in range(i, end):  # the feature's line plus its deeper-indented children
                if j > i and content(lines[j]) and indent(lines[j]) <= indent(lines[i]):
                    break
                lines[j], n = re.subn(r"^([^#\n]*\bmode:\s*)(\"[^\"\n]*\"|'[^'\n]*'|[^\s,}#]+)", lambda m: m[1] + f'"{mode}"', lines[j], count=1)
                if n:
                    return "".join(lines)
            return text
    rows = [i for i in range(head + 1, end) if content(lines[i])]
    pad = " " * indent(lines[rows[0]]) if rows else "  "
    at = (rows[-1] if rows else head) + 1
    lines[at:at] = [f"{pad}{feature}:\n", f"{pad}  {entry}\n"]
    return "".join(lines)


def set_feature_mode(text: str, feature: str, mode: str) -> str:
    """`text` with one feature's mode changed, comments and formatting kept. Not validated: the caller reports parse errors.
    A shape the line edit can't handle (flow-style `features: {...}`) falls back to the normalized render."""
    out = _edit_mode(text, feature, mode)
    try:
        cfg = parse_config(out)
    except ValueError:
        return out
    if cfg.mode(feature) == mode:
        return out
    data = cfg.model_dump(mode="json")
    data["features"][feature] = {"mode": mode}
    return render_yaml(data)


def wanted_labels(cfg: RepoConfig) -> list[str]:
    """Every label name the config can apply (area labels included), de-duplicated, in config order."""
    names = [x for v in cfg.labels.values() for x in (v.values() if isinstance(v, dict) else [v])]
    names += [cfg.label("route.area", a) for a in cfg.areas]
    return list(dict.fromkeys(x for x in names if x))


def edit_url(full_name: str, branch: str, yaml_text: str, exists: bool) -> str:
    base = f"https://github.com/{full_name}"
    if exists:
        return f"{base}/edit/{branch}/{CONFIG_PATH}"
    return f"{base}/new/{branch}?filename={CONFIG_PATH}&value={quote(yaml_text, safe='')}"
