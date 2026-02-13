# TASKS.md - Integration Removal Agent

**Branch**: `refactor/remove-integrations`
**Status**: ACTIVE

## Instructions

Check this file periodically. If you see "STOP WORKING" below, stop immediately.

---

## Tasks

### 1. Delete Integration Files
- [ ] Delete `/server/discord-bot.ts`
- [ ] Delete `/server/tmux-adapter.ts`
- [ ] Delete `/server/tests/baml-test.ts`
- [ ] Delete `/server/api/discord.ts`
- [ ] Delete `/server/api/suggested-updates.ts`
- [ ] Delete `/server/services/messageAnalyzer.ts`
- [ ] Delete `/server/services/processingQueue.ts`
- [ ] Delete `/server/services/messageBatcher.ts`
- [ ] Delete `/server/jobs/messageSync.ts` (review first - if sync logic needed elsewhere, consolidate)

### 2. Delete BAML Infrastructure
- [ ] Delete entire `/baml_src/` directory
- [ ] Delete entire `/baml_client/` directory

### 3. Delete Frontend Components
- [ ] Delete `/src/pages/Admin.tsx`
- [ ] Delete entire `/src/components/SuggestedUpdates/` directory

### 4. Modify server/index.ts
- [ ] Remove import `startDiscordBot` from './discord-bot' (line 9)
- [ ] Remove import `startWorker` from './services/processingQueue' (line 10)
- [ ] Remove import `startMessageSyncJob` from './jobs/messageSync' (line 12) - review if needed
- [ ] Remove `await startDiscordBot();` call (line 67)
- [ ] Remove LLM availability check and worker start block (lines 70-85)

### 5. Modify server/config.ts
- [ ] Remove discord config object (lines 12-16)
- [ ] Remove tmux config object (lines 17-23)
- [ ] Remove messageAnalysis config object (lines 24-31)
- [ ] Remove Discord env var loading (lines 58-62)
- [ ] Remove Tmux env var loading (lines 63-68)
- [ ] Remove messageAnalysis env var loading (lines 69-76)

### 6. Modify package.json
- [ ] Remove dependency `@boundaryml/baml`
- [ ] Remove dependency `discord.js`
- [ ] Remove dependency `node-cron`
- [ ] Remove `baml:generate` script
- [ ] Remove `yarn baml:generate &&` from dev script

### 7. Modify .env.example
- [ ] Remove LLM_ENDPOINT, LLM_MODEL
- [ ] Remove MESSAGE_HISTORY_LIMIT, MESSAGE_BATCH_MAX_CHARS
- [ ] Remove ANALYSIS_WORKER_INTERVAL_MS, SUGGESTION_CONFIDENCE_THRESHOLD

### 8. Modify src/App.tsx
- [ ] Remove `import { Admin }` (line 7)
- [ ] Remove `/admin` route (line 23)

### 9. Verification
- [ ] Run `yarn install` - must succeed
- [ ] Run `yarn typecheck` - must pass
- [ ] Run `yarn build:server && yarn build` - must succeed

## Critical Notes

**DO NOT DELETE**:
- `/server/services/messageStorage.ts` - Used for iMessage sync
- `/server/handlers/websocketHandlers.ts` - Core sync functionality

**COMMIT FREQUENTLY** with meaningful messages.
