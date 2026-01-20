import { isHelperConnected, startHistorySync, onHelperConnected, onHistorySyncComplete } from '../websocket';

const SYNC_TIMEOUT_MS = 30000; // 30 seconds to wait for helper connection

/**
 * Wait for the helper to connect with a timeout
 */
function waitForHelperConnection(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (isHelperConnected()) {
      resolve(true);
      return;
    }

    const timeout = setTimeout(() => {
      resolve(false);
    }, timeoutMs);

    onHelperConnected(() => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

/**
 * Start the reverse chronological history sync
 */
function beginHistorySync(): void {
  console.log('[MessageSyncJob] Starting reverse chronological history sync (newest first)');

  onHistorySyncComplete(() => {
    console.log('[MessageSyncJob] History sync completed');
  });

  startHistorySync();
}

/**
 * Start the message sync job
 * This requests historical messages when the helper connects, loading newest first
 */
export async function startMessageSyncJob(): Promise<void> {
  console.log('[MessageSyncJob] Waiting for helper connection...');

  const connected = await waitForHelperConnection(SYNC_TIMEOUT_MS);

  if (!connected) {
    console.log('[MessageSyncJob] Helper not connected after timeout, will sync when it connects');

    // Set up callback for when helper eventually connects
    onHelperConnected(() => {
      console.log('[MessageSyncJob] Helper connected');
      // Small delay to let the connection stabilize
      setTimeout(() => {
        beginHistorySync();
      }, 500);
    });

    return;
  }

  console.log('[MessageSyncJob] Helper connected');
  // Small delay to let the connection stabilize
  await new Promise((resolve) => setTimeout(resolve, 500));
  beginHistorySync();
}
