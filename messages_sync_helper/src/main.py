"""Main entry point for Messages Sync Helper."""

import argparse
import asyncio
import json
import logging
import subprocess
import sys
import threading
from dataclasses import asdict
from datetime import datetime
from typing import Optional

import rumps

from .config import FAILED_ATTACHMENTS_LOG, MESSAGES_DB_PATH, Config, get_config
from .db_worker import DatabaseWorker
from .login_item import is_launch_at_login_enabled, toggle_launch_at_login
from .messages_db import MessagesDatabase
from .sync_client import SyncClient
from .watcher import MessagesDatabaseWatcher

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def json_serializer(obj):
    """JSON serializer for objects not serializable by default."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def cli_fetch_messages(args) -> int:
    """Fetch messages from the database and output as JSON."""
    db = MessagesDatabase()
    if not db.connect():
        print("Error: Cannot connect to Messages database.", file=sys.stderr)
        print("Ensure Full Disk Access is granted.", file=sys.stderr)
        return 1

    try:
        if args.before:
            messages = db.get_messages_before(args.before, limit=args.limit)
        elif args.since:
            messages = db.get_messages_since(args.since, limit=args.limit)
        else:
            messages = db.get_latest_messages(limit=args.limit)

        # Convert to JSON-serializable format
        output = []
        for msg in messages:
            msg_dict = {
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
                "attachments": [
                    {
                        "rowid": att.rowid,
                        "guid": att.guid,
                        "filename": att.filename,
                        "mime_type": att.mime_type,
                        "transfer_name": att.transfer_name,
                        "total_bytes": att.total_bytes,
                        "created_at": att.created_at.isoformat() if att.created_at else None,
                    }
                    for att in msg.attachments
                ],
            }
            output.append(msg_dict)

        print(json.dumps(output, indent=2))
        return 0
    finally:
        db.close()


def cli_send_message(args) -> int:
    """Send an iMessage via AppleScript."""
    handle_id = args.to
    text = args.message

    # Escape text for AppleScript
    escaped_text = text.replace("\\", "\\\\").replace('"', '\\"')
    escaped_handle = handle_id.replace("\\", "\\\\").replace('"', '\\"')

    script = f'''
    tell application "Messages"
        set targetBuddy to "{escaped_handle}"
        set targetService to id of 1st account whose service type = iMessage
        set theBuddy to participant targetBuddy of account id targetService
        send "{escaped_text}" to theBuddy
    end tell
    '''

    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            check=True,
            capture_output=True,
            text=True,
        )
        print(f"Message sent to {handle_id}")
        return 0
    except subprocess.CalledProcessError as e:
        print(f"Error: Failed to send message: {e.stderr}", file=sys.stderr)
        return 1


def cli_db_info(args) -> int:
    """Show database info and statistics."""
    db = MessagesDatabase()
    if not db.connect():
        print("Error: Cannot connect to Messages database.", file=sys.stderr)
        print("Ensure Full Disk Access is granted.", file=sys.stderr)
        return 1

    try:
        latest_rowid = db.get_latest_message_rowid()
        print(f"Database path: {MESSAGES_DB_PATH}")
        print(f"Latest message rowid: {latest_rowid}")

        # Get some recent messages to show count
        recent = db.get_latest_messages(limit=10)
        print(f"Recent messages retrieved: {len(recent)}")

        if recent:
            print("\nMost recent message:")
            msg = recent[0]
            print(f"  From: {msg.handle_id}")
            print(f"  Date: {msg.date}")
            print(f"  Text: {(msg.text or '(no text)')[:100]}")
        return 0
    finally:
        db.close()


def cli_check_attachment(args) -> int:
    """Check attachment status and diagnose sync issues."""
    db = MessagesDatabase()
    if not db.connect():
        print("Error: Cannot connect to Messages database.", file=sys.stderr)
        return 1

    try:
        if args.guid:
            # Look up specific attachment by GUID
            cursor = db._conn.cursor()
            cursor.execute(
                """
                SELECT a.ROWID, a.guid, a.filename, a.mime_type, a.transfer_name,
                       a.total_bytes, a.created_date, m.ROWID as message_rowid,
                       m.guid as message_guid, m.text, h.id as handle_id
                FROM attachment a
                JOIN message_attachment_join maj ON a.ROWID = maj.attachment_id
                JOIN message m ON maj.message_id = m.ROWID
                LEFT JOIN handle h ON m.handle_id = h.ROWID
                WHERE a.guid = ?
                """,
                (args.guid,),
            )
            row = cursor.fetchone()
            if not row:
                print(f"Attachment not found: {args.guid}")
                return 1

            from .messages_db import Attachment, apple_timestamp_to_datetime

            att = Attachment(
                rowid=row[0],
                guid=row[1],
                filename=row[2],
                mime_type=row[3],
                transfer_name=row[4],
                total_bytes=row[5] or 0,
                created_at=apple_timestamp_to_datetime(row[6]),
            )

            print(f"Attachment: {att.guid}")
            print(f"  Transfer name: {att.transfer_name}")
            print(f"  Filename (DB): {att.filename}")
            print(f"  MIME type: {att.mime_type}")
            print(f"  Size: {att.total_bytes} bytes ({att.total_bytes / 1024 / 1024:.2f} MB)")
            print(f"  Created: {att.created_at}")
            print(f"  Message rowid: {row[7]}")
            print(f"  Message guid: {row[8]}")
            print(f"  Handle: {row[10]}")
            print(f"  Message text: {(row[9] or '(none)')[:100]}")
            print()
            print(f"  Local path: {att.local_path}")
            if att.local_path:
                if att.local_path.exists():
                    actual_size = att.local_path.stat().st_size
                    print(f"  File exists: YES ({actual_size} bytes)")
                else:
                    print(f"  File exists: NO")
            else:
                print(f"  File exists: N/A (no path)")

        elif args.message_rowid:
            # Show attachments for a specific message
            # First get raw data including attributedBody
            cursor = db._conn.cursor()
            cursor.execute(
                """
                SELECT m.ROWID, m.guid, m.text, m.attributedBody, h.id as handle_id,
                       m.is_from_me, m.date, m.cache_has_attachments
                FROM message m
                LEFT JOIN handle h ON m.handle_id = h.ROWID
                WHERE m.ROWID = ?
                """,
                (args.message_rowid,),
            )
            row = cursor.fetchone()
            if not row:
                print(f"Message not found: rowid {args.message_rowid}")
                return 1

            from .messages_db import extract_text_from_attributed_body

            print(f"Message rowid: {row[0]}")
            print(f"  GUID: {row[1]}")
            print(f"  Handle: {row[4]}")
            print(f"  Raw text field: {repr(row[2])}")

            if row[3]:  # attributedBody
                print(f"  AttributedBody length: {len(row[3])} bytes")
                # Show hex dump of first 200 bytes
                blob = row[3]
                print(f"  AttributedBody hex (first 200 bytes):")
                for i in range(0, min(200, len(blob)), 16):
                    hex_part = " ".join(f"{b:02x}" for b in blob[i : i + 16])
                    ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in blob[i : i + 16])
                    print(f"    {i:04x}: {hex_part:<48} {ascii_part}")

                # Show extracted text
                extracted = extract_text_from_attributed_body(blob)
                print(f"  Extracted text: {repr(extracted)}")
            else:
                print(f"  AttributedBody: None")

            print(f"  Has attachments: {row[7]}")

            # Get attachments
            messages = db._get_messages(since_rowid=args.message_rowid - 1, limit=1)
            if messages:
                msg = messages[0]
                print(f"  Attachment count: {len(msg.attachments)}")
                for att in msg.attachments:
                    print(f"\n  Attachment: {att.guid}")
                    print(f"    Name: {att.transfer_name}")
                    print(f"    Size: {att.total_bytes} bytes")
                    print(f"    Path: {att.local_path}")
                    if att.local_path:
                        print(f"    Exists: {att.local_path.exists()}")

        else:
            # Show recent attachments with issues
            print("Recent attachments with potential issues:\n")
            cursor = db._conn.cursor()
            cursor.execute(
                """
                SELECT a.ROWID, a.guid, a.filename, a.mime_type, a.transfer_name,
                       a.total_bytes, m.ROWID as message_rowid
                FROM attachment a
                JOIN message_attachment_join maj ON a.ROWID = maj.attachment_id
                JOIN message m ON maj.message_id = m.ROWID
                ORDER BY a.ROWID DESC
                LIMIT 20
                """,
            )

            from .messages_db import Attachment

            for row in cursor.fetchall():
                att = Attachment(
                    rowid=row[0],
                    guid=row[1],
                    filename=row[2],
                    mime_type=row[3],
                    transfer_name=row[4],
                    total_bytes=row[5] or 0,
                    created_at=None,
                )
                exists = att.local_path.exists() if att.local_path else False
                status = "OK" if exists else "MISSING"
                size_mb = att.total_bytes / 1024 / 1024
                print(
                    f"[{status:7}] {att.guid[:20]}... "
                    f"{att.transfer_name or 'unnamed':30} "
                    f"{size_mb:6.2f}MB  msg:{row[6]}"
                )

            # Show failed attachments log if it exists
            if FAILED_ATTACHMENTS_LOG.exists():
                print(f"\n--- Failed attachments log ({FAILED_ATTACHMENTS_LOG}) ---")
                with open(FAILED_ATTACHMENTS_LOG) as f:
                    lines = f.readlines()[-10:]  # Last 10 lines
                    for line in lines:
                        print(line.rstrip())

        return 0
    finally:
        db.close()


class MessagesSyncHelperApp(rumps.App):
    """Menu bar application for syncing iMessage data."""

    def __init__(self):
        super().__init__(
            name="Messages Sync",
            icon=None,  # Will use default or custom icon
            quit_button=None,  # We'll add our own
        )

        self.config = get_config()
        self.db = MessagesDatabase()  # Used only in main thread for watcher callbacks
        self.db_worker = DatabaseWorker()  # Worker thread for history requests
        self.sync_client = SyncClient(self.config, db_worker=self.db_worker)
        self.watcher: Optional[MessagesDatabaseWatcher] = None

        # Async event loop running in background thread
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._loop_thread: Optional[threading.Thread] = None

        # Connection state
        self._connected = False

        # Build menu
        self._build_menu()

        # Set up callbacks
        self.sync_client.on_connected = self._on_connected
        self.sync_client.on_disconnected = self._on_disconnected
        self.sync_client.on_send_message = self._on_send_message_request

        # Auto-connect on startup after a brief delay
        self._auto_connect_timer = threading.Timer(1.0, self._auto_connect)
        self._auto_connect_timer.daemon = True
        self._auto_connect_timer.start()

    def _build_menu(self) -> None:
        """Build the menu bar menu."""
        self.menu = [
            rumps.MenuItem("Status: Disconnected", callback=None),
            None,  # Separator
            rumps.MenuItem("Connect", callback=self.on_connect),
            rumps.MenuItem("Disconnect", callback=self.on_disconnect),
            None,  # Separator
            rumps.MenuItem(
                "Launch at Login",
                callback=self.on_toggle_launch_at_login,
            ),
            rumps.MenuItem("Open Full Disk Access Settings", callback=self.on_open_fda_settings),
            None,  # Separator
            rumps.MenuItem("Quit", callback=self.on_quit),
        ]

        # Update launch at login checkbox
        self.menu["Launch at Login"].state = is_launch_at_login_enabled()

    def _update_status(self, status: str) -> None:
        """Update the status menu item."""
        self.menu["Status: Disconnected"].title = f"Status: {status}"

    def _auto_connect(self) -> None:
        """Automatically connect on startup."""
        logger.info("Auto-connecting on startup...")
        # Run connection in main thread context via rumps timer
        # We can't directly call on_connect since it needs rumps context
        self._do_connect()

    def _do_connect(self) -> bool:
        """Internal connect logic, returns True if connection started."""
        # Check database access first
        if not self.db.connect():
            logger.warning("Cannot auto-connect: Full Disk Access not granted")
            self._update_status("No DB Access")
            return False

        # Initialize last rowid if needed
        if self.config.last_message_rowid == 0:
            self.config.last_message_rowid = self.db.get_latest_message_rowid()
            self.config.save()

        # Start the database worker thread
        if not self.db_worker.is_running and not self.db_worker.start():
            logger.error("Failed to start database worker thread")
            return False

        self._update_status("Connecting...")

        # Start async loop in background thread
        if self._loop_thread is None or not self._loop_thread.is_alive():
            self._loop_thread = threading.Thread(target=self._start_async_loop, daemon=True)
            self._loop_thread.start()

        # Start file watcher
        if self.config.use_file_watcher and self.watcher is None:
            self.watcher = MessagesDatabaseWatcher(self._on_db_change)
            self.watcher.start(self._loop)

        return True

    def _on_connected(self) -> None:
        """Called when WebSocket connects."""
        self._connected = True
        self._update_status("Connected")
        self.title = None  # Could show a green dot icon

    def _on_disconnected(self) -> None:
        """Called when WebSocket disconnects."""
        self._connected = False
        self._update_status("Reconnecting...")
        self.title = None  # Could show a red dot icon
        # Note: The SyncClient.run() loop handles reconnection automatically
        # with exponential backoff (1s -> 2s -> 4s -> ... -> 30s max)

    def _on_send_message_request(self, handle_id: str, text: str) -> None:
        """Handle request from server to send an iMessage."""
        logger.info(f"Send message request: {handle_id} -> {text[:50]}...")
        # Use AppleScript to send via Messages.app
        self._send_imessage(handle_id, text)

    def _send_imessage(self, handle_id: str, text: str) -> bool:
        """Send an iMessage using AppleScript."""
        # Escape text for AppleScript
        escaped_text = text.replace("\\", "\\\\").replace('"', '\\"')
        escaped_handle = handle_id.replace("\\", "\\\\").replace('"', '\\"')

        script = f'''
        tell application "Messages"
            set targetBuddy to "{escaped_handle}"
            set targetService to id of 1st account whose service type = iMessage
            set theBuddy to participant targetBuddy of account id targetService
            send "{escaped_text}" to theBuddy
        end tell
        '''

        try:
            subprocess.run(["osascript", "-e", script], check=True, capture_output=True)
            logger.info(f"Sent message to {handle_id}")
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to send message: {e.stderr.decode()}")
            return False

    def _on_db_change(self) -> None:
        """Called when the Messages database changes."""
        if not self._connected:
            return

        # Fetch new messages
        messages = self.db.get_messages_since(self.config.last_message_rowid, limit=50)

        if messages:
            # Update last seen rowid
            self.config.last_message_rowid = messages[-1].rowid
            self.config.save()

            # Send to server (schedule on async loop)
            if self._loop:
                asyncio.run_coroutine_threadsafe(
                    self.sync_client.send_messages(messages), self._loop
                )
                logger.info(f"Queued {len(messages)} messages for sync")

    def _start_async_loop(self) -> None:
        """Start the async event loop in a background thread."""
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)

        # Start the sync client
        self._loop.run_until_complete(self.sync_client.run())

    def _stop_async_loop(self) -> None:
        """Stop the async event loop."""
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)

    @rumps.clicked("Connect")
    def on_connect(self, sender: rumps.MenuItem) -> None:
        """Handle Connect menu click."""
        if not self._do_connect():
            rumps.alert(
                title="Cannot Access Messages",
                message="Full Disk Access is required to read your Messages.\n\n"
                "Please grant access in System Settings > Privacy & Security > Full Disk Access.",
            )

    @rumps.clicked("Disconnect")
    def on_disconnect(self, sender: rumps.MenuItem) -> None:
        """Handle Disconnect menu click."""
        if self.watcher:
            self.watcher.stop()
            self.watcher = None

        if self._loop:
            asyncio.run_coroutine_threadsafe(self.sync_client.disconnect(), self._loop)

        # Stop the database worker thread
        self.db_worker.stop()

        self.db.close()
        self._update_status("Disconnected")

    @rumps.clicked("Launch at Login")
    def on_toggle_launch_at_login(self, sender: rumps.MenuItem) -> None:
        """Toggle launch at login setting."""
        new_state = toggle_launch_at_login()
        sender.state = new_state
        self.config.launch_at_login = new_state
        self.config.save()

    @rumps.clicked("Open Full Disk Access Settings")
    def on_open_fda_settings(self, sender: rumps.MenuItem) -> None:
        """Open System Settings to Full Disk Access."""
        subprocess.run(
            [
                "open",
                "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
            ]
        )

    @rumps.clicked("Quit")
    def on_quit(self, sender: rumps.MenuItem) -> None:
        """Quit the application."""
        self.on_disconnect(sender)
        rumps.quit_application()


def run_app() -> None:
    """Run the menu bar application."""
    logger.info("Starting Messages Sync Helper")
    app = MessagesSyncHelperApp()
    app.run()


def main() -> int:
    """Main entry point with CLI argument parsing."""
    parser = argparse.ArgumentParser(
        description="Messages Sync Helper - Sync iMessages with a remote server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run the menu bar app (default)
  python -m messages_sync_helper

  # Fetch the last 10 messages as JSON
  python -m messages_sync_helper fetch --limit 10

  # Fetch messages before a specific rowid
  python -m messages_sync_helper fetch --before 12345 --limit 50

  # Fetch messages since a specific rowid
  python -m messages_sync_helper fetch --since 12345

  # Send a message
  python -m messages_sync_helper send --to "+1234567890" --message "Hello!"

  # Show database info
  python -m messages_sync_helper info
        """,
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Fetch command
    fetch_parser = subparsers.add_parser("fetch", help="Fetch messages from the database")
    fetch_parser.add_argument(
        "--limit", "-n", type=int, default=10, help="Number of messages to fetch (default: 10)"
    )
    fetch_parser.add_argument("--before", "-b", type=int, help="Fetch messages before this rowid")
    fetch_parser.add_argument("--since", "-s", type=int, help="Fetch messages since this rowid")
    fetch_parser.set_defaults(func=cli_fetch_messages)

    # Send command
    send_parser = subparsers.add_parser("send", help="Send an iMessage")
    send_parser.add_argument("--to", "-t", required=True, help="Recipient phone number or email")
    send_parser.add_argument("--message", "-m", required=True, help="Message text to send")
    send_parser.set_defaults(func=cli_send_message)

    # Info command
    info_parser = subparsers.add_parser("info", help="Show database info")
    info_parser.set_defaults(func=cli_db_info)

    # Attachment check command
    att_parser = subparsers.add_parser(
        "attachment", help="Check attachment status and diagnose sync issues"
    )
    att_parser.add_argument("--guid", "-g", help="Look up specific attachment by GUID")
    att_parser.add_argument(
        "--message-rowid", "-m", type=int, help="Show attachments for a specific message rowid"
    )
    att_parser.set_defaults(func=cli_check_attachment)

    args = parser.parse_args()

    # If no command specified, run the app
    if args.command is None:
        run_app()
        return 0

    # Otherwise, run the CLI command
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
