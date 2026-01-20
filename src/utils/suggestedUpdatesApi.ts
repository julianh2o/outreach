const API_BASE = '/api';

export interface FieldSuggestion {
  fieldId: string;
  fieldName: string;
  suggestedValue: string;
  confidence: number;
  reasoning: string;
}

export interface TagSuggestion {
  tagName: string;
  confidence: number;
  reasoning: string;
}

export interface SuggestedChanges {
  fieldSuggestions: FieldSuggestion[];
  tagSuggestions: TagSuggestion[];
}

export interface SuggestedUpdate {
  id: string;
  contactId: string;
  suggestedChanges: SuggestedChanges;
  hasNotableUpdates: boolean;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'PARTIALLY_ACCEPTED';
  conversationSnippet: string;
  createdAt: string;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export async function fetchSuggestedUpdates(contactId: string): Promise<SuggestedUpdate[]> {
  const response = await fetch(`${API_BASE}/suggested-updates/contacts/${contactId}/suggested-updates`);
  if (!response.ok) {
    throw new Error('Failed to fetch suggested updates');
  }
  return response.json();
}

export async function triggerAnalysis(contactId: string): Promise<{ message: string; batchesCreated: number }> {
  const response = await fetch(`${API_BASE}/suggested-updates/contacts/${contactId}/analyze-messages`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to trigger analysis');
  }
  return response.json();
}

export async function acceptUpdate(updateId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/suggested-updates/${updateId}/accept`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to accept update');
  }
}

export async function rejectUpdate(updateId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/suggested-updates/${updateId}/reject`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to reject update');
  }
}

export async function partialAcceptUpdate(
  updateId: string,
  acceptedFieldIds: string[],
  acceptedTagNames: string[],
): Promise<void> {
  const response = await fetch(`${API_BASE}/suggested-updates/${updateId}/partial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acceptedFieldIds, acceptedTagNames }),
  });
  if (!response.ok) {
    throw new Error('Failed to partially accept update');
  }
}

export async function fetchQueueStats(): Promise<QueueStats> {
  const response = await fetch(`${API_BASE}/suggested-updates/queue-stats`);
  if (!response.ok) {
    throw new Error('Failed to fetch queue stats');
  }
  return response.json();
}

export interface QueuePosition {
  hasQueuedBatches: boolean;
  position: number | null;
  totalInQueue: number;
  contactBatchCount: number;
  processingCount: number;
}

export async function fetchQueuePosition(contactId: string): Promise<QueuePosition> {
  const response = await fetch(`${API_BASE}/suggested-updates/contacts/${contactId}/queue-position`);
  if (!response.ok) {
    throw new Error('Failed to fetch queue position');
  }
  return response.json();
}

export interface AnalysisStatus {
  hasAnalysis: boolean;
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  lastAnalyzedAt: string | null;
  lastError: string | null;
}

export async function fetchAnalysisStatus(contactId: string): Promise<AnalysisStatus> {
  const response = await fetch(`${API_BASE}/suggested-updates/contacts/${contactId}/analysis-status`);
  if (!response.ok) {
    throw new Error('Failed to fetch analysis status');
  }
  return response.json();
}

export async function requeueFailed(contactId: string): Promise<{ message: string; requeuedCount: number }> {
  const response = await fetch(`${API_BASE}/suggested-updates/contacts/${contactId}/requeue-failed`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to requeue failed batches');
  }
  return response.json();
}

export async function resetAndAnalyze(
  contactId: string,
): Promise<{ message: string; reset: { deletedBatches: number }; batchesCreated: number }> {
  const response = await fetch(`${API_BASE}/suggested-updates/contacts/${contactId}/reset-and-analyze`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to reset and analyze');
  }
  return response.json();
}
