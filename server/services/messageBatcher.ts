import { LegacyMessage as Message, getMessagesByPhoneNumber } from './messageStorage';
import { generateMessageHash } from '../utils/messageHash';
import { prisma } from '../db';
import { config } from '../config';

export interface MessageWithHash extends Message {
  hash: string;
}

export interface MessageBatch {
  messages: MessageWithHash[];
  snippet: string;
  hashes: string[];
}

/**
 * Get messages for a contact that haven't been processed yet.
 * Returns messages with their hashes attached.
 */
export async function getUnprocessedMessages(
  phoneNumber: string,
  limit: number = config.messageAnalysis.messageHistoryLimit,
): Promise<MessageWithHash[]> {
  // Get messages from message storage
  const messages = await getMessagesByPhoneNumber(phoneNumber, limit);

  // Filter out messages with no text content (e.g., image-only messages)
  const textMessages = messages.filter((msg) => msg.message && msg.message.trim().length > 0);

  // Add hashes to messages
  const messagesWithHashes: MessageWithHash[] = textMessages.map((msg) => ({
    ...msg,
    hash: generateMessageHash(phoneNumber, msg.isFromMe, msg.date, msg.message),
  }));

  // Get already processed message hashes
  const existingHashes = await prisma.processedMessage.findMany({
    where: {
      messageHash: {
        in: messagesWithHashes.map((m) => m.hash),
      },
    },
    select: { messageHash: true },
  });

  const processedHashSet = new Set(existingHashes.map((h) => h.messageHash));

  // Filter out already processed messages
  return messagesWithHashes.filter((msg) => !processedHashSet.has(msg.hash));
}

/**
 * Create batches of messages up to a character limit.
 * Preserves conversation context by not splitting mid-exchange when possible.
 */
export function createBatches(
  messages: MessageWithHash[],
  maxChars: number = config.messageAnalysis.batchMaxChars,
): MessageBatch[] {
  if (messages.length === 0) {
    return [];
  }

  // Sort messages by date (oldest first for chronological order)
  const sortedMessages = [...messages].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const batches: MessageBatch[] = [];
  let currentBatch: MessageWithHash[] = [];
  let currentLength = 0;

  for (const msg of sortedMessages) {
    const msgLength = msg.message.length;

    // If adding this message would exceed the limit and we have messages already
    if (currentLength + msgLength > maxChars && currentBatch.length > 0) {
      // Try to find a good break point (after an incoming message)
      // to avoid splitting mid-exchange
      let breakIndex = currentBatch.length;

      // Look for the last incoming message to break after
      for (let i = currentBatch.length - 1; i >= 0; i--) {
        if (!currentBatch[i].isFromMe) {
          breakIndex = i + 1;
          break;
        }
      }

      // If we found a good break point before the end, use it
      if (breakIndex < currentBatch.length && breakIndex > 0) {
        const batchMessages = currentBatch.slice(0, breakIndex);
        batches.push(createBatchObject(batchMessages));

        // Keep remaining messages for next batch
        currentBatch = currentBatch.slice(breakIndex);
        currentLength = currentBatch.reduce((sum, m) => sum + m.message.length, 0);
      } else {
        // No good break point, just create batch with current messages
        batches.push(createBatchObject(currentBatch));
        currentBatch = [];
        currentLength = 0;
      }
    }

    currentBatch.push(msg);
    currentLength += msgLength;
  }

  // Don't forget the last batch
  if (currentBatch.length > 0) {
    batches.push(createBatchObject(currentBatch));
  }

  return batches;
}

/**
 * Format messages as a readable conversation snippet.
 */
export function formatConversationSnippet(messages: MessageWithHash[], contactName: string): string {
  return messages
    .map((msg) => {
      const sender = msg.isFromMe ? 'Me' : contactName;
      const timestamp = formatTimestamp(msg.date);
      return `[${timestamp}] ${sender}: ${msg.message}`;
    })
    .join('\n');
}

/**
 * Helper to create a batch object from messages.
 */
function createBatchObject(messages: MessageWithHash[]): MessageBatch {
  return {
    messages,
    snippet: '', // Will be filled in later with contact name
    hashes: messages.map((m) => m.hash),
  };
}

/**
 * Format a timestamp for display in conversation snippets.
 */
function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get unprocessed messages for a contact and create batches ready for processing.
 * This is the main entry point for the batching service.
 */
export async function getBatchesForContact(phoneNumber: string, contactName: string): Promise<MessageBatch[]> {
  const unprocessedMessages = await getUnprocessedMessages(phoneNumber);

  if (unprocessedMessages.length === 0) {
    return [];
  }

  const batches = createBatches(unprocessedMessages);

  // Fill in the conversation snippets with the contact name
  for (const batch of batches) {
    batch.snippet = formatConversationSnippet(batch.messages, contactName);
  }

  return batches;
}
