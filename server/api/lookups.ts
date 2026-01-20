import { Router, Request, Response } from 'express';
import { prisma } from '../db';

const router = Router();

// GET /api/lookups/channel-types - Get all channel types
router.get('/channel-types', async (_req: Request, res: Response) => {
  try {
    const channelTypes = await prisma.channelType.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    res.json(channelTypes);
  } catch (error) {
    console.error('Error fetching channel types:', error);
    res.status(500).json({ error: 'Failed to fetch channel types' });
  }
});

// GET /api/lookups/custom-fields - Get all custom field definitions
router.get('/custom-fields', async (_req: Request, res: Response) => {
  try {
    const customFields = await prisma.customFieldDefinition.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    res.json(customFields);
  } catch (error) {
    console.error('Error fetching custom fields:', error);
    res.status(500).json({ error: 'Failed to fetch custom fields' });
  }
});

// GET /api/lookups/tags - Get all tags
router.get('/tags', async (_req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// POST /api/lookups/tags - Create new tag
router.post('/tags', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const tag = await prisma.tag.create({
      data: { name },
    });
    res.status(201).json(tag);
  } catch (error) {
    console.error('Error creating tag:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

export default router;
