import { prisma } from '../db';
import { config } from '../config';
import { getBatchesForContact, MessageBatch } from './messageBatcher';
import { analyzeAndFilterConversation, ContactWithFields } from './messageAnalyzer';
import { BatchStatus } from '@prisma/client';

let isWorkerRunning = false;
let workerIntervalId: ReturnType<typeof setTimeout> | null = null;

/**
 * Enqueue a contact for message analysis processing.
 * Creates batches from unprocessed messages and inserts them into the queue.
 */
export async function enqueueContact(contactId: string): Promise<number> {
  // Get contact with phone channel
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      channels: true,
      customFields: true,
    },
  });

  if (!contact) {
    throw new Error(`Contact not found: ${contactId}`);
  }

  // Find phone channel
  const phoneChannel = contact.channels.find((ch) => ch.type === 'phone');
  if (!phoneChannel) {
    console.log(`Contact ${contactId} has no phone channel, skipping`);
    return 0;
  }

  const contactName = `${contact.firstName} ${contact.lastName || ''}`.trim();

  // Get batches of unprocessed messages
  const batches = await getBatchesForContact(phoneChannel.identifier, contactName);

  if (batches.length === 0) {
    console.log(`No unprocessed messages for contact ${contactId}`);
    return 0;
  }

  console.log(`Creating ${batches.length} batch(es) for contact ${contactId}`);

  // Create batch records and processed message records
  for (const batch of batches) {
    await prisma.messageProcessingBatch.create({
      data: {
        contactId,
        messageHashes: JSON.stringify(batch.hashes),
        conversationSnippet: batch.snippet,
        status: 'PENDING',
        processedMessages: {
          create: batch.hashes.map((hash) => ({
            messageHash: hash,
          })),
        },
      },
    });
  }

  return batches.length;
}

/**
 * Process the next pending batch in the queue.
 * Returns true if a batch was processed, false if queue is empty.
 */
export async function processNextBatch(): Promise<boolean> {
  // Find oldest pending batch
  const batch = await prisma.messageProcessingBatch.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: {
      contact: {
        include: {
          customFields: true,
          tags: {
            include: {
              tag: true,
            },
          },
        },
      },
    },
  });

  if (!batch) {
    return false;
  }

  console.log(`Processing batch ${batch.id} for contact ${batch.contactId}`);

  // Update status to processing
  await prisma.messageProcessingBatch.update({
    where: { id: batch.id },
    data: { status: 'PROCESSING' },
  });

  try {
    // Get custom field definitions and available tags
    const [customFieldDefs, availableTags] = await Promise.all([
      prisma.customFieldDefinition.findMany({
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.tag.findMany({
        orderBy: { name: 'asc' },
      }),
    ]);

    // Analyze the conversation
    const contact = batch.contact as ContactWithFields;
    const analysisResult = await analyzeAndFilterConversation(batch.conversationSnippet, contact, {
      customFieldDefs,
      availableTags,
    });

    // Create suggested update record
    await prisma.suggestedUpdate.create({
      data: {
        batchId: batch.id,
        contactId: batch.contactId,
        suggestedChanges: JSON.stringify({
          fieldSuggestions: analysisResult.suggestions.fieldSuggestions,
          tagSuggestions: analysisResult.suggestions.tagSuggestions,
        }),
        hasNotableUpdates: analysisResult.suggestions.hasNotableUpdates,
        status: 'PENDING',
      },
    });

    // Update batch status to completed with LLM data
    await prisma.messageProcessingBatch.update({
      where: { id: batch.id },
      data: {
        status: 'COMPLETED',
        llmPrompt: analysisResult.llmPrompt,
        llmResponse: analysisResult.llmResponse,
      },
    });

    console.log(
      `Batch ${batch.id} completed. Notable updates: ${analysisResult.suggestions.hasNotableUpdates}, ` +
        `Field suggestions: ${analysisResult.suggestions.fieldSuggestions.length}, ` +
        `Tag suggestions: ${analysisResult.suggestions.tagSuggestions.length}`,
    );

    return true;
  } catch (error) {
    console.error(`Error processing batch ${batch.id}:`, error);

    // Update batch status to failed with error message
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.messageProcessingBatch.update({
      where: { id: batch.id },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    });

    return true; // Return true because we did process (even if failed)
  }
}

/**
 * Reset any batches stuck in PROCESSING state (from previous crashed runs).
 */
async function resetStuckBatches(): Promise<number> {
  const result = await prisma.messageProcessingBatch.updateMany({
    where: { status: 'PROCESSING' },
    data: { status: 'PENDING' },
  });

  if (result.count > 0) {
    console.log(`Reset ${result.count} stuck batch(es) from PROCESSING to PENDING`);
  }

  return result.count;
}

/**
 * Start the background worker that continuously processes batches.
 */
export async function startWorker(intervalMs: number = config.messageAnalysis.workerIntervalMs): Promise<void> {
  if (isWorkerRunning) {
    console.log('Worker is already running');
    return;
  }

  // Reset any stuck batches from previous runs
  await resetStuckBatches();

  isWorkerRunning = true;
  console.log(`Starting message analysis worker (interval: ${intervalMs}ms)`);

  const runWorkerIteration = async () => {
    if (!isWorkerRunning) {
      return;
    }

    try {
      const processed = await processNextBatch();

      if (processed) {
        // If we processed a batch, immediately check for more
        setTimeout(runWorkerIteration, 0);
      } else {
        // Queue is empty, wait before checking again
        workerIntervalId = setTimeout(runWorkerIteration, intervalMs);
      }
    } catch (error) {
      console.error('Worker iteration error:', error);
      // Wait before retrying on error
      workerIntervalId = setTimeout(runWorkerIteration, intervalMs);
    }
  };

  // Start the worker
  runWorkerIteration();
}

/**
 * Stop the background worker.
 */
export function stopWorker(): void {
  if (!isWorkerRunning) {
    console.log('Worker is not running');
    return;
  }

  isWorkerRunning = false;

  if (workerIntervalId) {
    clearTimeout(workerIntervalId);
    workerIntervalId = null;
  }

  console.log('Message analysis worker stopped');
}

/**
 * Check if the worker is currently running.
 */
export function isWorkerActive(): boolean {
  return isWorkerRunning;
}

/**
 * Get queue statistics.
 */
export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const [pending, processing, completed, failed] = await Promise.all([
    prisma.messageProcessingBatch.count({ where: { status: 'PENDING' } }),
    prisma.messageProcessingBatch.count({ where: { status: 'PROCESSING' } }),
    prisma.messageProcessingBatch.count({ where: { status: 'COMPLETED' } }),
    prisma.messageProcessingBatch.count({ where: { status: 'FAILED' } }),
  ]);

  return { pending, processing, completed, failed };
}

/**
 * Get analysis status for a specific contact.
 */
export async function getContactAnalysisStatus(contactId: string): Promise<{
  hasAnalysis: boolean;
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  lastAnalyzedAt: Date | null;
  lastError: string | null;
}> {
  const batches = await prisma.messageProcessingBatch.findMany({
    where: { contactId },
    select: {
      status: true,
      updatedAt: true,
      errorMessage: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const pendingCount = batches.filter((b) => b.status === 'PENDING').length;
  const processingCount = batches.filter((b) => b.status === 'PROCESSING').length;
  const completedCount = batches.filter((b) => b.status === 'COMPLETED').length;
  const failedCount = batches.filter((b) => b.status === 'FAILED').length;

  const lastCompleted = batches.find((b) => b.status === 'COMPLETED');
  const lastFailed = batches.find((b) => b.status === 'FAILED');

  return {
    hasAnalysis: batches.length > 0,
    pendingCount,
    processingCount,
    completedCount,
    failedCount,
    lastAnalyzedAt: lastCompleted?.updatedAt || null,
    lastError: lastFailed?.errorMessage || null,
  };
}

/**
 * Requeue failed batches for a contact.
 * Resets their status to PENDING so they can be reprocessed.
 */
export async function requeueFailedBatches(contactId: string): Promise<number> {
  const result = await prisma.messageProcessingBatch.updateMany({
    where: {
      contactId,
      status: 'FAILED',
    },
    data: {
      status: 'PENDING',
      errorMessage: null,
    },
  });

  console.log(`Requeued ${result.count} failed batch(es) for contact ${contactId}`);
  return result.count;
}

/**
 * Requeue a specific batch for reprocessing.
 */
export async function requeueBatch(batchId: string): Promise<boolean> {
  const batch = await prisma.messageProcessingBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    return false;
  }

  // Delete any existing suggested updates for this batch
  await prisma.suggestedUpdate.deleteMany({
    where: { batchId },
  });

  // Reset the batch status
  await prisma.messageProcessingBatch.update({
    where: { id: batchId },
    data: {
      status: 'PENDING',
      errorMessage: null,
      llmPrompt: null,
      llmResponse: null,
    },
  });

  console.log(`Requeued batch ${batchId} for reprocessing`);
  return true;
}

/**
 * Clear all analysis data for a contact and optionally re-analyze.
 * This removes all batches, processed messages, and suggested updates.
 */
export async function resetContactAnalysis(contactId: string): Promise<{
  deletedBatches: number;
  deletedMessages: number;
  deletedUpdates: number;
}> {
  // Get all batch IDs for this contact
  const batches = await prisma.messageProcessingBatch.findMany({
    where: { contactId },
    select: { id: true },
  });
  const batchIds = batches.map((b) => b.id);

  // Delete in order: processed messages, suggested updates, then batches
  const [deletedMessages, deletedUpdates, deletedBatches] = await Promise.all([
    prisma.processedMessage.deleteMany({
      where: { batchId: { in: batchIds } },
    }),
    prisma.suggestedUpdate.deleteMany({
      where: { contactId },
    }),
    prisma.messageProcessingBatch.deleteMany({
      where: { contactId },
    }),
  ]);

  console.log(
    `Reset analysis for contact ${contactId}: ` +
      `${deletedBatches.count} batches, ${deletedMessages.count} messages, ${deletedUpdates.count} updates`,
  );

  return {
    deletedBatches: deletedBatches.count,
    deletedMessages: deletedMessages.count,
    deletedUpdates: deletedUpdates.count,
  };
}
