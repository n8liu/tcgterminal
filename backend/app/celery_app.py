from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "tcgterminal",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["jobs.sync_catalog", "jobs.collect_prices", "jobs.collect_ebay_prices", "jobs.cycle_prices"],
)

celery_app.conf.update(
    timezone="UTC",
    enable_utc=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_track_started=True,
)

celery_app.conf.beat_schedule = {
    "cycle-prices-every-30-mins": {
        "task": "jobs.cycle_prices.cycle_prices",
        "schedule": crontab(minute="*/30"),
    },
    "sync-catalog-daily": {
        "task": "jobs.sync_catalog.sync_catalog",
        "schedule": crontab(minute=0, hour=3),
    },
    "collect-prices-daily": {
        "task": "jobs.collect_prices.collect_prices",
        "schedule": crontab(minute=30, hour=4),
    },
    "collect-ebay-prices-daily": {
        "task": "jobs.collect_ebay_prices.collect_ebay_prices",
        "schedule": crontab(minute=0, hour=5),
    },
}
