"""Reader for macOS Messages chat.db database."""

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

from .config import ATTACHMENTS_PATH, MESSAGES_DB_PATH


@dataclass
class Attachment:
    """Represents a message attachment."""

    rowid: int
    guid: str
    filename: Optional[str]
    mime_type: Optional[str]
    transfer_name: Optional[str]
    total_bytes: int
    created_at: Optional[datetime]

    @property
    def local_path(self) -> Optional[Path]:
        """Get the local file path for this attachment.

        Handles multiple storage locations:
        1. Direct path from database (~/Library/Messages/Attachments/...)
        2. Temp paths (/var/folders/...) - tries to find in permanent location
        3. Relative paths
        """
        if not self.filename:
            return None

        # First, try the path as stored in the database
        if self.filename.startswith("~/"):
            path = Path(self.filename).expanduser()
        elif self.filename.startswith("/"):
            path = Path(self.filename)
        else:
            path = Path.home() / "Library" / "Messages" / self.filename

        # If file exists at the stored path, use it
        if path.exists():
            return path

        # If it's a temp path that doesn't exist, search the permanent attachments folder
        if "/var/folders/" in self.filename or "/tmp/" in self.filename:
            if self.transfer_name:
                # Search for the file by transfer_name in attachments folder
                found = self._find_in_attachments_folder(self.transfer_name)
                if found:
                    return found

        # Return the original path even if it doesn't exist (for error reporting)
        return path

    def _find_in_attachments_folder(self, filename: str) -> Optional[Path]:
        """Search for a file in the Messages Attachments folder."""
        import subprocess

        try:
            # Use find command for efficiency
            result = subprocess.run(
                ["find", str(ATTACHMENTS_PATH), "-name", filename, "-type", "f"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                # Return first match
                first_match = result.stdout.strip().split("\n")[0]
                return Path(first_match)
        except (subprocess.TimeoutExpired, subprocess.SubprocessError):
            pass
        return None


@dataclass
class Message:
    """Represents an iMessage/SMS message."""

    rowid: int
    guid: str
    text: Optional[str]
    handle_id: str  # Phone number or email
    is_from_me: bool
    date: datetime
    date_read: Optional[datetime]
    date_delivered: Optional[datetime]
    chat_id: Optional[int]
    has_attachments: bool
    attachments: list[Attachment]


def apple_timestamp_to_datetime(timestamp: Optional[int]) -> Optional[datetime]:
    """Convert Apple's nanosecond timestamp to datetime.

    Apple stores timestamps as nanoseconds since 2001-01-01.
    """
    if timestamp is None or timestamp == 0:
        return None
    # Apple epoch is 2001-01-01, Unix epoch is 1970-01-01
    # Difference is 978307200 seconds
    unix_timestamp = (timestamp / 1_000_000_000) + 978307200
    return datetime.fromtimestamp(unix_timestamp)


def _extract_fallback(blob: bytes) -> Optional[str]:
    """Fallback extraction: find longest readable text sequence."""
    if not blob:
        return None

    best_text = ""
    current_start = None

    for i in range(len(blob)):
        byte = blob[i]
        is_printable_ascii = 32 <= byte <= 126
        is_utf8_start = 0xC0 <= byte <= 0xF7
        is_utf8_cont = 0x80 <= byte <= 0xBF

        if is_printable_ascii or is_utf8_start:
            if current_start is None:
                current_start = i
        elif is_utf8_cont and current_start is not None:
            pass
        else:
            if current_start is not None:
                try:
                    candidate = blob[current_start:i].decode("utf-8")
                    # Skip class names and format markers
                    if (
                        len(candidate) > len(best_text)
                        and any(c.isalnum() for c in candidate)
                        and not candidate.startswith("NS")
                        and candidate != "streamtyped"
                        and "__kIM" not in candidate
                    ):
                        best_text = candidate
                except UnicodeDecodeError:
                    pass
                current_start = None

    if current_start is not None:
        try:
            candidate = blob[current_start:].decode("utf-8")
            if (
                len(candidate) > len(best_text)
                and any(c.isalnum() for c in candidate)
                and not candidate.startswith("NS")
            ):
                best_text = candidate
        except UnicodeDecodeError:
            pass

    if best_text and len(best_text) > 1:
        return best_text.strip()

    return None


def extract_text_from_attributed_body(blob: Optional[bytes]) -> Optional[str]:
    r"""Extract text from attributedBody field (macOS Ventura+).

    The attributedBody is a typedstream serialized NSAttributedString.
    Format after 0x01 0x2B marker: <length> <text> 0x86

    Length encoding:
    - Single byte length (0x00-0x7F): 1 byte, value is length
    - Extended length (0x81 prefix): 0x81 <len_low> <len_high> (3 bytes total)

    The text follows the length bytes and ends at 0x86.
    """
    if not blob:
        return None

    try:
        # Find the \x01+ marker which precedes string content
        marker_idx = blob.find(b"\x01+")
        if marker_idx == -1:
            return _extract_fallback(blob)

        pos = marker_idx + 2  # Position after \x01+

        if pos >= len(blob):
            return _extract_fallback(blob)

        length_byte = blob[pos]

        # Determine text length and start position based on length encoding
        if length_byte == 0x81:
            # Extended length encoding: 0x81 <low> <high>
            if pos + 2 >= len(blob):
                return _extract_fallback(blob)
            text_length = blob[pos + 1] | (blob[pos + 2] << 8)
            text_start = pos + 3
        elif length_byte < 0x80:
            # Single-byte length: the byte IS the length, text follows
            text_length = length_byte
            text_start = pos + 1
        else:
            # Unknown encoding, try fallback
            return _extract_fallback(blob)

        # Use the length to determine text end, not 0x86 marker
        # (0x86 marker can appear after the text content in metadata)
        text_end = text_start + text_length

        # Sanity check
        if text_end > len(blob):
            text_end = len(blob)

        # Extract and decode the text
        try:
            text = blob[text_start:text_end].decode("utf-8")
            # Remove U+FFFC (Object Replacement Character) used for attachment placeholders
            text = text.replace("\ufffc", "")
            if text and len(text.strip()) > 0:
                return text.strip()
        except UnicodeDecodeError:
            pass

        # If we got nothing after filtering, return None (attachment-only message)
        return None

    except Exception:
        return _extract_fallback(blob)


class MessagesDatabase:
    """Interface to the macOS Messages chat.db database."""

    def __init__(self, db_path: Path = MESSAGES_DB_PATH):
        self.db_path = db_path
        self._conn: Optional[sqlite3.Connection] = None

    def connect(self) -> bool:
        """Connect to the database. Returns True if successful."""
        try:
            # Read-only connection
            self._conn = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
            self._conn.row_factory = sqlite3.Row
            return True
        except sqlite3.Error as e:
            print(f"Failed to connect to Messages database: {e}")
            return False

    def close(self) -> None:
        """Close the database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None

    def get_messages_since(self, since_rowid: int = 0, limit: int = 100) -> list[Message]:
        """Get messages newer than the given rowid (ascending order)."""
        return self._get_messages(since_rowid=since_rowid, limit=limit)

    def get_messages_before(self, before_rowid: int, limit: int = 100) -> list[Message]:
        """Get messages older than the given rowid (descending order, returns newest first)."""
        return self._get_messages(before_rowid=before_rowid, limit=limit)

    def get_latest_messages(self, limit: int = 100) -> list[Message]:
        """Get the most recent messages (descending order)."""
        return self._get_messages(limit=limit)

    def _get_messages(
        self,
        since_rowid: Optional[int] = None,
        before_rowid: Optional[int] = None,
        limit: int = 100,
    ) -> list[Message]:
        """Internal method to get messages with flexible filtering."""
        if not self._conn:
            return []

        cursor = self._conn.cursor()

        # Build query based on parameters
        if before_rowid is not None:
            # Get messages before this rowid (descending)
            cursor.execute(
                """
                SELECT
                    m.ROWID,
                    m.guid,
                    m.text,
                    m.attributedBody,
                    h.id as handle_id,
                    m.is_from_me,
                    m.date,
                    m.date_read,
                    m.date_delivered,
                    cmj.chat_id,
                    m.cache_has_attachments
                FROM message m
                LEFT JOIN handle h ON m.handle_id = h.ROWID
                LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
                WHERE m.ROWID < ?
                ORDER BY m.ROWID DESC
                LIMIT ?
                """,
                (before_rowid, limit),
            )
        elif since_rowid is not None:
            # Get messages after this rowid (ascending)
            cursor.execute(
                """
                SELECT
                    m.ROWID,
                    m.guid,
                    m.text,
                    m.attributedBody,
                    h.id as handle_id,
                    m.is_from_me,
                    m.date,
                    m.date_read,
                    m.date_delivered,
                    cmj.chat_id,
                    m.cache_has_attachments
                FROM message m
                LEFT JOIN handle h ON m.handle_id = h.ROWID
                LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
                WHERE m.ROWID > ?
                ORDER BY m.ROWID ASC
                LIMIT ?
                """,
                (since_rowid, limit),
            )
        else:
            # Get latest messages (descending)
            cursor.execute(
                """
                SELECT
                    m.ROWID,
                    m.guid,
                    m.text,
                    m.attributedBody,
                    h.id as handle_id,
                    m.is_from_me,
                    m.date,
                    m.date_read,
                    m.date_delivered,
                    cmj.chat_id,
                    m.cache_has_attachments
                FROM message m
                LEFT JOIN handle h ON m.handle_id = h.ROWID
                LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
                ORDER BY m.ROWID DESC
                LIMIT ?
                """,
                (limit,),
            )

        messages = []
        for row in cursor.fetchall():
            # Get text from either text field or attributedBody
            text = row["text"]
            if not text and row["attributedBody"]:
                text = extract_text_from_attributed_body(row["attributedBody"])

            # Get attachments if present
            attachments = []
            if row["cache_has_attachments"]:
                attachments = self._get_attachments_for_message(row["ROWID"])

            messages.append(
                Message(
                    rowid=row["ROWID"],
                    guid=row["guid"],
                    text=text,
                    handle_id=row["handle_id"] or "unknown",
                    is_from_me=bool(row["is_from_me"]),
                    date=apple_timestamp_to_datetime(row["date"]) or datetime.now(),
                    date_read=apple_timestamp_to_datetime(row["date_read"]),
                    date_delivered=apple_timestamp_to_datetime(row["date_delivered"]),
                    chat_id=row["chat_id"],
                    has_attachments=bool(row["cache_has_attachments"]),
                    attachments=attachments,
                )
            )

        return messages

    def _get_attachments_for_message(self, message_rowid: int) -> list[Attachment]:
        """Get attachments for a specific message."""
        if not self._conn:
            return []

        cursor = self._conn.cursor()
        cursor.execute(
            """
            SELECT
                a.ROWID,
                a.guid,
                a.filename,
                a.mime_type,
                a.transfer_name,
                a.total_bytes,
                a.created_date
            FROM attachment a
            JOIN message_attachment_join maj ON a.ROWID = maj.attachment_id
            WHERE maj.message_id = ?
            """,
            (message_rowid,),
        )

        attachments = []
        for row in cursor.fetchall():
            attachments.append(
                Attachment(
                    rowid=row["ROWID"],
                    guid=row["guid"],
                    filename=row["filename"],
                    mime_type=row["mime_type"],
                    transfer_name=row["transfer_name"],
                    total_bytes=row["total_bytes"] or 0,
                    created_at=apple_timestamp_to_datetime(row["created_date"]),
                )
            )

        return attachments

    def get_latest_message_rowid(self) -> int:
        """Get the rowid of the most recent message."""
        if not self._conn:
            return 0

        cursor = self._conn.cursor()
        cursor.execute("SELECT MAX(ROWID) FROM message")
        result = cursor.fetchone()
        return result[0] if result and result[0] else 0

    def get_chat_participants(self, chat_id: int) -> list[str]:
        """Get all participants in a chat."""
        if not self._conn:
            return []

        cursor = self._conn.cursor()
        cursor.execute(
            """
            SELECT h.id
            FROM handle h
            JOIN chat_handle_join chj ON h.ROWID = chj.handle_id
            WHERE chj.chat_id = ?
            """,
            (chat_id,),
        )

        return [row[0] for row in cursor.fetchall()]
