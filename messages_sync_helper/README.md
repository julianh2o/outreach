# Messages Sync Helper

macOS menu bar app that syncs iMessage data to the main application via WebSocket.

## Requirements

- macOS 12.0+
- Python 3.10+
- Full Disk Access permission (to read ~/Library/Messages/chat.db)

## Development Setup

```bash
cd messages_sync_helper
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Running in Development

```bash
python -m src.main
```

## Building the App Bundle

```bash
python setup.py py2app
```

The app will be created at `dist/Messages Sync Helper.app`.

## Granting Full Disk Access

1. Open System Settings > Privacy & Security > Full Disk Access
2. Click the + button
3. Navigate to the built app (or Terminal for development)
4. Enable the toggle

## WebSocket Protocol

The app connects to `ws://localhost:2999/messages-sync` by default.

### Messages sent TO server

```json
{
  "type": "new_messages",
  "messages": [...],
  "timestamp": "2025-01-20T12:00:00"
}
```

### Messages received FROM server

```json
{
  "type": "send_message",
  "handle_id": "+1234567890",
  "text": "Hello!"
}
```
