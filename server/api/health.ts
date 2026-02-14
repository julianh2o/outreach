import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/health - Health check endpoint
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || 'unknown',
  });
});

export default router;
