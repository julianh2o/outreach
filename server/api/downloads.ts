import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getBuildPath } from '../utils/paths';

const router = Router();

// GET /api/downloads/sync-helper - Download the Outreach Sync Helper app
router.get('/sync-helper', (req: Request, res: Response) => {
  const zipPath = path.join(getBuildPath(), 'Outreach Sync Helper.zip');

  if (!fs.existsSync(zipPath)) {
    res.status(404).json({
      error: 'Sync helper not available',
      message: 'The sync helper has not been built yet. Run yarn build:sync-helper first.',
    });
    return;
  }

  res.download(zipPath, 'Outreach Sync Helper.zip');
});

export default router;
