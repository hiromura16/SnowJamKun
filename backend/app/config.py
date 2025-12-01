from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field, ValidationError


class Settings(BaseModel):
    threshold: float = Field(0.15, ge=0)
    consecutive_hits: int = Field(3, ge=1)
    binary_threshold: int = Field(30, ge=0, le=255)
    blur_kernel: int = Field(3, ge=1)
    overlay_color: str = "#ff69b4"
    overlay_alpha: float = Field(0.35, ge=0, le=1)
    delay_monitor_enabled: bool = True
    delay_threshold_seconds: int = Field(300, ge=1)
    alarm_enabled: bool = True
    slack_webhook_url: str = ""
    slack_bot_token: str = ""
    slack_channel: str = ""
    mask_inclusive: bool = True
    gpio_pin: Optional[int] = 17


def load_settings(path: Path) -> Settings:
    try:
        raw = json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"settings file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in settings file: {path}") from exc

    try:
        return Settings.model_validate(raw)
    except ValidationError as exc:
        raise ValueError(f"invalid settings data: {exc}") from exc


def get_settings_path() -> Path:
    env_path = os.getenv("SETTINGS_PATH")
    return Path(env_path) if env_path else Path("./config/settings.json")


def get_mask_path() -> Path:
    env_path = os.getenv("MASK_PATH")
    return Path(env_path) if env_path else Path("./config/mask.png")


def get_storage_root() -> Path:
    env_path = os.getenv("STORAGE_ROOT")
    return Path(env_path) if env_path else Path("./storage/archive")


def get_incoming_root() -> Path:
    env_path = os.getenv("FTP_INCOMING")
    return Path(env_path) if env_path else Path("./ftp_data/incoming")


def get_logs_root() -> Path:
    env_path = os.getenv("LOG_ROOT")
    return Path(env_path) if env_path else Path("./logs")
