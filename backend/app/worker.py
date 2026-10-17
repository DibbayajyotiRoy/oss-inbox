"""`python -m app.worker`: BLPOP job loop. 3 attempts, then jev:jobs:dead. SIGTERM finishes the current job and exits."""
import json
import logging
import signal
import time

from app import db, jobs
from app.redis_client import redis

log = logging.getLogger("jev.worker")
MAX_ATTEMPTS = 3
_stop = False


def run_job(raw: str) -> None:
    # ponytail: a job in flight when the process is SIGKILLed is lost; BLMOVE to a processing list if that matters
    job = json.loads(raw)
    try:
        jobs.HANDLERS[job["type"]](**job["payload"])
    except Exception as e:
        job["attempts"] += 1
        if job["attempts"] >= MAX_ATTEMPTS:
            log.exception("job %s failed %d times, moving to %s", job["type"], job["attempts"], jobs.DEAD)
            redis.rpush(jobs.DEAD, json.dumps({**job, "error": repr(e)}))
        else:
            log.warning("job %s failed (attempt %d): %r", job["type"], job["attempts"], e)
            time.sleep(2 * job["attempts"])
            redis.rpush(jobs.QUEUE, json.dumps(job))


def _handle_signal(*_) -> None:
    global _stop
    _stop = True


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    db.init_schema()
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)
    log.info("worker started")
    while not _stop:
        if redis.set("jev:purge:last", "1", nx=True, ex=86400):  # at most once per 24h across workers
            jobs.enqueue("purge")
        popped = redis.blpop(jobs.QUEUE, timeout=2)  # keep below the redis client socket timeout (5s)
        if popped:
            run_job(popped[1])
    log.info("worker stopped")


if __name__ == "__main__":
    main()
