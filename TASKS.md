# TASKS.md - API Enhancement Agent

**Branch**: `refactor/api-enhancement`
**Status**: ACTIVE

## Instructions

Check this file periodically. If you see "STOP WORKING" below, stop immediately.

---

## Tasks

### 1. Add Overdue Contacts Endpoint

File: `/server/api/contacts.ts`

- [ ] Add new endpoint: `GET /api/contacts/overdue`
- [ ] Query params:
  - `days` (optional, number) - defaults to 0 (get all overdue)
- [ ] Logic:
  - Get contacts with `outreachFrequencyDays` set
  - Calculate last contact date from messages
  - Return contacts where (today - last_contact) > outreachFrequencyDays + days param
- [ ] Response: Contact[] with `overdueDays` calculated field

### 2. Add Contact Filtering

File: `/server/api/contacts.ts`

- [ ] Modify existing `GET /api/contacts` endpoint
- [ ] Add query params:
  - `tag` (string) - filter by tag name
  - `channelType` (string) - filter by channel type (iMessage, etc.)
  - `search` (string) - search by contact name (case-insensitive)
- [ ] Ensure backward compatibility - no params = return all

### 3. Add Message Filtering

File: `/server/api/messages.ts`

- [ ] Modify existing `GET /api/messages` endpoint (or create if doesn't exist)
- [ ] Add query params:
  - `contactId` (string) - filter by contact
  - `limit` (number) - limit results (default 50)
  - `offset` (number) - pagination offset (default 0)
- [ ] Return messages sorted by date descending

### 4. TypeScript Types

- [ ] Ensure all new endpoints have proper TypeScript types
- [ ] Add response types if not already defined
- [ ] Use Prisma types where applicable

### 5. Verification

- [ ] Test `GET /api/contacts/overdue` returns correct data
- [ ] Test `GET /api/contacts?tag=friend` filters correctly
- [ ] Test `GET /api/contacts?search=john` searches correctly
- [ ] Test `GET /api/messages?contactId=xxx&limit=10` works
- [ ] Run `yarn typecheck` - must pass
- [ ] Run `yarn lint` - must pass

## API Response Examples

```typescript
// GET /api/contacts/overdue
[
  {
    id: "clxxx",
    name: "John Doe",
    overdueDays: 5,
    outreachFrequencyDays: 30,
    lastContactDate: "2026-02-08T00:00:00Z",
    // ... other contact fields
  }
]

// GET /api/contacts?tag=family&search=smith
[
  {
    id: "clyyy",
    name: "Jane Smith",
    tags: [{ name: "family" }],
    // ...
  }
]
```

**COMMIT** after each endpoint is implemented and tested.
