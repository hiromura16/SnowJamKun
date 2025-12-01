from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional

import cv2
import numpy as np
import re

from .config import Settings


@dataclass
class DetectionResult:
    detection_rate: float
    changed_pixels: int
    mask_pixels: int
    overlay_path: Optional[Path]
    alarm: bool


def _read_image(path: Path) -> Optional[np.ndarray]:
    img = cv2.imread(str(path))
    if img is None:
        return None
    return img


def _load_mask_image(mask_path: Path, target_shape: tuple[int, int], inclusive: bool) -> np.ndarray:
    # マスク非適用の場合は全域を対象とする
    if not inclusive:
        return np.ones(target_shape, dtype=np.uint8) * 255

    if not mask_path.exists():
        return np.ones(target_shape, dtype=np.uint8) * 255

    mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        return np.ones(target_shape, dtype=np.uint8) * 255

    if mask.shape != target_shape:
        mask = cv2.resize(mask, (target_shape[1], target_shape[0]), interpolation=cv2.INTER_NEAREST)
    _, mask_bin = cv2.threshold(mask, 1, 255, cv2.THRESH_BINARY)
    return mask_bin


def _ensure_odd(value: int) -> int:
    return value if value % 2 == 1 else value + 1


def _resize_if_needed(img: np.ndarray, target_shape: tuple[int, int]) -> np.ndarray:
    if img.shape[:2] == target_shape:
        return img
    return cv2.resize(img, (target_shape[1], target_shape[0]), interpolation=cv2.INTER_LINEAR)


def _overlay(image: np.ndarray, mask: np.ndarray, color=(255, 105, 180), alpha: float = 0.35) -> np.ndarray:
    overlay_img = image.copy()
    mask_bool = mask > 0
    color_arr = np.array(color, dtype=np.uint8)
    overlay_img[mask_bool] = (
        overlay_img[mask_bool].astype(np.float32) * (1 - alpha)
        + color_arr.astype(np.float32) * alpha
    ).astype(np.uint8)
    return overlay_img


def _parse_overlay_color(color_str: str, fallback=(255, 105, 180)) -> tuple[int, int, int]:
    if isinstance(color_str, str) and len(color_str) == 7 and color_str.startswith("#"):
        try:
            r = int(color_str[1:3], 16)
            g = int(color_str[3:5], 16)
            b = int(color_str[5:7], 16)
            return (r, g, b)
        except ValueError:
            return fallback
    return fallback


def _parse_overlay_alpha(alpha_val: float, fallback=0.35) -> float:
    try:
        a = float(alpha_val)
        if 0 <= a <= 1:
            return a
    except (TypeError, ValueError):
        pass
    return fallback


def _overlay_path(latest_path: Path) -> Path:
    stem = latest_path.stem
    # strip repeated _mask suffixes to avoid filename explosion
    stem = re.sub(r"(_mask)+$", "", stem)
    return latest_path.with_name(f"{stem}_mask.png")


def analyze_detection(
    latest_path: Path,
    previous_path: Path,
    settings: Settings,
    mask_path: Path,
) -> Optional[DetectionResult]:
    img_latest = _read_image(latest_path)
    img_prev = _read_image(previous_path)
    if img_latest is None or img_prev is None:
        return None

    img_prev = _resize_if_needed(img_prev, img_latest.shape[:2])

    gray_latest = cv2.cvtColor(img_latest, cv2.COLOR_BGR2GRAY)
    gray_prev = cv2.cvtColor(img_prev, cv2.COLOR_BGR2GRAY)

    ksize = _ensure_odd(settings.blur_kernel)
    gray_latest = cv2.GaussianBlur(gray_latest, (ksize, ksize), 0)
    gray_prev = cv2.GaussianBlur(gray_prev, (ksize, ksize), 0)

    diff = cv2.absdiff(gray_latest, gray_prev)

    mask = _load_mask_image(mask_path, diff.shape, inclusive=settings.mask_inclusive)
    diff = cv2.bitwise_and(diff, diff, mask=mask)
    _, binary = cv2.threshold(diff, settings.binary_threshold, 255, cv2.THRESH_BINARY)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    changed = int(cv2.countNonZero(binary))
    mask_pixels = int(cv2.countNonZero(mask))
    detection_rate = (changed / mask_pixels) if mask_pixels > 0 else 0.0

    # overlay_color は "#rrggbb" 形式を想定
    color_tuple = _parse_overlay_color(getattr(settings, "overlay_color", "#ff69b4"))
    alpha_val = _parse_overlay_alpha(getattr(settings, "overlay_alpha", 0.35))
    overlay_img = _overlay(img_latest, binary, color=color_tuple, alpha=alpha_val)
    overlay_path = _overlay_path(latest_path)
    cv2.imwrite(str(overlay_path), overlay_img)

    alarm = detection_rate >= settings.threshold

    return DetectionResult(
        detection_rate=detection_rate,
        changed_pixels=changed,
        mask_pixels=mask_pixels,
        overlay_path=overlay_path,
        alarm=alarm,
    )
