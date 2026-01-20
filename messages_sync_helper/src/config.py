"""Configuration management for Messages Sync Helper."""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

# Default paths
MESSAGES_DB_PATH = Path.home() / "Library" / "Messages" / "chat.db"
ATTACHMENTS_PATH = Path.home() / "Library" / "Messages" / "Attachments"
CONFIG_DIR = Path.home() / "Library" / "Application Support" / "MessagesSyncHelper"
CONFIG_FILE = CONFIG_DIR / "config.json"
LOGS_DIR = CONFIG_DIR / "logs"
FAILED_ATTACHMENTS_LOG = LOGS_DIR / "failed_attachments.log"


@dataclass
class Config:
    """Application configuration."""

    # WebSocket connection
    websocket_url: str = "ws://localhost:2999/messages-sync"

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
