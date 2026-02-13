import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import {
  getMessagesByHandle,
  purgeAllMessages,
  getFailedAttachments,
  getFailedAttachmentsSummary,
  MessageResponse,
} from '../services/messageStorage';
import { requestSendMessage, isHelperConnected } from '../websocket';

const router = Router();

// Response type for paginated messages
interface PaginatedMessagesResponse {
  messages: MessageResponse[];
  total: number;
  limit: number;
  offset: number;
}

// GET /api/messages - Get messages with optional filtering
router.get('/', async (req: Request, res: Response) => {
  try {
    const contactId = req.query.contactId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Build where clause
    let handleIds: string[] | undefined;

    // If contactId is provided, get the contact's phone channels
    if (contactId) {
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        include: {
          channels: {
            where: { type: 'phone' },
          },
        },
      });

      if (!contact) {
        res.status(404).json({ error: 'Contact not found' });
        return;
      }

      handleIds = contact.channels.map((ch) => ch.identifier);

      if (handleIds.length === 0) {
        // Contact has no phone channels, return empty result
        res.json({
          messages: [],
          total: 0,
          limit,
          offset,
        } as PaginatedMessagesResponse);
        return;
      }
    }

    // Query messages with filtering and pagination
    const whereClause = handleIds ? { handleId: { in: handleIds } } : {};

    const [messages, total] = await Promise.all([
      prisma.storedMessage.findMany({
        where: whereClause,
        orderBy: { date: 'desc' },
        skip: offset,
        take: limit,
        include: {
          attachments: true,
        },
      }),
      prisma.storedMessage.count({ where: whereClause }),
    ]);

    // Transform to response format
    const messageResponses: MessageResponse[] = messages.map((msg) => ({
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
        isImage: att.mimeType?.startsWith('image/') || false,
        url: att.localPath ? `/api/attachments/${encodeURIComponent(att.localPath)}` : null,
      })),
    }));

    res.json({
      messages: messageResponses,
      total,
      limit,
      offset,
    } as PaginatedMessagesResponse);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// GET /api/messages/attachments/failed - Get failed attachments with context
// NOTE: This must be defined before /:phoneNumber to avoid route conflicts
router.get('/attachments/failed', async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;

  try {
    const failedAttachments = await getFailedAttachments(limit);
    res.json(failedAttachments);
  } catch (error) {
    console.error('Error fetching failed attachments:', error);
    res.status(500).json({ error: 'Failed to fetch failed attachments' });
  }
});

// GET /api/messages/attachments/failed/summary - Get summary of failed attachments
router.get('/attachments/failed/summary', async (_req: Request, res: Response) => {
  try {
    const summary = await getFailedAttachmentsSummary();
    res.json(summary);
  } catch (error) {
    console.error('Error fetching failed attachments summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /api/messages/:phoneNumber - Get messages for a phone number
router.get('/:phoneNumber', async (req: Request, res: Response) => {
  const { phoneNumber } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;

  try {
    const messages = await getMessagesByHandle(phoneNumber, limit);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/messages/send - Send a message via the helper
router.post('/send', (req: Request, res: Response) => {
  const { handleId, text } = req.body;

  if (!handleId || !text) {
    res.status(400).json({ error: 'handleId and text are required' });
    return;
  }

  if (!isHelperConnected()) {
    res.status(503).json({ error: 'Message helper not connected' });
    return;
  }

  const success = requestSendMessage(handleId, text);

  if (success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/messages/purge-all - Delete all stored messages
router.post('/purge-all', async (_req: Request, res: Response) => {
  try {
    const result = await purgeAllMessages();
    res.json(result);
  } catch (error) {
    console.error('Error purging messages:', error);
    res.status(500).json({ error: 'Failed to purge messages' });
  }
});

export default router;
