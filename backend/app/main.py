from datetime import datetime, timezone
import shutil
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

from .alert import gpio_high, gpio_low, gpio_setup, send_slack_alert
from .config import Settings, get_settings_path, load_settings
from .detection import analyze_detection
from .lifecycle import lifespan
from .storage import list_recent_images
from .api import setup_api


class DashboardResponse(BaseModel):
    latest_image: Optional[str]
    previous_image: Optional[str]
    mask_overlay: Optional[str]
    detection_rate: float
    threshold: float
    alarm_state: str
    delay_warning: bool
    logs: list[str]
    latest_timestamp: Optional[str] = None
    previous_timestamp: Optional[str] = None


app = FastAPI(title="Snowjam Detection API", version="0.3.0", lifespan=lifespan)
setup_api(app)


@app.get("/health")
async def health() -> dict:
    storage_root: Path = app.state.storage_root
    last_image_at = app.state.last_image_at
    delay_monitor_enabled = app.state.settings.delay_monitor_enabled
    delay_threshold_seconds = app.state.settings.delay_threshold_seconds

    usage = shutil.disk_usage(storage_root)
    seconds_since_last = None
    if last_image_at:
        now = datetime.now(timezone.utc)
        seconds_since_last = (now - last_image_at).total_seconds()

    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "storage": {
            "total": usage.total,
            "used": usage.used,
            "free": usage.free,
            "path": str(storage_root),
        },
        "delay_monitor": {
            "enabled": delay_monitor_enabled,
            "threshold_seconds": delay_threshold_seconds,
            "seconds_since_last_image": seconds_since_last,
        },
    }


@app.get("/api/dashboard", response_model=DashboardResponse)
async def dashboard() -> DashboardResponse:
    settings_path = get_settings_path()
    settings: Settings = load_settings(settings_path)
    storage_root: Path = app.state.storage_root
    mask_path: Path = app.state.mask_path
    last_image_at = app.state.last_image_at

    recent = list_recent_images(storage_root, limit=2, include_overlays=False)
    latest = recent[0] if len(recent) > 0 else None
    previous = recent[1] if len(recent) > 1 else None

    detection_rate = 0.0
    overlay_path: Optional[Path] = None
    delay_warning = False
    alarm_state = "Normal"
    latest_ts: Optional[str] = None
    prev_ts: Optional[str] = None

    if latest:
        try:
            latest_ts = datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc).isoformat()
        except OSError:
            latest_ts = None
    if previous:
        try:
            prev_ts = datetime.fromtimestamp(previous.stat().st_mtime, tz=timezone.utc).isoformat()
        except OSError:
            prev_ts = None

    if latest and previous:
        result = analyze_detection(latest, previous, settings, mask_path)
        if result:
            detection_rate = result.detection_rate
            overlay_path = result.overlay_path
            alarm_state = "Alarm" if settings.alarm_enabled and result.alarm else "Normal"
            if settings.alarm_enabled and result.alarm and settings.gpio_pin:
                gpio_high(settings.gpio_pin)
            if settings.alarm_enabled and result.alarm:
                send_slack_alert(
                    bot_token=settings.slack_bot_token,
                    webhook_url=settings.slack_webhook_url,
                    channel=settings.slack_channel or None,
                    message=f"[ALARM] detection_rate={detection_rate:.3f} threshold={settings.threshold:.3f}",
                    image_path=overlay_path,
                )

    if settings.delay_monitor_enabled and last_image_at:
        now = datetime.now(timezone.utc)
        delta = (now - last_image_at).total_seconds()
        delay_warning = delta > settings.delay_threshold_seconds

    return DashboardResponse(
        latest_image=str(latest) if latest else None,
        previous_image=str(previous) if previous else None,
        mask_overlay=str(overlay_path) if overlay_path else None,
        detection_rate=detection_rate,
        threshold=settings.threshold,
        alarm_state=alarm_state,
        delay_warning=delay_warning,
        logs=[],
        latest_timestamp=latest_ts,
        previous_timestamp=prev_ts,
    )
