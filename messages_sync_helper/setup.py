"""py2app build configuration for messages_sync_helper."""

from setuptools import setup

APP = ["src/main.py"]
DATA_FILES = []

OPTIONS = {
    "argv_emulation": False,
    "iconfile": "assets/icon.icns",
    "plist": {
        "CFBundleName": "Messages Sync Helper",
        "CFBundleDisplayName": "Messages Sync Helper",
        "CFBundleIdentifier": "com.justanotheragent.messages-sync-helper",
        "CFBundleVersion": "0.1.0",
        "CFBundleShortVersionString": "0.1.0",
        "LSUIElement": True,  # No dock icon, menu bar only
        "LSMinimumSystemVersion": "12.0",
        "NSSystemAdministrationUsageDescription": "Messages Sync Helper needs Full Disk Access to read your Messages database.",
        "NSHumanReadableCopyright": "Copyright 2025",
    },
    "packages": ["rumps", "watchdog", "websockets"],
}

setup(
    app=APP,
    name="Messages Sync Helper",
    data_files=DATA_FILES,
    options={"py2app": OPTIONS},
    setup_requires=["py2app"],
)
