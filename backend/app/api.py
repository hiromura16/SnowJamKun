from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import json

from fastapi import APIRouter, FastAPI, Request, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .config import Settings, get_settings_path, load_settings, get_mask_path
from .alert import gpio_low
from .storage import list_recent_images


class ConfigRequest(BaseModel):
    threshold: Optional[float] = Field(default=None, ge=0)
    consecutive_hits: Optional[int] = Field(default=None, ge=1)
    binary_threshold: Optional[int] = Field(default=None, ge=0, le=255)
    blur_kernel: Optional[int] = Field(default=None, ge=1)
    overlay_color: Optional[str] = None
    overlay_alpha: Optional[float] = Field(default=None, ge=0, le=1)
    delay_monitor_enabled: Optional[bool] = None
    delay_threshold_seconds: Optional[int] = Field(default=None, ge=1)
    alarm_enabled: Optional[bool] = None
    slack_webhook_url: Optional[str] = None
    slack_bot_token: Optional[str] = None
    slack_channel: Optional[str] = None
    mask_inclusive: Optional[bool] = None
    gpio_pin: Optional[int] = None


class ControlRequest(BaseModel):
    alarm_enabled: Optional[bool] = None
    reset_alarm: bool = False
    delay_monitor_enabled: Optional[bool] = None


router = APIRouter()


def save_settings(path: Path, settings: Settings) -> None:
    path.write_text(settings.model_dump_json(indent=2))


@router.post("/config")
async def update_config(payload: ConfigRequest, request: Request):
    settings_path = get_settings_path()
    settings = load_settings(settings_path)
    data = payload.model_dump(exclude_none=True)
    new_settings = settings.model_copy(update=data)
    save_settings(settings_path, new_settings)
    request.app.state.settings = new_settings  # type: ignore
    return {"ok": True, "settings": new_settings}


@router.get("/config")
async def get_config():
    settings_path = get_settings_path()
    settings = load_settings(settings_path)
    return {"settings": settings}


@router.post("/control")
async def control(payload: ControlRequest, request: Request):
    settings_path = get_settings_path()
    settings = load_settings(settings_path)
    data = payload.model_dump(exclude_none=True)
    reset_alarm = data.pop("reset_alarm", False)
    new_settings = settings.model_copy(update=data)
    save_settings(settings_path, new_settings)
    if reset_alarm and settings.gpio_pin:
        gpio_low(settings.gpio_pin)
    request.app.state.settings = new_settings  # type: ignore
    return {"ok": True, "settings": new_settings}


@router.get("/history")
async def history(
    limit: int = 5,
    exclude_overlay: bool = True,
    request: Request = None,
):
    storage_root = request.app.state.storage_root  # type: ignore
    files = list_recent_images(storage_root, limit=limit * 3, include_overlays=not exclude_overlay)  # extra fetch to filter overlays
    items = []
    for p in files:
        name = p.name
        is_overlay = "mask" in name and name.endswith(".png")
        if exclude_overlay and is_overlay:
            continue
        try:
            mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat()
        except OSError:
            mtime = None
        items.append({"path": str(p), "mtime": mtime, "is_overlay": is_overlay})
        if len(items) >= limit:
            break
    return {"images": items, "limit": limit, "exclude_overlay": exclude_overlay}


@router.get("/mask-image")
async def get_mask_image():
    mask_path = get_mask_path()
    if not mask_path.exists():
        raise HTTPException(status_code=404, detail="mask not found")
    return FileResponse(mask_path)


@router.post("/mask-image")
async def upload_mask_image(file: UploadFile = File(...)):
    mask_path = get_mask_path()
    try:
        content = await file.read()
        mask_path.write_bytes(content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed to save mask: {exc}")
    return {"ok": True}


@router.delete("/mask-image")
async def reset_mask_image():
    mask_path = get_mask_path()
    try:
        mask_path.unlink(missing_ok=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed to delete mask: {exc}")
    return {"ok": True}


def setup_api(app: FastAPI) -> None:
    app.include_router(router, prefix="/api")
