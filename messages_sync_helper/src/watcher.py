"""File system watcher for low-latency message detection."""

import asyncio
import logging
from pathlib import Path
from typing import Callable, Optional

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from .config import MESSAGES_DB_PATH

logger = logging.getLogger(__name__)


class MessagesDBEventHandler(FileSystemEventHandler):
    """Handles file system events for the Messages database."""

    def __init__(self, callback: Callable[[], None], debounce_seconds: float = 0.1):
        super().__init__()
        self.callback = callback
        self.debounce_seconds = debounce_seconds
        self._debounce_task: Optional[asyncio.Task] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Set the asyncio event loop for scheduling callbacks."""
        self._loop = loop

    def on_modified(self, event: FileSystemEvent) -> None:
        """Called when the database file is modified."""
        if event.is_directory:
            return

        # Check if it's the chat.db file (or WAL/SHM files)
        path = Path(event.src_path)
        if path.name in ("chat.db", "chat.db-wal", "chat.db-shm"):
            self._schedule_callback()

    def _schedule_callback(self) -> None:
        """Schedule the callback with debouncing."""
        if self._loop is None:
            # Fallback: call directly if no loop set
            self.callback()
            return

        # Cancel any pending debounce
        if self._debounce_task and not self._debounce_task.done():
            self._debounce_task.cancel()

        # Schedule new debounced callback
        self._debounce_task = self._loop.call_later(self.debounce_seconds, self.callback)


class MessagesDatabaseWatcher:
    """Watches the Messages database for changes."""

    def __init__(self, on_change: Callable[[], None]):
        self.on_change = on_change
        self._observer: Optional[Observer] = None
        self._handler: Optional[MessagesDBEventHandler] = None

    def start(self, loop: Optional[asyncio.AbstractEventLoop] = None) -> bool:
        """Start watching the Messages database.

        Returns True if watching started successfully.
        """
        db_dir = MESSAGES_DB_PATH.parent

        if not db_dir.exists():
            logger.error(f"Messages directory not found: {db_dir}")
            return False

        self._handler = MessagesDBEventHandler(self.on_change)
        if loop:
            self._handler.set_loop(loop)

        self._observer = Observer()
        self._observer.schedule(self._handler, str(db_dir), recursive=False)

        try:
            self._observer.start()
            logger.info(f"Started watching {db_dir}")
            return True
        except Exception as e:
            logger.error(f"Failed to start file watcher: {e}")
            return False

    def stop(self) -> None:
        """Stop watching the database."""
        if self._observer:
            self._observer.stop()
            self._observer.join(timeout=5)
            self._observer = None
            logger.info("Stopped watching Messages database")
