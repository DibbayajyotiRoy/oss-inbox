"""POST /api/github/webhook: verify, dedupe by delivery id, enqueue. No GitHub calls here."""
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app import db, github, jobs

router = APIRouter()


def _accept(delivery: str, event: str, payload: dict) -> bool:
    if not db.execute("INSERT INTO webhook_deliveries (delivery_id, event) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                      (delivery, event)):
        return False
    try:
        jobs.enqueue("webhook", event=event, payload=payload)
    except Exception:
        db.execute("DELETE FROM webhook_deliveries WHERE delivery_id = %s", (delivery,))  # let a redelivery through
        raise
    return True


@router.post("/api/github/webhook")
async def webhook(request: Request):
    body = await request.body()
    if not github.verify_signature(body, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(401, "invalid signature")
    delivery, event = request.headers.get("X-GitHub-Delivery"), request.headers.get("X-GitHub-Event")
    if not delivery or not event:
        raise HTTPException(400, "missing delivery or event header")
    try:
        payload = json.loads(body)
    except ValueError:
        raise HTTPException(400, "invalid JSON")
    if not await run_in_threadpool(_accept, delivery, event, payload):
        return {"ok": True, "duplicate": True}
    return JSONResponse({"ok": True}, status_code=202)
