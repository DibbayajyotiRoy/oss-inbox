import redis as _redis

from app.settings import settings

redis = _redis.Redis.from_url(settings.redis_url, decode_responses=True)
