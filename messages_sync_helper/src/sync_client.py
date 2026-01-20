"""WebSocket client for syncing messages to the main application."""

import asyncio
import base64
import json
import logging
from datetime import datetime
from typing import Any, Callable, Optional

import websockets
from websockets.client import WebSocketClientProtocol

from .config import FAILED_ATTACHMENTS_LOG, LOGS_DIR, Config
from .db_worker import DatabaseWorker
from .messages_db import Attachment, Message

# Maximum attachment size to transfer (10MB)
MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024

logger = logging.getLogger(__name__)


def log_failed_attachment(attachment: "Attachment", error: str) -> None:
    """Log a failed attachment to the failed attachments log file."""
    try:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().isoformat()
        with open(FAILED_ATTACHMENTS_LOG, "a") as f:
            f.write(
                f"{timestamp}\t{error}\t{attachment.guid}\t"
                f"{attachment.transfer_name or attachment.filename or 'unknown'}\t"
                f"{attachment.local_path or 'no_path'}\t"
                f"{attachment.total_bytes} bytes\n"
            )
    except Exception as e:
        logger.error(f"Failed to write to attachment log: {e}")


def serialize_message(msg: Message) -> dict[str, Any]:
    """Serialize a Message to JSON-compatible dict."""
    return {
        "rowid": msg.rowid,
        "guid": msg.guid,
        "text": msg.text,
        "handle_id": msg.handle_id,
        "is_from_me": msg.is_from_me,
        "date": msg.date.isoformat() if msg.date else None,
        "date_read": msg.date_read.isoformat() if msg.date_read else None,
        "date_delivered": msg.date_delivered.isoformat() if msg.date_delivered else None,
        "chat_id": msg.chat_id,
        "has_attachments": msg.has_attachments,
        "attachments": [serialize_attachment(a) for a in msg.attachments],
    }


def serialize_attachment(att: Attachment) -> dict[str, Any]:
    """Serialize an Attachment to JSON-compatible dict."""
    return {
        "rowid": att.rowid,
        "guid": att.guid,
        "filename": att.filename,
        "mime_type": att.mime_type,
        "transfer_name": att.transfer_name,
        "total_bytes": att.total_bytes,
        "created_at": att.created_at.isoformat() if att.created_at else None,
        "local_path": str(att.local_path) if att.local_path else None,
    }


class SyncClient:
    """WebSocket client for bidirectional message sync."""

    def __init__(self, config: Config, db_worker: Optional[DatabaseWorker] = None):
        self.config = config
        self.db_worker = db_worker
        self._ws: Optional[WebSocketClientProtocol] = None
        self._connected = False
        self._reconnect_delay = 1.0
        self._max_reconnect_delay = 30.0
        self._running = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        # Callbacks
        self.on_connected: Optional[Callable[[], None]] = None
        self.on_disconnected: Optional[Callable[[], None]] = None
        self.on_send_message: Optional[Callable[[str, str], None]] = None  # (handle_id, text)

    @property
    def connected(self) -> bool:
        return self._connected

    async def connect(self) -> bool:
        """Connect to the WebSocket server."""
        try:
            self._ws = await websockets.connect(
                self.config.websocket_url,
                ping_interval=30,
                ping_timeout=10,
            )
            self._connected = True
            self._reconnect_delay = 1.0  # Reset on successful connect
            logger.info(f"Connected to {self.config.websocket_url}")

            if self.on_connected:
                self.on_connected()

            return True
        except Exception as e:
            logger.warning(f"Failed to connect: {e}")
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """Disconnect from the server."""
        self._running = False
        if self._ws:
            await self._ws.close()
            self._ws = None
        self._connected = False

        if self.on_disconnected:
            self.on_disconnected()

    async def send_messages(self, messages: list[Message]) -> bool:
        """Send new messages to the server."""
        if not self._connected or not self._ws:
            return False

        try:
            payload = {
                "type": "new_messages",
                "messages": [serialize_message(m) for m in messages],
                "timestamp": datetime.now().isoformat(),
            }
            await self._ws.send(json.dumps(payload))
            logger.debug(f"Sent {len(messages)} messages")
            return True
        except Exception as e:
            logger.error(f"Failed to send messages: {e}")
            self._connected = False
            return False

    async def send_attachment_data(
        self, attachment: Attachment, include_data: bool = False
    ) -> bool:
        """Send attachment metadata (and optionally data) to the server."""
        if not self._connected or not self._ws:
            return False

        try:
            payload: dict[str, Any] = {
                "type": "attachment",
                "attachment": serialize_attachment(attachment),
            }

            # Optionally include base64-encoded file data
            if include_data and attachment.local_path:
                if not attachment.local_path.exists():
                    error_msg = "file_not_found"
                    logger.warning(
                        f"Attachment file not found: {attachment.guid} ({attachment.local_path})"
                    )
                    payload["error"] = error_msg
                    log_failed_attachment(attachment, error_msg)
                else:
                    file_size = attachment.local_path.stat().st_size
                    if file_size > MAX_ATTACHMENT_SIZE:
                        error_msg = f"file_too_large ({file_size} bytes)"
                        logger.warning(
                            f"Attachment too large: {attachment.guid} "
                            f"({file_size} bytes > {MAX_ATTACHMENT_SIZE} bytes)"
                        )
                        payload["error"] = "file_too_large"
                        log_failed_attachment(attachment, error_msg)
                    else:
                        logger.info(
                            f"Reading attachment {attachment.guid}: "
                            f"{attachment.local_path.name} ({file_size} bytes)"
                        )
                        try:
                            with open(attachment.local_path, "rb") as f:
                                payload["data"] = base64.b64encode(f.read()).decode("utf-8")
                            logger.info(f"Sending attachment {attachment.guid} with data")
                        except OSError as e:
                            error_msg = f"read_error: {e}"
                            logger.error(f"Failed to read attachment {attachment.guid}: {e}")
                            payload["error"] = error_msg
                            log_failed_attachment(attachment, error_msg)
            elif include_data:
                error_msg = "no_local_path"
                logger.warning(f"No local path for attachment {attachment.guid}")
                payload["error"] = error_msg
                log_failed_attachment(attachment, error_msg)

            await self._ws.send(json.dumps(payload))
            logger.debug(f"WebSocket send complete for attachment {attachment.guid}")
            return True
        except websockets.ConnectionClosed as e:
            logger.error(f"Connection closed while sending attachment {attachment.guid}: {e}")
            self._connected = False
            return False
        except Exception as e:
            logger.error(f"Failed to send attachment {attachment.guid}: {e}")
            return False

    async def run(self) -> None:
        """Main loop: connect and handle incoming messages."""
        self._running = True
        self._loop = asyncio.get_event_loop()

        while self._running:
            if not self._connected:
                connected = await self.connect()
                if not connected:
                    # Exponential backoff
                    await asyncio.sleep(self._reconnect_delay)
                    self._reconnect_delay = min(
                        self._reconnect_delay * 2, self._max_reconnect_delay
                    )
                    continue

            try:
                # Listen for incoming messages
                async for raw_message in self._ws:
                    await self._handle_incoming(raw_message)
            except websockets.ConnectionClosed:
                logger.info("Connection closed")
                self._connected = False
                if self.on_disconnected:
                    self.on_disconnected()
            except Exception as e:
                logger.error(f"Error in message loop: {e}")
                self._connected = False

    async def _handle_incoming(self, raw: str) -> None:
        """Handle an incoming message from the server."""
        try:
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "send_message":
                # Server wants us to send an iMessage
                handle_id = data.get("handle_id")
                text = data.get("text")
                if handle_id and text and self.on_send_message:
                    self.on_send_message(handle_id, text)

            elif msg_type == "ping":
                # Respond to ping
                await self._ws.send(json.dumps({"type": "pong"}))

            elif msg_type == "request_history":
                # Server wants message history
                since_rowid = data.get("since_rowid")
                before_rowid = data.get("before_rowid")
                limit = data.get("limit", 500)
                self._handle_history_request(since_rowid, before_rowid, limit)

            else:
                logger.debug(f"Unknown message type: {msg_type}")

        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON received: {raw[:100]}")

    def _handle_history_request(
        self,
        since_rowid: Optional[int],
        before_rowid: Optional[int],
        limit: int,
    ) -> None:
        """Handle a request for message history from the server.

        This schedules the database work on the worker thread and sends
        results back via the async loop when ready.
        """
        if not self.db_worker:
            logger.warning("History request received but no database worker available")
            return

        if self.db_worker.is_history_in_progress:
            logger.warning("History request already in progress, ignoring")
            return

        def on_messages_ready(messages: Optional[list[Message]]) -> None:
            """Callback from worker thread when messages are ready."""
            if self._loop is None:
                logger.error("No event loop available for callback")
                return

            # Schedule the async send on the event loop
            asyncio.run_coroutine_threadsafe(
                self._send_history_response(messages, since_rowid, before_rowid, limit),
                self._loop,
            )

        # Determine which type of request to make
        if before_rowid is not None:
            logger.info(f"Processing history request: before_rowid={before_rowid}, limit={limit}")
            if not self.db_worker.request_messages_before(before_rowid, limit, on_messages_ready):
                logger.warning("Failed to submit history request to worker")
        elif since_rowid is not None:
            logger.info(f"Processing history request: since_rowid={since_rowid}, limit={limit}")
            if not self.db_worker.request_messages_since(since_rowid, limit, on_messages_ready):
                logger.warning("Failed to submit history request to worker")
        else:
            # No rowid specified, get latest messages
            logger.info(f"Processing history request: latest {limit} messages")
            if not self.db_worker.request_latest_messages(limit, on_messages_ready):
                logger.warning("Failed to submit history request to worker")

    async def _send_history_response(
        self,
        messages: Optional[list[Message]],
        since_rowid: Optional[int],
        before_rowid: Optional[int],
        requested_limit: int,
    ) -> None:
        """Send history response back to the server."""
        if not self._connected or not self._ws:
            logger.warning("Cannot send history response: not connected")
            return

        try:
            message_count = len(messages) if messages else 0
            has_more = (
                message_count == requested_limit
            )  # If we got exactly limit, there may be more

            if messages:
                direction = "before" if before_rowid else ("since" if since_rowid else "latest")
                logger.info(f"Found {message_count} messages ({direction})")

                # Send history response
                payload: dict[str, Any] = {
                    "type": "history_response",
                    "messages": [serialize_message(m) for m in messages],
                    "has_more": has_more,
                }
                if since_rowid is not None:
                    payload["since_rowid"] = since_rowid
                if before_rowid is not None:
                    payload["before_rowid"] = before_rowid

                await self._ws.send(json.dumps(payload))
                logger.info(f"Sent {message_count} historical messages (has_more={has_more})")

                # Also send attachment data for messages with attachments
                attachment_count = sum(len(m.attachments) for m in messages)
                if attachment_count > 0:
                    logger.info(f"Sending {attachment_count} attachments...")
                    sent = 0
                    failed = 0
                    for msg in messages:
                        for att in msg.attachments:
                            # Check connection before each attachment
                            if not self._connected or not self._ws:
                                logger.error(
                                    f"Connection lost during attachment transfer, "
                                    f"stopping ({sent} sent, "
                                    f"{attachment_count - sent - failed} remaining)"
                                )
                                return
                            try:
                                success = await self.send_attachment_data(att, include_data=True)
                                if success:
                                    sent += 1
                                else:
                                    failed += 1
                                    logger.warning(
                                        f"Failed to send attachment {att.guid} (connection lost?)"
                                    )
                                # Small delay between attachments to prevent overwhelming
                                await asyncio.sleep(0.05)
                            except Exception as e:
                                failed += 1
                                logger.error(f"Exception sending attachment {att.guid}: {e}")
                    logger.info(f"Attachment transfer complete: {sent} sent, {failed} failed")
            else:
                # Send empty response
                payload: dict[str, Any] = {
                    "type": "history_response",
                    "messages": [],
                    "has_more": False,
                }
                if since_rowid is not None:
                    payload["since_rowid"] = since_rowid
                if before_rowid is not None:
                    payload["before_rowid"] = before_rowid

                await self._ws.send(json.dumps(payload))
                logger.info("Sent empty history response (no messages)")

        except Exception as e:
            logger.error(f"Failed to send history response: {e}")
