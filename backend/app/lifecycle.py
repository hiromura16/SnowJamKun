from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI

from .incoming import IncomingProcessor, polling_loop, start_observer
from .config import (
    Settings,
    get_incoming_root,
    get_logs_root,
    get_mask_path,
    get_settings_path,
    get_storage_root,
    load_settings,
)
from .storage import cleanup_older_than, ensure_directories


def start_scheduler(storage_root: Path) -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        cleanup_older_than,
        trigger="cron",
        hour=3,
        kwargs={"storage_root": storage_root, "retention_days": 90},
        id="cleanup",
        replace_existing=True,
    )
    scheduler.start()
    return scheduler


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings_path = get_settings_path()
    mask_path = get_mask_path()
    storage_root = get_storage_root()
    incoming_root = get_incoming_root()
    logs_root = get_logs_root()

    settings: Settings = load_settings(settings_path)

    ensure_directories(storage_root, incoming_root, logs_root, mask_path.parent)

    scheduler = start_scheduler(storage_root)
    def _mark_processed(ts):
        app.state.last_image_at = ts

    processor = IncomingProcessor(
        incoming_root=incoming_root,
        storage_root=storage_root,
        on_processed=_mark_processed,
    )
    observer = start_observer(processor)
    stop_event = asyncio.Event()
    poll_task = asyncio.create_task(polling_loop(processor, stop_event=stop_event))

    app.state.settings = settings
    app.state.storage_root = storage_root
    app.state.incoming_root = incoming_root
    app.state.logs_root = logs_root
    app.state.mask_path = mask_path
    app.state.started_at = datetime.utcnow().isoformat() + "Z"
    app.state.scheduler = scheduler
    app.state.incoming_observer = observer
    app.state.incoming_poll_task = poll_task
    app.state.incoming_stop_event = stop_event
    app.state.last_image_at = None

    try:
        yield
    finally:
        stop_event.set()
        observer.stop()
        observer.join()
        await poll_task
        scheduler.shutdown(wait=False)
