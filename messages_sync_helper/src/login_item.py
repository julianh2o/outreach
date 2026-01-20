"""Manage launch-at-login functionality for macOS."""

import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

# LaunchAgent plist template
LAUNCH_AGENT_PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.justanotheragent.messages-sync-helper</string>
    <key>ProgramArguments</key>
    <array>
        <string>{app_path}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
"""

LAUNCH_AGENT_PATH = (
    Path.home() / "Library" / "LaunchAgents" / "com.justanotheragent.messages-sync-helper.plist"
)


def get_app_path() -> Path:
    """Get the path to the running application bundle."""
    # When running as a .app bundle, we need the bundle path
    # When running as a script, use the Python executable
    import sys

    if getattr(sys, "frozen", False):
        # Running as bundled app
        # sys.executable points to the binary inside the .app
        # We need to go up to get the .app bundle
        exe_path = Path(sys.executable)
        # Typically: MyApp.app/Contents/MacOS/MyApp
        if "Contents/MacOS" in str(exe_path):
            return exe_path.parent.parent.parent
        return exe_path
    else:
        # Running as script - use open command with Python
        return Path(sys.executable)


def is_launch_at_login_enabled() -> bool:
    """Check if launch-at-login is currently enabled."""
    return LAUNCH_AGENT_PATH.exists()


def enable_launch_at_login() -> bool:
    """Enable launch-at-login by creating a LaunchAgent."""
    try:
        app_path = get_app_path()

        # For .app bundles, use 'open' command
        if app_path.suffix == ".app":
            program_args = f"/usr/bin/open -a {app_path}"
        else:
            # For development, launch the script directly
            program_args = str(app_path)

        plist_content = LAUNCH_AGENT_PLIST.format(app_path=program_args)

        # Ensure LaunchAgents directory exists
        LAUNCH_AGENT_PATH.parent.mkdir(parents=True, exist_ok=True)

        # Write the plist file
        LAUNCH_AGENT_PATH.write_text(plist_content)

        # Load the agent
        subprocess.run(["launchctl", "load", str(LAUNCH_AGENT_PATH)], check=True)

        logger.info("Enabled launch at login")
        return True
    except Exception as e:
        logger.error(f"Failed to enable launch at login: {e}")
        return False


def disable_launch_at_login() -> bool:
    """Disable launch-at-login by removing the LaunchAgent."""
    try:
        if LAUNCH_AGENT_PATH.exists():
            # Unload the agent first
            subprocess.run(
                ["launchctl", "unload", str(LAUNCH_AGENT_PATH)],
                check=False,  # Don't fail if already unloaded
            )
            # Remove the plist
            LAUNCH_AGENT_PATH.unlink()

        logger.info("Disabled launch at login")
        return True
    except Exception as e:
        logger.error(f"Failed to disable launch at login: {e}")
        return False


def toggle_launch_at_login() -> bool:
    """Toggle launch-at-login state. Returns new state."""
    if is_launch_at_login_enabled():
        disable_launch_at_login()
        return False
    else:
        enable_launch_at_login()
        return True
