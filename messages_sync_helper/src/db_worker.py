"""Single-threaded database worker for Messages database access.

All database operations are serialized through this worker to avoid
SQLite threading issues. The worker owns the database connection and
processes requests from a queue.
"""

import logging
import queue
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional

from .config import MESSAGES_DB_PATH
from .messages_db import Message, MessagesDatabase

logger = logging.getLogger(__name__)


@dataclass
class DbRequest:
    """A request to the database worker."""

    operation: str
    params: dict[str, Any]
    callback: Optional[Callable[[Any], None]] = None


class DatabaseWorker:
    """Single-threaded worker that owns the database connection.

    All database operations go through this worker to ensure thread safety.
    Only one history request can be in progress at a time.
    """

    def __init__(self, db_path: Path = MESSAGES_DB_PATH):
        self.db_path = db_path
        self._db: Optional[MessagesDatabase] = None
        self._request_queue: queue.Queue[Optional[DbRequest]] = queue.Queue()
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._history_in_progress = False
        self._lock = threading.Lock()

    def start(self) -> bool:
        """Start the worker thread and connect to the database.

        Returns True if database connection is successful.
        """
        if self._running:
            return True

        # Test database connectivity first (in calling thread, just for validation)
        test_db = MessagesDatabase(self.db_path)
        if not test_db.connect():
            return False
        test_db.close()

        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

        logger.info("Database worker started")
        return True

    @property
    def is_running(self) -> bool:
        """Check if the worker is running."""
        return self._running

    def stop(self) -> None:
        """Stop the worker thread."""
        if not self._running:
            return

        self._running = False
        # Send sentinel to unblock the queue
        self._request_queue.put(None)

        if self._thread:
            self._thread.join(timeout=5.0)
            self._thread = None

        logger.info("Database worker stopped")

    def _run(self) -> None:
        """Worker thread main loop."""
        # Create database connection in this thread
        self._db = MessagesDatabase(self.db_path)
        if not self._db.connect():
            logger.error("Database worker failed to connect")
            self._running = False
            return

        logger.info("Database worker connected to Messages database")

        while self._running:
            try:
                request = self._request_queue.get(timeout=1.0)

                if request is None:
                    # Sentinel received, exit
                    break

                self._process_request(request)

            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Database worker error: {e}")

        # Clean up
        if self._db:
            self._db.close()
            self._db = None

    def _process_request(self, request: DbRequest) -> None:
        """Process a database request."""
        result = None
        is_history_request = request.operation in (
            "get_messages_since",
            "get_messages_before",
            "get_latest_messages",
        )

        try:
            if request.operation == "get_messages_since":
                since_rowid = request.params.get("since_rowid", 0)
                limit = request.params.get("limit", 100)
                result = self._db.get_messages_since(since_rowid, limit)

            elif request.operation == "get_messages_before":
                before_rowid = request.params.get("before_rowid")
                limit = request.params.get("limit", 100)
                result = self._db.get_messages_before(before_rowid, limit)

            elif request.operation == "get_latest_messages":
                limit = request.params.get("limit", 100)
                result = self._db.get_latest_messages(limit)

            elif request.operation == "get_latest_rowid":
                result = self._db.get_latest_message_rowid()

            else:
                logger.warning(f"Unknown database operation: {request.operation}")

        except Exception as e:
            logger.error(f"Database operation failed: {e}")
            result = None

        finally:
            # Mark history as no longer in progress
            if is_history_request:
                with self._lock:
                    self._history_in_progress = False

        # Call the callback with the result
        if request.callback:
            try:
                request.callback(result)
            except Exception as e:
                logger.error(f"Callback error: {e}")

    def _request_history(
        self,
        operation: str,
        params: dict[str, Any],
        callback: Callable[[Optional[list[Message]]], None],
    ) -> bool:
        """Internal method to request history with mutual exclusion."""
        with self._lock:
            if self._history_in_progress:
                logger.warning("History request already in progress, ignoring")
                return False
            self._history_in_progress = True

        request = DbRequest(operation=operation, params=params, callback=callback)
        self._request_queue.put(request)
        return True

    def request_messages_since(
        self,
        since_rowid: int,
        limit: int,
        callback: Callable[[Optional[list[Message]]], None],
    ) -> bool:
        """Request messages since a given rowid (ascending).

        Returns False if a history request is already in progress.
        The callback will be called from the worker thread with the results.
        """
        return self._request_history(
            "get_messages_since",
            {"since_rowid": since_rowid, "limit": limit},
            callback,
        )

    def request_messages_before(
        self,
        before_rowid: int,
        limit: int,
        callback: Callable[[Optional[list[Message]]], None],
    ) -> bool:
        """Request messages before a given rowid (descending, newest first).

        Returns False if a history request is already in progress.
        The callback will be called from the worker thread with the results.
        """
        return self._request_history(
            "get_messages_before",
            {"before_rowid": before_rowid, "limit": limit},
            callback,
        )

    def request_latest_messages(
        self,
        limit: int,
        callback: Callable[[Optional[list[Message]]], None],
    ) -> bool:
        """Request the latest messages (descending, newest first).

        Returns False if a history request is already in progress.
        The callback will be called from the worker thread with the results.
        """
        return self._request_history(
            "get_latest_messages",
            {"limit": limit},
            callback,
        )

    def get_latest_rowid(self, callback: Callable[[int], None]) -> None:
        """Get the latest message rowid."""
        request = DbRequest(
            operation="get_latest_rowid",
            params={},
            callback=callback,
        )
        self._request_queue.put(request)

    @property
    def is_history_in_progress(self) -> bool:
        """Check if a history request is currently being processed."""
        with self._lock:
            return self._history_in_progress
