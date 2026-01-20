import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import {
  enqueueContact,
  getQueueStats,
  getContactAnalysisStatus,
  requeueFailedBatches,
  resetContactAnalysis,
  requeueBatch,
} from '../services/processingQueue';

const router = Router();

interface SuggestedChanges {
  fieldSuggestions: Array<{
    fieldId: string;
    fieldName: string;
    suggestedValue: string;
    confidence: number;
    reasoning: string;
  }>;
  tagSuggestions: Array<{
    tagName: string;
    confidence: number;
    reasoning: string;
  }>;
}

/**
 * GET /api/contacts/:contactId/suggested-updates
 * Get pending suggested updates for a contact
 */
router.get('/contacts/:contactId/suggested-updates', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    const suggestedUpdates = await prisma.suggestedUpdate.findMany({
      where: {
        contactId,
        status: 'PENDING',
        hasNotableUpdates: true,
      },
      include: {
        batch: {
          select: {
            conversationSnippet: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Parse JSON fields for response
    const parsed = suggestedUpdates.map((update) => ({
      id: update.id,
      contactId: update.contactId,
      suggestedChanges: JSON.parse(update.suggestedChanges) as SuggestedChanges,
      hasNotableUpdates: update.hasNotableUpdates,
      status: update.status,
      conversationSnippet: update.batch.conversationSnippet,
      createdAt: update.createdAt,
    }));

    res.json(parsed);
  } catch (error) {
    console.error('Error fetching suggested updates:', error);
    res.status(500).json({ error: 'Failed to fetch suggested updates' });
  }
});

/**
 * POST /api/contacts/:contactId/analyze-messages
 * Trigger message analysis for a contact
 */
router.post('/contacts/:contactId/analyze-messages', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    // Verify contact exists
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // Enqueue for processing
    const batchCount = await enqueueContact(contactId);

    res.json({
      message: batchCount > 0 ? `Enqueued ${batchCount} batch(es) for processing` : 'No new messages to process',
      batchesCreated: batchCount,
    });
  } catch (error) {
    console.error('Error triggering analysis:', error);
    res.status(500).json({ error: 'Failed to trigger analysis' });
  }
});

/**
 * POST /api/suggested-updates/:id/accept
 * Accept all suggested changes
 */
router.post('/:id/accept', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const update = await prisma.suggestedUpdate.findUnique({
      where: { id },
      include: { contact: { include: { customFields: true, tags: true } } },
    });

    if (!update) {
      res.status(404).json({ error: 'Suggested update not found' });
      return;
    }

    if (update.status !== 'PENDING') {
      res.status(400).json({ error: 'Update has already been processed' });
      return;
    }

    const changes = JSON.parse(update.suggestedChanges) as SuggestedChanges;

    // Apply field changes
    await applyFieldChanges(update.contactId, changes.fieldSuggestions);

    // Apply tag changes
    await applyTagChanges(update.contactId, changes.tagSuggestions);

    // Update status
    await prisma.suggestedUpdate.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        acceptedChanges: update.suggestedChanges, // All changes accepted
      },
    });

    res.json({ message: 'All changes accepted and applied' });
  } catch (error) {
    console.error('Error accepting update:', error);
    res.status(500).json({ error: 'Failed to accept update' });
  }
});

/**
 * POST /api/suggested-updates/:id/reject
 * Reject all suggested changes
 */
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const update = await prisma.suggestedUpdate.findUnique({
      where: { id },
    });

    if (!update) {
      res.status(404).json({ error: 'Suggested update not found' });
      return;
    }

    if (update.status !== 'PENDING') {
      res.status(400).json({ error: 'Update has already been processed' });
      return;
    }

    await prisma.suggestedUpdate.update({
      where: { id },
      data: { status: 'REJECTED' },
    });

    res.json({ message: 'Update rejected' });
  } catch (error) {
    console.error('Error rejecting update:', error);
    res.status(500).json({ error: 'Failed to reject update' });
  }
});

/**
 * POST /api/suggested-updates/:id/partial
 * Accept selected changes only
 */
router.post('/:id/partial', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { acceptedFieldIds, acceptedTagNames } = req.body as {
      acceptedFieldIds?: string[];
      acceptedTagNames?: string[];
    };

    const update = await prisma.suggestedUpdate.findUnique({
      where: { id },
    });

    if (!update) {
      res.status(404).json({ error: 'Suggested update not found' });
      return;
    }

    if (update.status !== 'PENDING') {
      res.status(400).json({ error: 'Update has already been processed' });
      return;
    }

    const changes = JSON.parse(update.suggestedChanges) as SuggestedChanges;

    // Filter to accepted changes only
    const acceptedFields = changes.fieldSuggestions.filter((f) => acceptedFieldIds?.includes(f.fieldId) ?? false);
    const acceptedTags = changes.tagSuggestions.filter((t) => acceptedTagNames?.includes(t.tagName) ?? false);

    // Apply accepted changes
    if (acceptedFields.length > 0) {
      await applyFieldChanges(update.contactId, acceptedFields);
    }

    if (acceptedTags.length > 0) {
      await applyTagChanges(update.contactId, acceptedTags);
    }

    // Update status
    await prisma.suggestedUpdate.update({
      where: { id },
      data: {
        status: 'PARTIALLY_ACCEPTED',
        acceptedChanges: JSON.stringify({
          fieldSuggestions: acceptedFields,
          tagSuggestions: acceptedTags,
        }),
      },
    });

    res.json({
      message: 'Selected changes accepted and applied',
      appliedFields: acceptedFields.length,
      appliedTags: acceptedTags.length,
    });
  } catch (error) {
    console.error('Error partially accepting update:', error);
    res.status(500).json({ error: 'Failed to partially accept update' });
  }
});

/**
 * GET /api/suggested-updates/queue-stats
 * Get processing queue statistics
 */
router.get('/queue-stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({ error: 'Failed to fetch queue stats' });
  }
});

/**
 * GET /api/contacts/:contactId/queue-position
 * Get the queue position for a specific contact's batches
 */
router.get('/contacts/:contactId/queue-position', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    // Get contact's pending and processing batches
    const contactBatches = await prisma.messageProcessingBatch.findMany({
      where: {
        contactId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (contactBatches.length === 0) {
      res.json({
        hasQueuedBatches: false,
        position: null,
        totalInQueue: 0,
        contactBatchCount: 0,
        processingCount: 0,
      });
      return;
    }

    // Get earliest batch for this contact
    const earliestBatch = contactBatches[0];

    // Count how many batches are ahead of this contact's earliest batch
    const batchesAhead = await prisma.messageProcessingBatch.count({
      where: {
        status: 'PENDING',
        createdAt: { lt: earliestBatch.createdAt },
      },
    });

    // Count total pending batches
    const totalPending = await prisma.messageProcessingBatch.count({
      where: { status: 'PENDING' },
    });

    // Count processing batches for this contact
    const processingCount = contactBatches.filter((b) => b.status === 'PROCESSING').length;

    res.json({
      hasQueuedBatches: true,
      position: batchesAhead + 1, // 1-indexed position
      totalInQueue: totalPending,
      contactBatchCount: contactBatches.length,
      processingCount,
    });
  } catch (error) {
    console.error('Error fetching queue position:', error);
    res.status(500).json({ error: 'Failed to fetch queue position' });
  }
});

/**
 * GET /api/contacts/:contactId/analysis-status
 * Get detailed analysis status for a contact
 */
router.get('/contacts/:contactId/analysis-status', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    // Verify contact exists
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    const status = await getContactAnalysisStatus(contactId);
    res.json(status);
  } catch (error) {
    console.error('Error fetching analysis status:', error);
    res.status(500).json({ error: 'Failed to fetch analysis status' });
  }
});

/**
 * POST /api/contacts/:contactId/requeue-failed
 * Requeue failed batches for reprocessing
 */
router.post('/contacts/:contactId/requeue-failed', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    // Verify contact exists
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    const requeuedCount = await requeueFailedBatches(contactId);

    res.json({
      message: requeuedCount > 0 ? `Requeued ${requeuedCount} failed batch(es)` : 'No failed batches to requeue',
      requeuedCount,
    });
  } catch (error) {
    console.error('Error requeuing failed batches:', error);
    res.status(500).json({ error: 'Failed to requeue batches' });
  }
});

/**
 * POST /api/contacts/:contactId/reset-and-analyze
 * Clear all analysis data and trigger fresh analysis
 */
router.post('/contacts/:contactId/reset-and-analyze', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    // Verify contact exists
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // Reset all analysis data
    const resetResult = await resetContactAnalysis(contactId);

    // Trigger new analysis
    const batchCount = await enqueueContact(contactId);

    res.json({
      message: `Reset complete. Created ${batchCount} new batch(es) for processing.`,
      reset: resetResult,
      batchesCreated: batchCount,
    });
  } catch (error) {
    console.error('Error resetting and analyzing:', error);
    res.status(500).json({ error: 'Failed to reset and analyze' });
  }
});

/**
 * GET /api/suggested-updates/admin/recent-batches
 * Get recently processed batches for admin inspection
 */
router.get('/admin/recent-batches', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string | undefined;

    const where = status ? { status: status as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' } : {};

    const batches = await prisma.messageProcessingBatch.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        suggestedUpdates: {
          select: {
            id: true,
            hasNotableUpdates: true,
            status: true,
            suggestedChanges: true,
          },
        },
        _count: {
          select: {
            processedMessages: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    const formatted = batches.map((batch) => ({
      id: batch.id,
      contactId: batch.contactId,
      contactName: `${batch.contact.firstName} ${batch.contact.lastName || ''}`.trim(),
      status: batch.status,
      messageCount: batch._count.processedMessages,
      snippetPreview:
        batch.conversationSnippet.substring(0, 200) + (batch.conversationSnippet.length > 200 ? '...' : ''),
      suggestedUpdates: batch.suggestedUpdates.map((su) => ({
        id: su.id,
        hasNotableUpdates: su.hasNotableUpdates,
        status: su.status,
        changeCount: (() => {
          try {
            const changes = JSON.parse(su.suggestedChanges) as {
              fieldSuggestions?: unknown[];
              tagSuggestions?: unknown[];
            };
            return (changes.fieldSuggestions?.length || 0) + (changes.tagSuggestions?.length || 0);
          } catch {
            return 0;
          }
        })(),
      })),
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching recent batches:', error);
    res.status(500).json({ error: 'Failed to fetch recent batches' });
  }
});

/**
 * GET /api/suggested-updates/admin/summary
 * Get overall summary statistics for admin dashboard
 * NOTE: This route must be defined before /admin/batch/:id to avoid :id matching "summary"
 */
router.get('/admin/summary', async (_req: Request, res: Response) => {
  try {
    const [queueStats, recentActivity, pendingSuggestions] = await Promise.all([
      getQueueStats(),
      prisma.messageProcessingBatch.findMany({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        select: { status: true },
      }),
      prisma.suggestedUpdate.count({
        where: { status: 'PENDING', hasNotableUpdates: true },
      }),
    ]);

    const last24Hours = {
      completed: recentActivity.filter((b) => b.status === 'COMPLETED').length,
      failed: recentActivity.filter((b) => b.status === 'FAILED').length,
      total: recentActivity.length,
    };

    res.json({
      queue: queueStats,
      last24Hours,
      pendingSuggestions,
    });
  } catch (error) {
    console.error('Error fetching admin summary:', error);
    res.status(500).json({ error: 'Failed to fetch admin summary' });
  }
});

/**
 * GET /api/suggested-updates/admin/batch/:id
 * Get detailed information about a specific batch
 */
router.get('/admin/batch/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const batch = await prisma.messageProcessingBatch.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        suggestedUpdates: true,
        processedMessages: {
          select: {
            messageHash: true,
            createdAt: true,
          },
        },
      },
    });

    if (!batch) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    res.json({
      id: batch.id,
      contactId: batch.contactId,
      contactName: `${batch.contact.firstName} ${batch.contact.lastName || ''}`.trim(),
      status: batch.status,
      conversationSnippet: batch.conversationSnippet,
      messageHashes: JSON.parse(batch.messageHashes),
      processedMessages: batch.processedMessages,
      suggestedUpdates: batch.suggestedUpdates.map((su) => ({
        ...su,
        suggestedChanges: JSON.parse(su.suggestedChanges),
      })),
      llmPrompt: batch.llmPrompt,
      llmResponse: batch.llmResponse,
      errorMessage: batch.errorMessage,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching batch details:', error);
    res.status(500).json({ error: 'Failed to fetch batch details' });
  }
});

/**
 * POST /api/suggested-updates/admin/purge-all
 * Delete all batches, processed messages, and suggested updates (for testing)
 */
router.post('/admin/purge-all', async (_req: Request, res: Response) => {
  try {
    // Delete in correct order to respect foreign key constraints
    const deletedMessages = await prisma.processedMessage.deleteMany({});
    const deletedUpdates = await prisma.suggestedUpdate.deleteMany({});
    const deletedBatches = await prisma.messageProcessingBatch.deleteMany({});

    res.json({
      message: 'All analysis data purged',
      deletedBatches: deletedBatches.count,
      deletedMessages: deletedMessages.count,
      deletedUpdates: deletedUpdates.count,
    });
  } catch (error) {
    console.error('Error purging all batches:', error);
    res.status(500).json({ error: 'Failed to purge all batches' });
  }
});

/**
 * POST /api/suggested-updates/admin/batch/:id/reprocess
 * Requeue a specific batch for reprocessing
 */
router.post('/admin/batch/:id/reprocess', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const success = await requeueBatch(id);

    if (!success) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    res.json({ message: 'Batch requeued for processing' });
  } catch (error) {
    console.error('Error reprocessing batch:', error);
    res.status(500).json({ error: 'Failed to reprocess batch' });
  }
});

/**
 * POST /api/contacts/:contactId/reset-analysis
 * Clear processed message history for a contact to allow re-analysis
 */
router.post('/contacts/:contactId/reset-analysis', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    // Verify contact exists
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // Delete all processed messages for batches belonging to this contact
    const batches = await prisma.messageProcessingBatch.findMany({
      where: { contactId },
      select: { id: true },
    });

    const batchIds = batches.map((b) => b.id);

    // Delete processed messages
    const deletedMessages = await prisma.processedMessage.deleteMany({
      where: { batchId: { in: batchIds } },
    });

    // Delete suggested updates
    const deletedUpdates = await prisma.suggestedUpdate.deleteMany({
      where: { contactId },
    });

    // Delete batches
    const deletedBatches = await prisma.messageProcessingBatch.deleteMany({
      where: { contactId },
    });

    res.json({
      message: 'Analysis history cleared. You can now re-analyze messages.',
      deletedBatches: deletedBatches.count,
      deletedMessages: deletedMessages.count,
      deletedUpdates: deletedUpdates.count,
    });
  } catch (error) {
    console.error('Error resetting analysis:', error);
    res.status(500).json({ error: 'Failed to reset analysis' });
  }
});

/**
 * Apply field changes to a contact
 */
async function applyFieldChanges(
  contactId: string,
  fieldSuggestions: SuggestedChanges['fieldSuggestions'],
): Promise<void> {
  for (const suggestion of fieldSuggestions) {
    if (suggestion.fieldId === 'birthday') {
      // Update contact birthday directly
      await prisma.contact.update({
        where: { id: contactId },
        data: { birthday: new Date(suggestion.suggestedValue) },
      });
    } else if (suggestion.fieldId === 'notes') {
      // Append to notes (don't overwrite)
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { notes: true },
      });
      const existingNotes = contact?.notes || '';
      const newNotes = existingNotes
        ? `${existingNotes}\n\n[Auto-suggested ${new Date().toLocaleDateString()}]\n${suggestion.suggestedValue}`
        : suggestion.suggestedValue;

      await prisma.contact.update({
        where: { id: contactId },
        data: { notes: newNotes },
      });
    } else {
      // Custom field - upsert
      await prisma.customFieldValue.upsert({
        where: {
          contactId_fieldId: {
            contactId,
            fieldId: suggestion.fieldId,
          },
        },
        update: { value: suggestion.suggestedValue },
        create: {
          contactId,
          fieldId: suggestion.fieldId,
          value: suggestion.suggestedValue,
        },
      });
    }
  }
}

/**
 * Apply tag changes to a contact
 */
async function applyTagChanges(contactId: string, tagSuggestions: SuggestedChanges['tagSuggestions']): Promise<void> {
  for (const suggestion of tagSuggestions) {
    // Find or create tag
    let tag = await prisma.tag.findUnique({
      where: { name: suggestion.tagName },
    });

    if (!tag) {
      tag = await prisma.tag.create({
        data: { name: suggestion.tagName },
      });
    }

    // Add tag to contact if not already present
    await prisma.tagOnContact.upsert({
      where: {
        contactId_tagId: {
          contactId,
          tagId: tag.id,
        },
      },
      update: {},
      create: {
        contactId,
        tagId: tag.id,
      },
    });
  }
}

export default router;
