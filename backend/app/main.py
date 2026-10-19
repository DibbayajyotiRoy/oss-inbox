from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import auth, webhooks
from app.api import dashboard, reports, setup
from app.db import init_schema
from app.settings import settings


@asynccontextmanager
async def lifespan(_):
    init_schema()
    yield


app = FastAPI(title="OSS Inbox", lifespan=lifespan)
for r in (auth.router, dashboard.router, webhooks.router, reports.router, setup.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    model = settings.jev_model if settings.decision_backend == "jev" else settings.anthropic_model
    return {"ok": True, "backend": settings.decision_backend, "model": model}
