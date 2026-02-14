"""py2app build configuration for messages_sync_helper."""

from setuptools import setup

APP = ["src/main.py"]
DATA_FILES = []

OPTIONS = {
    "argv_emulation": False,
    "iconfile": "assets/icon.icns",
    "plist": {
        "CFBundleName": "Outreach Sync Helper",
        "CFBundleDisplayName": "Outreach Sync Helper",
        "CFBundleIdentifier": "net.julianverse.outreach.sync-helper",
        "CFBundleVersion": "0.1.0",
        "CFBundleShortVersionString": "0.1.0",
        "LSUIElement": True,  # No dock icon, menu bar only
        "LSMinimumSystemVersion": "12.0",
        "NSSystemAdministrationUsageDescription": "Outreach Sync Helper needs Full Disk Access to read your Messages database.",
        "NSHumanReadableCopyright": "Copyright 2025",
        "OutreachWebSocketURL": "wss://outreach.julianverse.net/messages-sync",
    },
    "packages": ["rumps", "watchdog", "websockets"],
}

setup(
    app=APP,
    name="Outreach Sync Helper",
    data_files=DATA_FILES,
    options={"py2app": OPTIONS},
    setup_requires=["py2app"],
)
