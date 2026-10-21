from contextlib import asynccontextmanager

import hmac

from fastapi import FastAPI, Header, HTTPException

from app import auth, mcp_server, webhooks
from app.api import agent_tokens, dashboard, reports, setup
from app.db import init_schema
from app.settings import settings


@asynccontextmanager
async def lifespan(_):
    init_schema()
    yield


app = FastAPI(title="OSS Inbox", lifespan=lifespan)
for r in (auth.router, dashboard.router, webhooks.router, reports.router, setup.router, agent_tokens.router):
    app.include_router(r)
mcp_server.mount(app)  # POST/GET/DELETE /api/mcp


if settings.demo_mode:
    @app.get("/api/demo/reset")
    def demo_reset(authorization: str | None = Header(None)):
        if not settings.cron_secret or not hmac.compare_digest(authorization or "", f"Bearer {settings.cron_secret}"):
            raise HTTPException(401)
        from app import demo
        return demo.seed()


@app.get("/api/health")
def health():
    model = settings.jev_model if settings.decision_backend == "jev" else settings.anthropic_model
    return {"ok": True, "backend": settings.decision_backend, "model": model}
