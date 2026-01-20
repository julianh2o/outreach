# Message Analysis Feature Plan

## How to Use This File
- This document outlines the implementation plan for analyzing messages with a local LLM
- Work through phases in order; each phase should be completable independently
- Check off items as completed: `- [x] Item`
- When resuming work, review completed items and start from the first unchecked item
- Run `yarn format > /dev/null && yarn lint && yarn typecheck && yarn build` after completing each phase

---

## Overview
Analyze iMessage conversations using a local LLM (via BAML) to extract useful information and suggest updates to contact metadata (custom fields, notes, etc.). Users can review and accept/reject suggested changes.

---

## Phase 1: Message Hashing [COMPLETED]

Create a deterministic hash function to uniquely identify messages for tracking processing state.

- [x] Create `server/utils/messageHash.ts`
  - [x] Implement `generateMessageHash(phoneNumber: string, isFromMe: boolean, timestamp: string, content: string): string`
  - [x] Hash format: `{phoneNumber}:{direction}:{timestamp}:{4-char-content-hash}`
  - [x] Use a fast hash algorithm (e.g., first 4 chars of base64-encoded MD5 of content)
- [x] Add unit tests for hash function in `server/utils/messageHash.test.ts`
  - [x] Test determinism (same input = same output)
  - [x] Test uniqueness (different inputs = different outputs)

---

## Phase 2: BAML Setup

Install and configure BAML for local LLM integration.

- [ ] Install BAML dependencies
  - [ ] `yarn add @boundaryml/baml`
  - [ ] Verify BAML CLI is available or install globally
- [ ] Create BAML configuration
  - [ ] Create `baml_src/` directory in project root
  - [ ] Create `baml_src/main.baml` with client configuration for local LLM (e.g., Ollama)
  - [ ] Configure model endpoint (default to `http://localhost:11434` for Ollama)
- [ ] Create BAML function for message analysis
  - [ ] Create `baml_src/extractContactInfo.baml`
  - [ ] Define input types: `ConversationSnippet`, `ContactSchema`, `CurrentFieldValues`
  - [ ] Define output type: `SuggestedUpdates` with field-value pairs and confidence scores
  - [ ] Write prompt template that instructs LLM to extract relevant information
- [ ] Generate BAML client code
  - [ ] Add `yarn baml:generate` script to package.json
  - [ ] Run generation and verify output in `baml_client/`
- [ ] Add BAML to build process
  - [ ] Update `yarn dev:server` to regenerate BAML on changes (optional)

---

## Phase 3: Database Schema for Processing Queue

Create tables to track message processing and store suggested updates.

- [ ] Create Prisma migration for new tables
  - [ ] `MessageProcessingBatch` table:
    - [ ] `id` (cuid)
    - [ ] `contactId` (foreign key to Contact)
    - [ ] `messageHashes` (JSON array of message hashes included in batch)
    - [ ] `conversationSnippet` (text - the concatenated messages sent to LLM)
    - [ ] `status` (enum: PENDING, PROCESSING, COMPLETED, FAILED)
    - [ ] `createdAt`, `updatedAt`
  - [ ] `SuggestedUpdate` table:
    - [ ] `id` (cuid)
    - [ ] `batchId` (foreign key to MessageProcessingBatch)
    - [ ] `contactId` (foreign key to Contact)
    - [ ] `suggestedChanges` (JSON - map of field names to suggested values)
    - [ ] `hasNotableUpdates` (boolean)
    - [ ] `status` (enum: PENDING, ACCEPTED, REJECTED, PARTIALLY_ACCEPTED)
    - [ ] `acceptedChanges` (JSON - which changes were accepted, null until reviewed)
    - [ ] `createdAt`, `updatedAt`
  - [ ] `ProcessedMessage` table (tracks which messages have been processed):
    - [ ] `id` (cuid)
    - [ ] `messageHash` (string, unique)
    - [ ] `batchId` (foreign key to MessageProcessingBatch)
    - [ ] `createdAt`
- [ ] Run migration: `yarn prisma:migrate`

---

## Phase 4: Message Batching Service

Create service to batch messages into conversation snippets for processing.

- [ ] Create `server/services/messageBatcher.ts`
  - [ ] `getUnprocessedMessages(contactId: string): Message[]`
    - [ ] Query iMessage adapter for messages
    - [ ] Filter out messages whose hashes exist in ProcessedMessage table
  - [ ] `createBatches(messages: Message[], maxChars: number = 1000): MessageBatch[]`
    - [ ] Group contiguous messages up to character limit
    - [ ] Preserve conversation context (don't split mid-exchange if possible)
    - [ ] Return array of batches with message arrays and combined text
  - [ ] `formatConversationSnippet(messages: Message[], contactName: string): string`
    - [ ] Format as readable conversation with timestamps
    - [ ] Label messages as "Me:" or "{contactName}:"
- [ ] Add configuration for batch size in `server/config.ts`
  - [ ] `MESSAGE_BATCH_MAX_CHARS` (default: 1000)

---

## Phase 5: LLM Analysis Service

Create service to send batches to BAML and process responses.

- [ ] Create `server/services/messageAnalyzer.ts`
  - [ ] `analyzeConversation(snippet: string, contact: Contact, customFieldDefs: CustomFieldDefinition[]): Promise<SuggestedChanges>`
    - [ ] Build schema description from contact model + custom fields
    - [ ] Call BAML function with snippet and schema
    - [ ] Parse and validate response
    - [ ] Return structured suggested changes
  - [ ] `determineIfNotable(changes: SuggestedChanges, currentValues: Record<string, any>): boolean`
    - [ ] Compare suggested values to current values
    - [ ] Return true if any meaningful differences exist
- [ ] Add error handling and retries for LLM calls
- [ ] Add logging for debugging LLM responses

---

## Phase 6: Processing Queue Worker

Create background worker to process message batches.

- [ ] Create `server/services/processingQueue.ts`
  - [ ] `enqueueContact(contactId: string): Promise<void>`
    - [ ] Get unprocessed messages for contact
    - [ ] Create batches
    - [ ] Insert MessageProcessingBatch records with PENDING status
    - [ ] Insert ProcessedMessage records for included messages
  - [ ] `processNextBatch(): Promise<boolean>`
    - [ ] Find oldest PENDING batch
    - [ ] Update status to PROCESSING
    - [ ] Call messageAnalyzer
    - [ ] Create SuggestedUpdate record
    - [ ] Update batch status to COMPLETED (or FAILED)
    - [ ] Return true if batch was processed, false if queue empty
  - [ ] `runWorker(intervalMs: number = 5000): void`
    - [ ] Poll for pending batches
    - [ ] Process one at a time to avoid overwhelming local LLM
- [ ] Create API endpoint to trigger processing
  - [ ] `POST /api/contacts/:id/analyze-messages`
  - [ ] Enqueues contact for processing
  - [ ] Returns immediately (processing happens in background)

---

## Phase 7: Suggested Updates API

Create API endpoints to retrieve and act on suggested updates.

- [ ] Create `server/api/suggested-updates.ts`
  - [ ] `GET /api/contacts/:id/suggested-updates`
    - [ ] Return pending SuggestedUpdate records for contact
    - [ ] Include the conversation snippets they came from (via batch)
  - [ ] `POST /api/suggested-updates/:id/accept`
    - [ ] Accept all suggested changes
    - [ ] Apply changes to contact
    - [ ] Update status to ACCEPTED
  - [ ] `POST /api/suggested-updates/:id/reject`
    - [ ] Update status to REJECTED
  - [ ] `POST /api/suggested-updates/:id/partial`
    - [ ] Accept body with which changes to apply
    - [ ] Apply selected changes to contact
    - [ ] Store accepted changes in acceptedChanges field
    - [ ] Update status to PARTIALLY_ACCEPTED
- [ ] Register routes in `server/api/index.ts`

---

## Phase 8: Frontend - Suggested Updates Display

Add UI to show and act on suggested updates.

- [ ] Create `src/utils/suggestedUpdatesApi.ts`
  - [ ] `fetchSuggestedUpdates(contactId: string): Promise<SuggestedUpdate[]>`
  - [ ] `acceptUpdate(updateId: string): Promise<void>`
  - [ ] `rejectUpdate(updateId: string): Promise<void>`
  - [ ] `partialAcceptUpdate(updateId: string, acceptedFields: string[]): Promise<void>`
  - [ ] `triggerAnalysis(contactId: string): Promise<void>`
- [ ] Create `src/components/SuggestedUpdates/SuggestedUpdates.tsx`
  - [ ] Display list of pending suggested updates
  - [ ] For each update, show:
    - [ ] Field name and current value vs suggested value (diff style)
    - [ ] Expandable section showing source conversation snippet
    - [ ] Checkboxes to select which changes to accept
    - [ ] Accept All / Reject All / Accept Selected buttons
  - [ ] Empty state when no suggestions
  - [ ] Loading state while fetching
- [ ] Create `src/components/SuggestedUpdates/index.ts` export
- [ ] Integrate into ContactDetailView
  - [ ] Add "Analyze Messages" button (triggers analysis)
  - [ ] Add SuggestedUpdates section (shows when there are pending updates)
  - [ ] Show processing indicator while analysis is running

---

## Phase 9: Polish and Configuration

Final touches and configuration options.

- [ ] Add environment variables
  - [ ] `LLM_ENDPOINT` (default: http://localhost:11434)
  - [ ] `LLM_MODEL` (default: llama2 or similar)
  - [ ] `MESSAGE_BATCH_MAX_CHARS` (default: 1000)
  - [ ] `ANALYSIS_WORKER_INTERVAL_MS` (default: 5000)
- [ ] Update `.env.example` with new variables
- [ ] Add startup check for LLM availability
  - [ ] Log warning if LLM endpoint is not reachable
  - [ ] Disable analysis features gracefully if LLM unavailable
- [ ] Add rate limiting to prevent overwhelming local LLM
- [ ] Add option to re-analyze messages (clear processed status for a contact)

---

## Future Enhancements (Out of Scope)
- Batch processing multiple contacts
- Automatic periodic analysis
- Confidence thresholds for auto-accepting low-risk updates
- Support for multiple LLM providers
- Message source display with highlighting of relevant parts
