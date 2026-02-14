"""Configuration management for Outreach Sync Helper."""

import json
import plistlib
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Default paths
MESSAGES_DB_PATH = Path.home() / "Library" / "Messages" / "chat.db"
ATTACHMENTS_PATH = Path.home() / "Library" / "Messages" / "Attachments"
CONFIG_DIR = Path.home() / "Library" / "Application Support" / "OutreachSyncHelper"
CONFIG_FILE = CONFIG_DIR / "config.json"
LOGS_DIR = CONFIG_DIR / "logs"
FAILED_ATTACHMENTS_LOG = LOGS_DIR / "failed_attachments.log"

# WebSocket URLs
DEV_WEBSOCKET_URL = "ws://localhost:2999/messages-sync"
PROD_WEBSOCKET_URL = "wss://outreach.julianverse.net/messages-sync"


def get_default_websocket_url() -> str:
    """Get the default WebSocket URL based on runtime environment.

    When running from a bundled .app, reads URL from Info.plist.
    Otherwise defaults to localhost for development.
    """
    # Check if running from a bundled .app
    executable_path = Path(sys.executable)
    if ".app/Contents/MacOS" in str(executable_path):
        # Try to read from Info.plist
        app_path = executable_path.parent.parent  # .app/Contents
        plist_path = app_path / "Info.plist"
        if plist_path.exists():
            try:
                with open(plist_path, "rb") as f:
                    plist = plistlib.load(f)
                    url = plist.get("OutreachWebSocketURL")
                    if url:
                        return url
            except Exception:
                pass
        # Fallback to production URL if in .app but plist read failed
        return PROD_WEBSOCKET_URL
    # Development mode
    return DEV_WEBSOCKET_URL


@dataclass
class Config:
    """Application configuration."""

    # WebSocket connection
    websocket_url: str = field(default_factory=get_default_websocket_url)

    # Sync settings
    poll_interval_seconds: float = 1.0  # Fallback polling interval
    use_file_watcher: bool = True  # Use fsevents for low-latency

    # Startup
    launch_at_login: bool = False

    # State tracking
    last_message_rowid: int = 0
    last_attachment_rowid: int = 0

    def save(self) -> None:
        """Save configuration to disk."""
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_FILE, "w") as f:
            json.dump(self.__dict__, f, indent=2)

    @classmethod
    def load(cls) -> "Config":
        """Load configuration from disk, or create default."""
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE) as f:
                    data = json.load(f)
                return cls(**data)
            except (json.JSONDecodeError, TypeError):
                pass
        return cls()


def get_config() -> Config:
    """Get the current configuration."""
    return Config.load()
