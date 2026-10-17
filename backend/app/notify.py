import logging

import httpx

log = logging.getLogger(__name__)


def send(url: str | None, text: str) -> None:
    """Slack-compatible webhook post. Never raises."""
    # ponytail: https-only, no redirects; private-network targets are not blocked (add an IP check if multi-tenant)
    if not url or not url.startswith("https://"):
        return
    try:
        httpx.post(url, json={"text": text}, timeout=5).raise_for_status()
    except Exception as e:
        log.warning("notify failed: %s", e)
