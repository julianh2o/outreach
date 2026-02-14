# API Reference

## Contacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts` | List all contacts |
| GET | `/api/contacts/:id` | Get contact by ID |
| POST | `/api/contacts` | Create contact |
| PUT | `/api/contacts/:id` | Update contact |
| DELETE | `/api/contacts/:id` | Delete contact |
| DELETE | `/api/contacts` | Purge all contacts |
| POST | `/api/contacts/:id/mark-contacted` | Mark contact as contacted today |
| POST | `/api/contacts/sync-last-contacted` | Sync last contacted dates from iMessage |

## Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/messages/:phoneNumber` | Get messages for phone number |
| POST | `/api/messages/send` | Send iMessage via helper |
| POST | `/api/messages/purge-all` | Delete all stored messages |

## Lookups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/lookups/channel-types` | List channel types |
| GET | `/api/lookups/custom-fields` | List custom field definitions |
| GET | `/api/lookups/tags` | List all tags |
| POST | `/api/lookups/tags` | Create new tag |

## Attachments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attachments/:filename` | Serve attachment file |

## CSV Import/Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts/csv` | Export contacts as CSV |
| POST | `/api/contacts/csv` | Import contacts from CSV |
