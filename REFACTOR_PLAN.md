# Refactor Plan: Simplification to Core Features

**Goal**: Transform from complex LLM-powered contact analysis system into focused iMessage sync + contact directory tool

**Date**: 2026-02-13

## Overview

Remove Discord, Tmux, Ollama/BAML integrations while keeping:
- iMessage message sync and sending
- Contact directory with CRUD operations
- REST APIs for external access
- Docker deployment
- Mac app installer

## Work Division Strategy

Each agent works in its own git worktree with a `TASKS.md` file:
- Tasks are defined in `TASKS.md` in each worktree
- Agents check `TASKS.md` at start and periodically
- We can update `TASKS.md` to add "STOP WORKING" instruction
- Each worktree has a feature branch

### Worktree 1: Integration Removal
**Branch**: `refactor/remove-integrations`
**Agent**: Integration Cleanup Agent
**Focus**: Remove Discord, Tmux, Ollama/BAML code and dependencies

### Worktree 2: Database Cleanup
**Branch**: `refactor/database-cleanup`
**Agent**: Database Cleanup Agent
**Focus**: Remove LLM-related database tables and migrations

### Worktree 3: API Enhancement
**Branch**: `refactor/api-enhancement`
**Agent**: API Enhancement Agent
**Focus**: Add filtering, overdue contacts endpoint, improve REST APIs

### Worktree 4: Documentation & Deployment
**Branch**: `refactor/docs-deployment`
**Agent**: Documentation Agent
**Focus**: Update README, ARCHITECTURE.md, add docker-compose, verify deployment

## Detailed Work Breakdown

### Phase 1: Backup & Setup (Main Branch)
- [x] Create backup branch `archive/pre-simplification`
- [x] Create 4 git worktrees with branches
- [x] Create `TASKS.md` in each worktree
- [x] Verify worktree isolation

### Phase 2: Parallel Work (4 Worktrees)

#### Worktree 1: Integration Removal
**Files to Delete**:
- `/server/discord-bot.ts`
- `/server/tmux-adapter.ts`
- `/server/tests/baml-test.ts`
- `/baml_src/` (entire directory)
- `/baml_client/` (entire directory)
- `/server/services/messageAnalyzer.ts`
- `/server/services/processingQueue.ts`
- `/server/services/messageBatcher.ts`
- `/server/jobs/messageSync.ts` (review before delete - keep sync logic elsewhere)
- `/server/api/discord.ts`
- `/server/api/suggested-updates.ts`
- `/src/pages/Admin.tsx`
- `/src/components/SuggestedUpdates/` (entire directory)

**Files to Modify**:
- `/server/index.ts` - Remove Discord bot, Tmux adapter, LLM services
- `/server/config.ts` - Remove Discord/Tmux/LLM env vars
- `/package.json` - Remove dependencies: `discord.js`, `@boundaryml/baml`, `node-cron`
- `/package.json` - Remove `baml:generate` script and references
- `/.env.example` - Remove Discord/Tmux/LLM env vars
- `/src/App.tsx` - Remove Admin route if present

**Verification**:
- [ ] `yarn install` succeeds
- [ ] `yarn typecheck` passes
- [ ] `yarn build:server && yarn build` succeeds

#### Worktree 2: Database Cleanup
**Database Schema Changes**:
- Remove models: `MessageProcessingBatch`, `SuggestedUpdate`, `ProcessedMessage`
- Review relationships and ensure no foreign keys break
- Create migration to drop tables

**Files to Modify**:
- `/prisma/schema.prisma` - Remove models
- Create new migration with `yarn prisma:migrate`

**Verification**:
- [ ] Migration applies cleanly
- [ ] Prisma client generates without errors
- [ ] No references to removed tables in codebase (grep check)

#### Worktree 3: API Enhancement
**New Endpoints**:
1. `GET /api/contacts/overdue` - Get contacts past their outreach frequency
   - Query params: `days` (optional, default to 0)
   - Returns: Contact[] with calculated overdue days
2. `GET /api/contacts` - Add filtering
   - Query params: `tag`, `channelType`, `search` (name search)
3. `GET /api/messages` - Add optional contact filtering
   - Query params: `contactId`, `limit`, `offset`

**Files to Create/Modify**:
- `/server/api/contacts.ts` - Add overdue endpoint and filtering
- `/server/api/messages.ts` - Add filtering support

**Verification**:
- [ ] All endpoints return expected data
- [ ] TypeScript types are correct
- [ ] Test with curl or Postman

#### Worktree 4: Documentation & Deployment
**README.md Updates**:
- Remove mentions of Discord, Tmux, Ollama, BAML, Admin page
- Document core features clearly:
  - iMessage sync and sending
  - Contact directory with channels, tags, custom fields
  - REST APIs for integration
- Document new API endpoints
- Update installation instructions

**ARCHITECTURE.md Updates**:
- Remove Discord/Tmux/LLM sections
- Update database schema documentation
- Update API endpoint list
- Simplify architecture diagrams/descriptions

**Docker Deployment**:
- Create `docker-compose.yml` for dev environment
- Verify `Dockerfile` still works after dependency removal
- Test build: `docker build -t justanotheragent .`
- Test run: `docker run -p 2999:2999 justanotheragent`

**Mac App**:
- Verify messages_sync_helper still works
- Update any README in that directory if needed

**Verification**:
- [ ] README accurately reflects current features
- [ ] ARCHITECTURE.md is up to date
- [ ] Docker build succeeds
- [ ] Docker container runs and serves app
- [ ] docker-compose.yml works for dev environment

### Phase 3: Integration & Testing (Main Branch)
- [ ] Merge all 4 branches in order: DB cleanup, Integration removal, API enhancement, Docs
- [ ] Run full verification:
  - [ ] `yarn install`
  - [ ] `yarn lint`
  - [ ] `yarn typecheck`
  - [ ] `yarn build:server && yarn build`
  - [ ] `yarn test` (if tests exist)
  - [ ] Manual smoke test of app
  - [ ] Docker build and run
- [ ] Clean up worktrees

## Environment Variables After Refactor

**Keep**:
- `PORT` - Server port (default 2999)
- `DATABASE_URL` - SQLite database path

**Remove**:
- `DISCORD_BOT_TOKEN`
- `DISCORD_USER_ID`
- `DISCORD_ALLOWED_USERNAME`
- `TMUX_SSH_HOST`, `TMUX_SSH_USER`, `TMUX_SESSION`, `TMUX_CLAUDE_COMMAND`, `TMUX_MESSAGE_PREFIX`
- `LLM_ENDPOINT`, `LLM_MODEL`, `MESSAGE_HISTORY_LIMIT`, `MESSAGE_BATCH_MAX_CHARS`, `ANALYSIS_WORKER_INTERVAL_MS`, `SUGGESTION_CONFIDENCE_THRESHOLD`

## Dependencies After Refactor

**Keep**:
- Core: `express`, `cors`, `dotenv`, `ws`, `uuid`
- Database: `@prisma/client`, `@libsql/client`, `@prisma/adapter-libsql`, `better-sqlite3`
- React: `react`, `react-dom`, `react-router-dom`, `react-helmet-async`
- UI: `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`, `ag-grid-react`

**Remove**:
- `discord.js`
- `@boundaryml/baml`
- `node-cron`

## Success Criteria

- [ ] No Discord, Tmux, Ollama, or BAML code remains
- [ ] All TypeScript compiles without errors
- [ ] Application runs and functions correctly
- [ ] Docker build and container work
- [ ] Documentation accurately reflects simplified app
- [ ] New API endpoints work as expected
- [ ] No broken imports or references
- [ ] Clean git history with meaningful commits

## Safety Measures

1. **Backup branch created before any changes**
2. **Each worktree is isolated** - no cross-contamination
3. **TASKS.md control** - can stop agents by updating file
4. **Incremental merging** - merge one branch at a time
5. **Full verification** - comprehensive testing after merge

## Timeline Estimate

- Phase 1 (Setup): ~15 minutes
- Phase 2 (Parallel work): ~45-60 minutes
- Phase 3 (Integration): ~30 minutes
- **Total**: ~1.5-2 hours with agent parallelization

## Notes

- Keep message sync logic intact - it's core to the app
- Preserve all contact management features
- Maintain backward compatibility with existing contact data
- Python helper app (messages_sync_helper) stays unchanged

## Implementation Details (Verified)

### Critical: Files to KEEP
- `/server/services/messageStorage.ts` - Used for iMessage sync, NOT LLM analysis. Do not delete.
- `/server/handlers/websocketHandlers.ts` - Core sync functionality. Do not delete.

### server/index.ts Modifications (Lines to Change)
- **Line 9**: Remove `import { startDiscordBot } from './discord-bot';`
- **Line 10**: Remove `import { startWorker } from './services/processingQueue';`
- **Line 12**: Review `import { startMessageSyncJob } from './jobs/messageSync';` - may need to consolidate
- **Line 67**: Remove `await startDiscordBot();`
- **Lines 70-85**: Remove entire LLM availability check and worker start block

### server/config.ts Modifications (Sections to Remove)
- **Lines 12-16**: Discord config object
- **Lines 17-23**: Tmux config object
- **Lines 24-31**: messageAnalysis config object
- **Lines 58-62**: Discord env var loading
- **Lines 63-68**: Tmux env var loading
- **Lines 69-76**: messageAnalysis env var loading

### package.json Modifications
- **Line 14**: Remove `"@boundaryml/baml": "^0.217.0"`
- **Line 23**: Remove `"discord.js": "^14.25.1"`
- **Line 27**: Remove `"node-cron": "^4.2.1"`
- **Line 35**: Modify dev script - remove `yarn baml:generate &&` prefix
- **Line 59**: Remove `"baml:generate": "npx baml-cli generate"`

### prisma/schema.prisma Modifications
**Models to Remove (with line numbers)**:
- **Lines 109-124**: `MessageProcessingBatch` model
- **Lines 126-138**: `SuggestedUpdate` model
- **Lines 140-146**: `ProcessedMessage` model

**Enums to Remove**:
- **Lines 95-100**: `BatchStatus` enum
- **Lines 102-107**: `SuggestionStatus` enum

**Contact Model Cleanup (Lines 26-27)**:
- Remove: `processingBatches MessageProcessingBatch[]`
- Remove: `suggestedUpdates  SuggestedUpdate[]`

### App.tsx Modifications
- **Line 7**: Remove `import { Admin } from './pages/Admin';`
- **Line 23**: Remove `<Route path='/admin' element={<Admin />} />`

### Import Chain Dependencies
- `tmux-adapter.ts` is imported by `discord-bot.ts` (safe to delete together)
- `messageBatcher.ts` imports from `messageStorage.ts` (messageStorage stays)
- `processingQueue.ts` imports `messageAnalyzer.ts` (both deleted together)

### .env.example Current State
Note: Discord/Tmux vars are not in .env.example but ARE used in config.ts.
Variables to remove from .env.example:
- **Lines 10-12**: LLM_ENDPOINT, LLM_MODEL
- **Lines 16-22**: MESSAGE_HISTORY_LIMIT, MESSAGE_BATCH_MAX_CHARS, ANALYSIS_WORKER_INTERVAL_MS, SUGGESTION_CONFIDENCE_THRESHOLD

## Worktree Paths

```
/Users/julian/Documents/code/justanotheragent                  # Main (this repo)
/Users/julian/Documents/code/justanotheragent-wt1-integrations # Worktree 1: Integration Removal
/Users/julian/Documents/code/justanotheragent-wt2-database     # Worktree 2: Database Cleanup
/Users/julian/Documents/code/justanotheragent-wt3-api          # Worktree 3: API Enhancement
/Users/julian/Documents/code/justanotheragent-wt4-docs         # Worktree 4: Documentation
```
