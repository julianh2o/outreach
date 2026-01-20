const API_BASE = '/api/suggested-updates';

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface AdminSummary {
  queue: QueueStats;
  last24Hours: {
    completed: number;
    failed: number;
    total: number;
  };
  pendingSuggestions: number;
}

export interface BatchSuggestedUpdate {
  id: string;
  hasNotableUpdates: boolean;
  status: string;
  changeCount: number;
}

export interface RecentBatch {
  id: string;
  contactId: string;
  contactName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  messageCount: number;
  snippetPreview: string;
  suggestedUpdates: BatchSuggestedUpdate[];
  createdAt: string;
  updatedAt: string;
}

export interface BatchDetail {
  id: string;
  contactId: string;
  contactName: string;
  status: string;
  conversationSnippet: string;
  messageHashes: string[];
  processedMessages: Array<{ messageHash: string; createdAt: string }>;
  suggestedUpdates: Array<{
    id: string;
    hasNotableUpdates: boolean;
    status: string;
    suggestedChanges: {
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
    };
  }>;
  llmPrompt: string | null;
  llmResponse: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchAdminSummary(): Promise<AdminSummary> {
  const response = await fetch(`${API_BASE}/admin/summary`);
  if (!response.ok) {
    throw new Error('Failed to fetch admin summary');
  }
  return response.json();
}

export async function fetchRecentBatches(limit: number = 20, status?: string): Promise<RecentBatch[]> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (status) {
    params.set('status', status);
  }

  const response = await fetch(`${API_BASE}/admin/recent-batches?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch recent batches');
  }
  return response.json();
}

export async function fetchBatchDetail(batchId: string): Promise<BatchDetail> {
  const response = await fetch(`${API_BASE}/admin/batch/${batchId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch batch detail');
  }
  return response.json();
}

export async function reprocessBatch(batchId: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE}/admin/batch/${batchId}/reprocess`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to reprocess batch');
  }
  return response.json();
}

export interface PurgeResult {
  message: string;
  deletedBatches: number;
  deletedMessages: number;
  deletedUpdates: number;
}

export async function purgeAllBatches(): Promise<PurgeResult> {
  const response = await fetch(`${API_BASE}/admin/purge-all`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to purge all batches');
  }
  return response.json();
}

export interface PurgeMessagesResult {
  message: string;
  deletedMessages: number;
  deletedAttachments: number;
  syncStateReset: boolean;
}

export async function purgeAllMessages(): Promise<PurgeMessagesResult> {
  const response = await fetch('/api/messages/purge-all', {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to purge all messages');
  }
  return response.json();
}

// Failed Attachments Types and API

export interface FailedAttachmentContextMessage {
  text: string | null;
  date: string;
  isFromMe: boolean;
}

export interface FailedAttachment {
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
  contextMessages: FailedAttachmentContextMessage[];
}

export interface FailedAttachmentSummary {
  reason: string;
  count: number;
}

export async function fetchFailedAttachments(limit: number = 50): Promise<FailedAttachment[]> {
  const response = await fetch(`/api/messages/attachments/failed?limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch failed attachments');
  }
  return response.json();
}

export async function fetchFailedAttachmentsSummary(): Promise<FailedAttachmentSummary[]> {
  const response = await fetch('/api/messages/attachments/failed/summary');
  if (!response.ok) {
    throw new Error('Failed to fetch failed attachments summary');
  }
  return response.json();
}
