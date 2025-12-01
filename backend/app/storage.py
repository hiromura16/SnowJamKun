from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable


def ensure_directories(*paths: Path) -> None:
    for path in paths:
        path.mkdir(parents=True, exist_ok=True)


def archive_path(storage_root: Path, timestamp: datetime, filename: str) -> Path:
    date_dir = storage_root / f"{timestamp:%Y}" / f"{timestamp:%m}" / f"{timestamp:%d}"
    return date_dir / filename


def cleanup_older_than(storage_root: Path, retention_days: int = 90) -> list[Path]:
    """Delete files older than retention_days. Returns list of deleted paths."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=retention_days)
    deleted: list[Path] = []

    if not storage_root.exists():
        return deleted

    for path in storage_root.rglob("*"):
        if not path.is_file():
            continue
        try:
            stat = path.stat()
            mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            if mtime < cutoff:
                path.unlink(missing_ok=True)
                deleted.append(path)
        except OSError:
            continue

    return deleted


def list_recent_images(storage_root: Path, limit: int = 2, include_overlays: bool = False) -> list[Path]:
    if not storage_root.exists():
        return []
    def _is_overlay(p: Path) -> bool:
        return "_mask" in p.name

    files: Iterable[Path] = (p for p in storage_root.rglob("*") if p.is_file())
    if not include_overlays:
        files = (p for p in files if not _is_overlay(p))
    sorted_files = sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)
    return sorted_files[:limit]
