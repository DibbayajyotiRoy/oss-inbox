from app.redis_client import redis


def allow(key: str, limit: int, window_s: int) -> bool:
    """Fixed window: the first hit starts the window. EXPIRE NX needs Redis >= 7."""
    k = f"rl:{key}"
    pipe = redis.pipeline()  # MULTI: a crash can't leave a counter without a TTL
    pipe.incr(k)
    pipe.expire(k, window_s, nx=True)
    return pipe.execute()[0] <= limit
