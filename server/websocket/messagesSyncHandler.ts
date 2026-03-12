import type { WebSocket } from 'ws';
import {
  storeMessages,
  storeAttachmentData,
  storeAttachmentError,
  getSyncCursor,
  updateSyncCursor,
  getMaxStoredRowid,
  getMinStoredRowid,
  getStoredMessageCount,
  type IncomingMessage,
  type IncomingAttachment,
} from '../services/messageStorage';

// Message types from the Python helper
interface NewMessagesPayload {
  type: 'new_messages';
  client_id: string;
  messages: IncomingMessage[];
  timestamp: string;
}

interface AttachmentPayload {
  type: 'attachment';
  attachment: IncomingAttachment;
  data?: string; // base64 encoded
  error?: string; // error if attachment couldn't be read
}

interface HistoryResponsePayload {
  type: 'history_response';
  client_id: string;
  messages: IncomingMessage[];
  since_rowid?: number;
  before_rowid?: number;
  has_more?: boolean; // True if there are more messages to fetch
}

interface PongPayload {
  type: 'pong';
}

type IncomingPayload = NewMessagesPayload | AttachmentPayload | HistoryResponsePayload | PongPayload;

// Outgoing message types
interface SendMessagePayload {
  type: 'send_message';
  handle_id: string;
  text: string;
}

interface PingPayload {
  type: 'ping';
}

interface RequestHistoryPayload {
  type: 'request_history';
  since_rowid?: number; // Get messages after this rowid (ascending)
  before_rowid?: number; // Get messages before this rowid (descending)
  limit?: number;
}

type OutgoingPayload = SendMessagePayload | PingPayload | RequestHistoryPayload;

// Connection state
let helperConnection: WebSocket | null = null;
let lastPongTime: number = 0;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let currentClientId: string | null = null;

// Callbacks for connection events
type ConnectionCallback = () => void;
let onConnectedCallback: ConnectionCallback | null = null;
let onDisconnectedCallback: ConnectionCallback | null = null;

/**
 * Check if the helper is connected
 */
export function isHelperConnected(): boolean {
  return helperConnection !== null && helperConnection.readyState === 1; // WebSocket.OPEN
}

/**
 * Get the helper connection (or null if not connected)
 */
export function getHelperConnection(): WebSocket | null {
  return helperConnection;
}

/**
 * Set callback for when helper connects
 */
export function onHelperConnected(callback: ConnectionCallback): void {
  onConnectedCallback = callback;
}

/**
 * Set callback for when helper disconnects
 */
export function onHelperDisconnected(callback: ConnectionCallback): void {
  onDisconnectedCallback = callback;
}

/**
 * Send a message to the helper
 */
export function sendToHelper(payload: OutgoingPayload): boolean {
  if (!isHelperConnected()) {
    console.warn('[MessageSync] Cannot send message: helper not connected');
    return false;
  }

  try {
    helperConnection!.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('[MessageSync] Failed to send message:', error);
    return false;
  }
}

/**
 * Request message to be sent via the helper
 */
export function requestSendMessage(handleId: string, text: string): boolean {
  return sendToHelper({
    type: 'send_message',
    handle_id: handleId,
    text: text,
  });
}

/**
 * Request message history from the helper (messages after a rowid, ascending)
 */
export async function requestHistorySince(sinceRowid: number, limit = 500): Promise<boolean> {
  console.log(`[MessageSync] Requesting history since rowid ${sinceRowid}, limit ${limit}`);

  return sendToHelper({
    type: 'request_history',
    since_rowid: sinceRowid,
    limit: limit,
  });
}

/**
 * Request message history before a rowid (descending, for reverse chronological loading)
 */
export function requestHistoryBefore(beforeRowid: number, limit = 500): boolean {
  console.log(`[MessageSync] Requesting history before rowid ${beforeRowid}, limit ${limit}`);

  return sendToHelper({
    type: 'request_history',
    before_rowid: beforeRowid,
    limit: limit,
  });
}

/**
 * Request the latest messages (starts reverse chronological sync)
 */
export function requestLatestHistory(limit = 500): boolean {
  console.log(`[MessageSync] Requesting latest ${limit} messages`);

  return sendToHelper({
    type: 'request_history',
    // No since_rowid or before_rowid means "start from latest"
    limit: limit,
  });
}

/**
 * Handle an incoming message from the helper
 */
async function handleIncomingMessage(data: IncomingPayload): Promise<void> {
  // Extract and validate client_id from messages that include it
  if ('client_id' in data && data.client_id) {
    if (!currentClientId) {
      currentClientId = data.client_id;
      console.log(`[MessageSync] Client connected: ${currentClientId}`);
    } else if (currentClientId !== data.client_id) {
      console.warn(
        `[MessageSync] Client ID mismatch: expected ${currentClientId}, got ${data.client_id}`,
      );
    }
  } else if (data.type === 'new_messages' || data.type === 'history_response') {
    // These message types MUST have client_id
    console.error(`[MessageSync] Rejected ${data.type}: missing client_id`);
    throw new Error('client_id is required');
  }

  switch (data.type) {
    case 'new_messages':
      await handleNewMessages(data);
      break;

    case 'attachment':
      await handleAttachment(data);
      break;

    case 'history_response':
      await handleHistoryResponse(data);
      break;

    case 'pong':
      lastPongTime = Date.now();
      break;

    default:
      console.warn('[MessageSync] Unknown message type:', (data as { type: string }).type);
  }
}

async function handleNewMessages(data: NewMessagesPayload): Promise<void> {
  const count = await storeMessages(data.messages, data.client_id);

  // Log message details for debugging
  if (data.messages.length > 0) {
    const minDate = new Date(Math.min(...data.messages.map((m) => new Date(m.date).getTime())));
    const maxDate = new Date(Math.max(...data.messages.map((m) => new Date(m.date).getTime())));
    const minRowid = Math.min(...data.messages.map((m) => m.rowid));
    const maxRowid = Math.max(...data.messages.map((m) => m.rowid));

    console.log(
      `[MessageSync:${data.client_id}] Stored ${count} new messages ` +
      `(rowid ${minRowid}-${maxRowid}, dates ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]})`
    );

    // Log a few sample messages
    const samples = data.messages.slice(0, 3);
    samples.forEach((msg) => {
      const textPreview = msg.text ? msg.text.substring(0, 50).replace(/\n/g, ' ') : '<no text>';
      const direction = msg.is_from_me ? 'sent to' : 'from';
      console.log(
        `[MessageSync:${data.client_id}]   - ${direction} ${msg.handle_id}: "${textPreview}" (${new Date(msg.date).toISOString()})`
      );
    });
  } else {
    console.log(`[MessageSync:${data.client_id}] Stored ${count} new messages`);
  }

  // Update sync cursor to highest rowid for this client
  if (data.messages.length > 0) {
    const maxRowid = Math.max(...data.messages.map((m) => m.rowid));
    const currentCursor = await getSyncCursor(data.client_id);
    if (maxRowid > currentCursor) {
      await updateSyncCursor(data.client_id, maxRowid);
    }
  }
}

async function handleAttachment(data: AttachmentPayload): Promise<void> {
  if (data.error) {
    console.warn(
      `[MessageSync] Attachment ${data.attachment.guid} unavailable: ${data.error} ` +
        `(${data.attachment.transfer_name || data.attachment.filename || 'unknown'})`,
    );
    // Store the error in the database
    try {
      await storeAttachmentError(data.attachment.guid, data.error);
    } catch (err) {
      console.error(`[MessageSync] Failed to store attachment error:`, err);
    }
    return;
  }

  if (data.data) {
    try {
      const dataSize = data.data.length;
      console.log(
        `[MessageSync] Receiving attachment ${data.attachment.guid} (${dataSize} base64 chars, ~${Math.round((dataSize * 0.75) / 1024)}KB)`,
      );
      await storeAttachmentData(data.attachment.guid, data.data, data.attachment.mime_type);
      console.log(`[MessageSync] Stored attachment ${data.attachment.guid}`);
    } catch (error) {
      console.error(`[MessageSync] Failed to store attachment ${data.attachment.guid}:`, error);
    }
  } else {
    console.log(`[MessageSync] Received attachment metadata only (no data): ${data.attachment.guid}`);
  }
}

// History sync state
let historySyncInProgress = false;
let historyBatchesLoaded = 0;
const MAX_HISTORY_BATCHES = 20; // Maximum batches to load (20 * 500 = 10,000 messages max)
const BATCH_SIZE = 500;

// Callback for when history sync completes
type HistorySyncCompleteCallback = () => void;
let onHistorySyncCompleteCallback: HistorySyncCompleteCallback | null = null;

export function onHistorySyncComplete(callback: HistorySyncCompleteCallback): void {
  onHistorySyncCompleteCallback = callback;
}

export function isHistorySyncInProgress(): boolean {
  return historySyncInProgress;
}

// Track sync mode: 'new' for fetching newer messages, 'old' for backfilling older
let syncMode: 'new' | 'old' = 'new';

export async function startHistorySync(): Promise<void> {
  if (historySyncInProgress) {
    console.log('[MessageSync] History sync already in progress');
    return;
  }

  if (!currentClientId) {
    console.warn('[MessageSync] Cannot start history sync: no client connected');
    return;
  }

  const [messageCount, maxRowid, minRowid] = await Promise.all([
    getStoredMessageCount(currentClientId),
    getMaxStoredRowid(currentClientId),
    getMinStoredRowid(currentClientId),
  ]);

  console.log(`[MessageSync:${currentClientId}] Current state: ${messageCount} messages stored, rowid range ${minRowid}-${maxRowid}`);

  if (messageCount === 0) {
    // No messages stored for this client, start from latest and work backwards
    historySyncInProgress = true;
    historyBatchesLoaded = 0;
    syncMode = 'old';
    console.log(`[MessageSync:${currentClientId}] No messages stored, starting fresh sync from latest`);
    requestLatestHistory(BATCH_SIZE);
  } else {
    // We have messages - first get any new messages since our max rowid
    historySyncInProgress = true;
    historyBatchesLoaded = 0;
    syncMode = 'new';
    console.log(`[MessageSync:${currentClientId}] Requesting new messages since rowid ${maxRowid}`);
    requestHistorySince(maxRowid, BATCH_SIZE);
  }
}

async function handleHistoryResponse(data: HistoryResponsePayload): Promise<void> {
  const messageCount = data.messages.length;
  const direction = data.before_rowid ? 'before' : data.since_rowid ? 'since' : 'latest';
  const rowid = data.before_rowid || data.since_rowid || 'latest';

  // Log rowid range and date range if we have messages
  if (messageCount > 0) {
    const minRowid = Math.min(...data.messages.map((m) => m.rowid));
    const maxRowid = Math.max(...data.messages.map((m) => m.rowid));
    const minDate = new Date(Math.min(...data.messages.map((m) => new Date(m.date).getTime())));
    const maxDate = new Date(Math.max(...data.messages.map((m) => new Date(m.date).getTime())));

    console.log(
      `[MessageSync:${data.client_id}] Received ${messageCount} messages (${direction} rowid ${rowid}, ` +
      `range ${minRowid}-${maxRowid}, dates ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]})`
    );

    // Log a few sample messages
    const samples = data.messages.slice(0, 2);
    samples.forEach((msg) => {
      const textPreview = msg.text ? msg.text.substring(0, 50).replace(/\n/g, ' ') : '<no text>';
      const direction = msg.is_from_me ? 'sent to' : 'from';
      console.log(
        `[MessageSync:${data.client_id}]   - ${direction} ${msg.handle_id}: "${textPreview}" (${new Date(msg.date).toISOString()})`
      );
    });
  } else {
    console.log(`[MessageSync:${data.client_id}] Received 0 messages (${direction} rowid ${rowid})`);
  }

  const count = await storeMessages(data.messages, data.client_id);
  console.log(`[MessageSync:${data.client_id}] Stored ${count} messages (mode: ${syncMode})`);

  // Update sync cursor to highest rowid we've seen for this client
  if (data.messages.length > 0) {
    const maxRowid = Math.max(...data.messages.map((m) => m.rowid));
    const currentCursor = await getSyncCursor(data.client_id);
    if (maxRowid > currentCursor) {
      await updateSyncCursor(data.client_id, maxRowid);
    }
  }

  // If we're doing a history sync, continue loading more
  if (historySyncInProgress) {
    historyBatchesLoaded++;

    const hasMore = data.has_more !== false && messageCount === BATCH_SIZE;

    if (syncMode === 'new') {
      // We were fetching new messages (since our max rowid)
      if (hasMore && data.messages.length > 0) {
        // More new messages to fetch
        const batchMaxRowid = Math.max(...data.messages.map((m) => m.rowid));
        console.log(
          `[MessageSync:${data.client_id}] Batch ${historyBatchesLoaded} complete, requesting more new messages since rowid ${batchMaxRowid}`,
        );
        setTimeout(() => {
          requestHistorySince(batchMaxRowid, BATCH_SIZE);
        }, 100);
      } else {
        // Done fetching new messages, now backfill older ones
        console.log(`[MessageSync:${data.client_id}] Finished fetching new messages, switching to backfill mode`);
        syncMode = 'old';
        historyBatchesLoaded = 0;

        // Get our current min rowid to backfill before it
        if (!currentClientId) {
          historySyncInProgress = false;
          console.error('[MessageSync] Cannot start backfill: no client ID');
          return;
        }
        const currentMinRowid = await getMinStoredRowid(currentClientId);
        if (currentMinRowid > 0) {
          console.log(`[MessageSync:${currentClientId}] Starting backfill before rowid ${currentMinRowid}`);
          setTimeout(() => {
            requestHistoryBefore(currentMinRowid, BATCH_SIZE);
          }, 100);
        } else {
          // No messages to backfill from
          historySyncInProgress = false;
          console.log(`[MessageSync:${currentClientId}] History sync complete (no backfill needed)`);
          if (onHistorySyncCompleteCallback) {
            onHistorySyncCompleteCallback();
          }
        }
      }
    } else {
      // syncMode === 'old' - we're backfilling older messages
      const shouldContinue = hasMore && historyBatchesLoaded < MAX_HISTORY_BATCHES;

      if (shouldContinue && data.messages.length > 0) {
        const batchMinRowid = Math.min(...data.messages.map((m) => m.rowid));
        console.log(
          `[MessageSync:${data.client_id}] Backfill batch ${historyBatchesLoaded}/${MAX_HISTORY_BATCHES} complete, requesting before rowid ${batchMinRowid}`,
        );
        setTimeout(() => {
          requestHistoryBefore(batchMinRowid, BATCH_SIZE);
        }, 100);
      } else {
        // Sync complete
        historySyncInProgress = false;
        const reason = !hasMore ? 'no more messages' : 'reached batch limit';
        console.log(`[MessageSync:${data.client_id}] History sync complete (${reason}). Loaded ${historyBatchesLoaded} backfill batches`);
        if (onHistorySyncCompleteCallback) {
          onHistorySyncCompleteCallback();
        }
      }
    }
  }
}

/**
 * Start ping interval to check connection health
 */
function startPingInterval(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
  }

  lastPongTime = Date.now();

  pingInterval = setInterval(() => {
    if (!isHelperConnected()) {
      return;
    }

    // Check if we've received a pong recently
    const timeSincePong = Date.now() - lastPongTime;
    if (timeSincePong > 60000) {
      // 60 seconds
      console.warn('[MessageSync] Helper connection appears stale, closing');
      helperConnection?.close();
      return;
    }

    // Send ping
    sendToHelper({ type: 'ping' });
  }, 30000); // Every 30 seconds
}

function stopPingInterval(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

/**
 * Handle a new WebSocket connection from the helper
 */
export function handleConnection(ws: WebSocket): void {
  // Only allow one helper connection at a time
  if (helperConnection) {
    console.warn('[MessageSync] Closing existing helper connection');
    helperConnection.close();
    currentClientId = null;
  }

  helperConnection = ws;
  console.log('[MessageSync] Helper connected');

  startPingInterval();

  if (onConnectedCallback) {
    onConnectedCallback();
  }

  // Note: Don't start history sync here - wait until we receive a message with client_id
  // History sync will be triggered in handleIncomingMessage after we know the client_id

  ws.on('message', async (rawData) => {
    try {
      const data = JSON.parse(rawData.toString()) as IncomingPayload;
      const hadClientId = currentClientId !== null;
      await handleIncomingMessage(data);

      // Start history sync after first message with client_id
      if (!hadClientId && currentClientId && !historySyncInProgress) {
        await startHistorySync();
      }
    } catch (error) {
      console.error('[MessageSync] Failed to process message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`[MessageSync] Helper disconnected (client: ${currentClientId || 'unknown'})`);
    helperConnection = null;
    currentClientId = null;
    stopPingInterval();

    if (onDisconnectedCallback) {
      onDisconnectedCallback();
    }
  });

  ws.on('error', (error) => {
    console.error('[MessageSync] WebSocket error:', error);
  });
}
