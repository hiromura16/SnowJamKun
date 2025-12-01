from __future__ import annotations

import asyncio
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from .storage import archive_path, ensure_directories


class IncomingProcessor:
    def __init__(self, incoming_root: Path, storage_root: Path, on_processed=None) -> None:
        self.incoming_root = incoming_root
        self.storage_root = storage_root
        self.on_processed = on_processed

    def process_file(self, path: Path) -> Path | None:
        if not path.is_file():
            return None

        timestamp = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
        target = archive_path(self.storage_root, timestamp, path.name)
        ensure_directories(target.parent)

        try:
            target = Path(shutil.move(str(path), str(target)))
        except (OSError, shutil.Error):
            return None

        if self.on_processed:
            try:
                self.on_processed(timestamp)
            except Exception:
                pass

        return target

    def process_pending(self) -> List[Path]:
        moved: List[Path] = []
        if not self.incoming_root.exists():
            return moved
        for candidate in self._list_files(self.incoming_root):
            moved_path = self.process_file(candidate)
            if moved_path:
                moved.append(moved_path)
        return moved

    @staticmethod
    def _list_files(root: Path) -> Iterable[Path]:
        return (p for p in root.iterdir() if p.is_file())


class IncomingEventHandler(FileSystemEventHandler):
    def __init__(self, processor: IncomingProcessor) -> None:
        self.processor = processor

    def on_created(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        self.processor.process_file(Path(event.src_path))

    def on_moved(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        self.processor.process_file(Path(event.dest_path))


def start_observer(processor: IncomingProcessor) -> Observer:
    handler = IncomingEventHandler(processor)
    observer = Observer()
    observer.schedule(handler, str(processor.incoming_root), recursive=False)
    observer.start()
    return observer


async def polling_loop(processor: IncomingProcessor, interval_seconds: int = 10, stop_event: asyncio.Event | None = None) -> None:
    while True:
        if stop_event and stop_event.is_set():
            break
        processor.process_pending()
        try:
            await asyncio.wait_for(asyncio.sleep(interval_seconds), timeout=interval_seconds)
        except asyncio.TimeoutError:
            continue
