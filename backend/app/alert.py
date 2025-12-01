from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
import cv2
import numpy as np

try:
    import RPi.GPIO as GPIO  # type: ignore
except ImportError:  # pragma: no cover
    GPIO = None  # mocked on non-Pi environments

logger = logging.getLogger(__name__)


def send_slack_alert(
    bot_token: str,
    webhook_url: str,
    channel: Optional[str],
    message: str,
    image_path: Optional[Path] = None,
) -> None:
    """
    Slack通知。画像添付が必要な場合は bot_token と channel が必須。
    Webhookのみの場合はテキスト通知のみ。
    """
    if image_path and bot_token and channel:
        client = WebClient(token=bot_token)
        try:
            client.files_upload_v2(
                channel=channel,
                initial_comment=message,
                file=str(image_path),
            )
            return
        except SlackApiError as exc:  # pragma: no cover
            logger.error("Slack file upload failed: %s", exc)
            # fallback to text via webhook if provided

    if webhook_url:
        import requests

        try:
            requests.post(webhook_url, json={"text": message}, timeout=5)
        except Exception as exc:  # pragma: no cover
            logger.error("Slack webhook failed: %s", exc)


def gpio_setup(pin: int) -> None:
    if GPIO is None:
        return
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(pin, GPIO.OUT, initial=GPIO.LOW)


def gpio_high(pin: int) -> None:
    if GPIO is None:
        return
    GPIO.output(pin, GPIO.HIGH)


def gpio_low(pin: int) -> None:
    if GPIO is None:
        return
    GPIO.output(pin, GPIO.LOW)

