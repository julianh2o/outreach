import { Router, Request, Response } from 'express';
import { sendDailyReminder } from '../discord-bot';

const router = Router();

// POST /api/discord/send-reminder - Manually trigger the daily reminder
router.post('/send-reminder', async (_req: Request, res: Response) => {
  try {
    await sendDailyReminder();
    res.json({ success: true, message: 'Reminder sent' });
  } catch (error) {
    console.error('Error sending reminder:', error);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

export default router;
