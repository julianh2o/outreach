import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

const ATTACHMENTS_DIR = path.join(process.cwd(), 'data', 'attachments');

// GET /api/attachments/:filename - Serve an attachment file
router.get('/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;

  // Sanitize filename to prevent directory traversal
  const sanitizedFilename = path.basename(filename);
  const filePath = path.join(ATTACHMENTS_DIR, sanitizedFilename);

  // Check file exists
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  // Determine content type from extension
  const ext = path.extname(sanitizedFilename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/m4a',
    '.aac': 'audio/aac',
    '.pdf': 'application/pdf',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

export default router;
