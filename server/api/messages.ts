import { Router, Request, Response } from 'express';
import {
  getMessagesByHandle,
  purgeAllMessages,
  getFailedAttachments,
  getFailedAttachmentsSummary,
} from '../services/messageStorage';
import { requestSendMessage, isHelperConnected } from '../websocket';

const router = Router();

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

// GET /api/messages/attachments/failed - Get failed attachments with context
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

export default router;
