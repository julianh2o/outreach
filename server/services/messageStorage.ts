import fs from 'fs/promises';
import path from 'path';
import { Buffer } from 'node:buffer';
import { prisma } from '../db';

// Types matching the Python helper's message format
export interface IncomingAttachment {
  rowid: number;
  guid: string;
  filename: string | null;
  mime_type: string | null;
  transfer_name: string | null;
  total_bytes: number;
  created_at: string | null;
  local_path: string | null;
}

export interface IncomingMessage {
  rowid: number;
  guid: string;
  text: string | null;
  handle_id: string;
  is_from_me: boolean;
  date: string;
  date_read: string | null;
  date_delivered: string | null;
  chat_id: number | null;
  has_attachments: boolean;
  attachments: IncomingAttachment[];
}

// Attachment type for API response
export interface AttachmentResponse {
  id: string;
  guid: string;
  filename: string | null;
  mimeType: string | null;
  transferName: string | null;
  totalBytes: number;
  localPath: string | null;
  isImage: boolean;
  url: string | null;
}

// Response type matching frontend expectations
export interface MessageResponse {
  userId: string;
  message: string;
  date: string;
  service: string;
  destinationCallerId: string;
  isFromMe: boolean;
  hasAttachments: boolean;
  attachments: AttachmentResponse[];
}

const ATTACHMENTS_DIR = path.join(process.cwd(), 'data', 'attachments');

// Ensure attachments directory exists
async function ensureAttachmentsDir(): Promise<void> {
  await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
}

function normalizePhoneNumber(phone: string): string {
  const hasPlus = phone.startsWith('+');
  const digits = phone.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

function getPhoneVariants(phone: string): string[] {
  const normalized = normalizePhoneNumber(phone);
  const variants = [normalized];
  if (!normalized.startsWith('+')) {
    variants.push(`+${normalized}`);
    variants.push(`+1${normalized}`);
  }
  return variants;
}

/**
 * Store messages from the sync helper
 * Returns the number of new messages stored
 */
export async function storeMessages(messages: IncomingMessage[]): Promise<number> {
  let storedCount = 0;

  for (const msg of messages) {
    try {
      // Upsert message (update if exists, create if not)
      await prisma.storedMessage.upsert({
        where: { guid: msg.guid },
        update: {
          text: msg.text,
          dateRead: msg.date_read ? new Date(msg.date_read) : null,
          dateDelivered: msg.date_delivered ? new Date(msg.date_delivered) : null,
        },
        create: {
          rowid: msg.rowid,
          guid: msg.guid,
          text: msg.text,
          handleId: msg.handle_id,
          isFromMe: msg.is_from_me,
          date: new Date(msg.date),
          dateRead: msg.date_read ? new Date(msg.date_read) : null,
          dateDelivered: msg.date_delivered ? new Date(msg.date_delivered) : null,
          chatId: msg.chat_id,
          hasAttachments: msg.has_attachments,
        },
      });
      storedCount++;

      // Store attachment metadata (without file data)
      for (const att of msg.attachments) {
        await prisma.storedAttachment.upsert({
          where: { guid: att.guid },
          update: {
            filename: att.filename,
            mimeType: att.mime_type,
            transferName: att.transfer_name,
            totalBytes: att.total_bytes,
          },
          create: {
            rowid: att.rowid,
            guid: att.guid,
            filename: att.filename,
            mimeType: att.mime_type,
            transferName: att.transfer_name,
            totalBytes: att.total_bytes,
            createdAt: att.created_at ? new Date(att.created_at) : null,
            messageId: (await prisma.storedMessage.findUnique({ where: { guid: msg.guid } }))!.id,
          },
        });
      }
    } catch (error) {
      console.error(`Failed to store message ${msg.guid}:`, error);
    }
  }

  return storedCount;
}

/**
 * Store attachment file data from base64
 */
export async function storeAttachmentData(
  attachmentGuid: string,
  base64Data: string,
  mimeType: string | null,
): Promise<void> {
  await ensureAttachmentsDir();

  // Determine file extension from mime type
  const ext = getExtensionFromMimeType(mimeType);
  const filename = `${attachmentGuid}${ext}`;
  const filePath = path.join(ATTACHMENTS_DIR, filename);

  // Decode and write file
  const buffer = Buffer.from(base64Data, 'base64');
  await fs.writeFile(filePath, buffer);

  // Update database with local path and clear any previous error
  await prisma.storedAttachment.update({
    where: { guid: attachmentGuid },
    data: { localPath: filename, errorReason: null, errorDetails: null },
  });
}

/**
 * Store an error for an attachment that failed to sync
 */
export async function storeAttachmentError(attachmentGuid: string, error: string): Promise<void> {
  // Parse error reason and details
  let errorReason = error;
  let errorDetails: string | null = null;

  // Handle compound errors like "file_too_large (28871571 bytes)"
  const match = error.match(/^(\w+)\s*\((.+)\)$/);
  if (match) {
    errorReason = match[1];
    errorDetails = match[2];
  } else if (error.startsWith('read_error:')) {
    errorReason = 'read_error';
    errorDetails = error.substring('read_error:'.length).trim();
  }

  await prisma.storedAttachment.update({
    where: { guid: attachmentGuid },
    data: { errorReason, errorDetails },
  });
}

// Type for failed attachment with context
export interface FailedAttachmentWithContext {
  id: string;
  guid: string;
  filename: string | null;
  transferName: string | null;
  mimeType: string | null;
  totalBytes: number;
  errorReason: string;
  errorDetails: string | null;
  message: {
    guid: string;
    handleId: string;
    date: string;
    isFromMe: boolean;
  };
  contextMessages: Array<{
    text: string | null;
    date: string;
    isFromMe: boolean;
  }>;
}

/**
 * Get failed attachments with surrounding message context
 */
export async function getFailedAttachments(limit = 50): Promise<FailedAttachmentWithContext[]> {
  const failedAttachments = await prisma.storedAttachment.findMany({
    where: {
      errorReason: { not: null },
    },
    orderBy: { message: { date: 'desc' } },
    take: limit,
    include: {
      message: true,
    },
  });

  const results: FailedAttachmentWithContext[] = [];

  for (const att of failedAttachments) {
    // Get a few messages around this one for context
    const contextMessages = await prisma.storedMessage.findMany({
      where: {
        handleId: att.message.handleId,
        date: {
          gte: new Date(att.message.date.getTime() - 5 * 60 * 1000), // 5 min before
          lte: new Date(att.message.date.getTime() + 5 * 60 * 1000), // 5 min after
        },
      },
      orderBy: { date: 'asc' },
      take: 10,
      select: {
        text: true,
        date: true,
        isFromMe: true,
      },
    });

    results.push({
      id: att.id,
      guid: att.guid,
      filename: att.filename,
      transferName: att.transferName,
      mimeType: att.mimeType,
      totalBytes: att.totalBytes,
      errorReason: att.errorReason!,
      errorDetails: att.errorDetails,
      message: {
        guid: att.message.guid,
        handleId: att.message.handleId,
        date: att.message.date.toISOString(),
        isFromMe: att.message.isFromMe,
      },
      contextMessages: contextMessages.map((m) => ({
        text: m.text,
        date: m.date.toISOString(),
        isFromMe: m.isFromMe,
      })),
    });
  }

  return results;
}

/**
 * Get summary counts of failed attachments by error reason
 */
export async function getFailedAttachmentsSummary(): Promise<{ reason: string; count: number }[]> {
  const results = await prisma.storedAttachment.groupBy({
    by: ['errorReason'],
    where: {
      errorReason: { not: null },
    },
    _count: { id: true },
  });

  return results.map((r) => ({
    reason: r.errorReason || 'unknown',
    count: r._count.id,
  }));
}

function getExtensionFromMimeType(mimeType: string | null): string {
  if (!mimeType) return '';

  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/m4a': '.m4a',
    'audio/aac': '.aac',
    'application/pdf': '.pdf',
  };

  return mimeToExt[mimeType] || '';
}

function isImageMimeType(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith('image/');
}

function getAttachmentUrl(localPath: string | null): string | null {
  if (!localPath) return null;
  return `/api/attachments/${encodeURIComponent(localPath)}`;
}

/**
 * Get messages for a phone number, formatted for frontend
 */
export async function getMessagesByHandle(handleId: string, limit = 50, before?: Date): Promise<MessageResponse[]> {
  const variants = getPhoneVariants(handleId);

  const messages = await prisma.storedMessage.findMany({
    where: {
      handleId: { in: variants },
      ...(before ? { date: { lt: before } } : {}),
    },
    orderBy: { date: 'desc' },
    take: limit,
    include: {
      attachments: true,
    },
  });

  return messages.map((msg) => ({
    userId: msg.handleId,
    message: msg.text || '',
    date: msg.date.toISOString(),
    service: 'iMessage',
    destinationCallerId: msg.handleId,
    isFromMe: msg.isFromMe,
    hasAttachments: msg.hasAttachments,
    attachments: msg.attachments.map((att) => ({
      id: att.id,
      guid: att.guid,
      filename: att.filename,
      mimeType: att.mimeType,
      transferName: att.transferName,
      totalBytes: att.totalBytes,
      localPath: att.localPath,
      isImage: isImageMimeType(att.mimeType),
      url: getAttachmentUrl(att.localPath),
    })),
  }));
}

/**
 * Get the most recent message date for a phone number
 */
export async function getLastContactedDate(handleId: string): Promise<Date | null> {
  const variants = getPhoneVariants(handleId);

  const message = await prisma.storedMessage.findFirst({
    where: { handleId: { in: variants } },
    orderBy: { date: 'desc' },
    select: { date: true },
  });

  return message?.date || null;
}

/**
 * Get last contacted dates for multiple phone numbers
 */
export async function getLastContactedDatesForHandles(handles: string[]): Promise<Map<string, Date>> {
  if (handles.length === 0) {
    return new Map();
  }

  // Build all variants
  const variantToOriginal = new Map<string, string>();
  for (const handle of handles) {
    for (const variant of getPhoneVariants(handle)) {
      variantToOriginal.set(variant, handle);
    }
  }

  const allVariants = Array.from(variantToOriginal.keys());

  // Query for most recent message per handle
  const results = await prisma.storedMessage.groupBy({
    by: ['handleId'],
    where: { handleId: { in: allVariants } },
    _max: { date: true },
  });

  // Map back to original handles
  const result = new Map<string, Date>();
  for (const row of results) {
    const originalHandle = variantToOriginal.get(row.handleId);
    if (originalHandle && row._max.date) {
      const existing = result.get(originalHandle);
      if (!existing || row._max.date > existing) {
        result.set(originalHandle, row._max.date);
      }
    }
  }

  return result;
}

/**
 * Get the current sync cursor (last synced rowid)
 */
export async function getSyncCursor(): Promise<number> {
  const state = await prisma.syncState.findUnique({
    where: { id: 'messages_sync' },
  });
  return state?.lastSyncedRowid || 0;
}

/**
 * Update the sync cursor after processing messages
 */
export async function updateSyncCursor(rowid: number): Promise<void> {
  await prisma.syncState.upsert({
    where: { id: 'messages_sync' },
    update: {
      lastSyncedRowid: rowid,
      lastSyncedAt: new Date(),
    },
    create: {
      id: 'messages_sync',
      lastSyncedRowid: rowid,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Get the highest rowid we have stored
 */
export async function getMaxStoredRowid(): Promise<number> {
  const result = await prisma.storedMessage.aggregate({
    _max: { rowid: true },
  });
  return result._max.rowid || 0;
}

// Legacy format for messageBatcher compatibility
export interface LegacyMessage {
  userId: string;
  message: string;
  date: string;
  service: string;
  destinationCallerId: string;
  isFromMe: boolean;
}

/**
 * Get messages by phone number in legacy format (for messageBatcher)
 */
export async function getMessagesByPhoneNumber(phoneNumber: string, limit = 50): Promise<LegacyMessage[]> {
  const messages = await getMessagesByHandle(phoneNumber, limit);
  return messages.map((msg) => ({
    userId: msg.userId,
    message: msg.message,
    date: msg.date,
    service: msg.service,
    destinationCallerId: msg.destinationCallerId,
    isFromMe: msg.isFromMe,
  }));
}

/**
 * Purge all stored messages and attachments
 */
export async function purgeAllMessages(): Promise<{
  message: string;
  deletedMessages: number;
  deletedAttachments: number;
  syncStateReset: boolean;
}> {
  // Delete attachments first (foreign key constraint)
  const deletedAttachments = await prisma.storedAttachment.deleteMany({});

  // Delete messages
  const deletedMessages = await prisma.storedMessage.deleteMany({});

  // Reset sync state
  await prisma.syncState.upsert({
    where: { id: 'messages_sync' },
    update: {
      lastSyncedRowid: 0,
      lastSyncedAt: null,
    },
    create: {
      id: 'messages_sync',
      lastSyncedRowid: 0,
    },
  });

  // Optionally clean up attachment files on disk
  try {
    const files = await fs.readdir(ATTACHMENTS_DIR);
    for (const file of files) {
      await fs.unlink(path.join(ATTACHMENTS_DIR, file));
    }
  } catch {
    // Directory might not exist, that's fine
  }

  return {
    message: 'All messages purged',
    deletedMessages: deletedMessages.count,
    deletedAttachments: deletedAttachments.count,
    syncStateReset: true,
  };
}
