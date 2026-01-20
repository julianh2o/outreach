import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Collapse,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as AcceptIcon,
  Cancel as RejectIcon,
  AutoAwesome as AnalyzeIcon,
} from '@mui/icons-material';
import {
  SuggestedUpdate,
  FieldSuggestion,
  TagSuggestion,
  QueuePosition,
  AnalysisStatus,
  fetchSuggestedUpdates,
  triggerAnalysis,
  acceptUpdate,
  rejectUpdate,
  partialAcceptUpdate,
  fetchQueuePosition,
  fetchAnalysisStatus,
  requeueFailed,
  resetAndAnalyze,
} from '../../utils/suggestedUpdatesApi';

interface SuggestedUpdatesProps {
  contactId: string;
  onUpdatesApplied: () => void;
}

export default function SuggestedUpdates({ contactId, onUpdatesApplied }: SuggestedUpdatesProps) {
  const [updates, setUpdates] = useState<SuggestedUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedFields, setSelectedFields] = useState<Record<string, Set<string>>>({});
  const [selectedTags, setSelectedTags] = useState<Record<string, Set<string>>>({});
  const [queuePosition, setQueuePosition] = useState<QueuePosition | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);

  const loadUpdates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, position, status] = await Promise.all([
        fetchSuggestedUpdates(contactId),
        fetchQueuePosition(contactId),
        fetchAnalysisStatus(contactId),
      ]);
      setUpdates(data);
      setQueuePosition(position);
      setAnalysisStatus(status);

      // Initialize selection state
      const fields: Record<string, Set<string>> = {};
      const tags: Record<string, Set<string>> = {};
      for (const update of data) {
        fields[update.id] = new Set(update.suggestedChanges.fieldSuggestions.map((f) => f.fieldId));
        tags[update.id] = new Set(update.suggestedChanges.tagSuggestions.map((t) => t.tagName));
      }
      setSelectedFields(fields);
      setSelectedTags(tags);
    } catch (err) {
      setError('Failed to load suggested updates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    loadUpdates();
  }, [loadUpdates]);

  // Poll for updates while there are items in the queue
  useEffect(() => {
    if (!queuePosition?.hasQueuedBatches) {
      return;
    }

    const pollInterval = setInterval(() => {
      loadUpdates();
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [queuePosition?.hasQueuedBatches, loadUpdates]);

  const handleAnalyze = async () => {
    try {
      setAnalyzing(true);
      setError(null);
      const result = await triggerAnalysis(contactId);
      if (result.batchesCreated > 0) {
        // Poll for updates after a delay
        setTimeout(loadUpdates, 2000);
      } else {
        // Reload to update status
        await loadUpdates();
      }
    } catch (err) {
      setError('Failed to trigger analysis');
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRequeueFailed = async () => {
    try {
      setReprocessing(true);
      setError(null);
      const result = await requeueFailed(contactId);
      if (result.requeuedCount > 0) {
        setTimeout(loadUpdates, 1000);
      }
    } catch (err) {
      setError('Failed to requeue failed batches');
      console.error(err);
    } finally {
      setReprocessing(false);
    }
  };

  const handleResetAndAnalyze = async () => {
    try {
      setReprocessing(true);
      setError(null);
      await resetAndAnalyze(contactId);
      setTimeout(loadUpdates, 1000);
    } catch (err) {
      setError('Failed to reset and analyze');
      console.error(err);
    } finally {
      setReprocessing(false);
    }
  };

  const handleAcceptAll = async (updateId: string) => {
    try {
      await acceptUpdate(updateId);
      await loadUpdates();
      onUpdatesApplied();
    } catch (err) {
      setError('Failed to accept update');
      console.error(err);
    }
  };

  const handleReject = async (updateId: string) => {
    try {
      await rejectUpdate(updateId);
      await loadUpdates();
    } catch (err) {
      setError('Failed to reject update');
      console.error(err);
    }
  };

  const handleAcceptSelected = async (updateId: string) => {
    try {
      const fieldIds = Array.from(selectedFields[updateId] || []);
      const tagNames = Array.from(selectedTags[updateId] || []);
      await partialAcceptUpdate(updateId, fieldIds, tagNames);
      await loadUpdates();
      onUpdatesApplied();
    } catch (err) {
      setError('Failed to accept selected changes');
      console.error(err);
    }
  };

  const toggleFieldSelection = (updateId: string, fieldId: string) => {
    setSelectedFields((prev) => {
      const current = new Set(prev[updateId] || []);
      if (current.has(fieldId)) {
        current.delete(fieldId);
      } else {
        current.add(fieldId);
      }
      return { ...prev, [updateId]: current };
    });
  };

  const toggleTagSelection = (updateId: string, tagName: string) => {
    setSelectedTags((prev) => {
      const current = new Set(prev[updateId] || []);
      if (current.has(tagName)) {
        current.delete(tagName);
      } else {
        current.add(tagName);
      }
      return { ...prev, [updateId]: current };
    });
  };

  const getSelectionCount = (updateId: string) => {
    return (selectedFields[updateId]?.size || 0) + (selectedTags[updateId]?.size || 0);
  };

  const getTotalCount = (update: SuggestedUpdate) => {
    return update.suggestedChanges.fieldSuggestions.length + update.suggestedChanges.tagSuggestions.length;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  // Determine status message
  const getStatusDisplay = () => {
    if (!analysisStatus) return null;

    const { hasAnalysis, pendingCount, processingCount, completedCount, failedCount, lastAnalyzedAt } = analysisStatus;

    // Currently processing or queued
    if (pendingCount > 0 || processingCount > 0) {
      return null; // Will show queue position indicator instead
    }

    // Has failures
    if (failedCount > 0) {
      return {
        severity: 'warning' as const,
        message: `${failedCount} batch${failedCount > 1 ? 'es' : ''} failed`,
        showRetry: true,
      };
    }

    // All completed successfully
    if (hasAnalysis && completedCount > 0) {
      const lastDate = lastAnalyzedAt ? new Date(lastAnalyzedAt).toLocaleDateString() : 'unknown';
      return {
        severity: 'success' as const,
        message: `Analysis up to date (last: ${lastDate})`,
        showRetry: false,
      };
    }

    // No analysis yet
    return null;
  };

  const statusDisplay = getStatusDisplay();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant='subtitle2' color='text.secondary' sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
          AI Suggestions
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {analysisStatus?.failedCount ? (
            <>
              <Button size='small' color='warning' onClick={handleRequeueFailed} disabled={reprocessing || analyzing}>
                {reprocessing ? 'Retrying...' : 'Retry Failed'}
              </Button>
              <Button size='small' color='error' onClick={handleResetAndAnalyze} disabled={reprocessing || analyzing}>
                Reset All
              </Button>
            </>
          ) : (
            <Button
              size='small'
              startIcon={analyzing ? <CircularProgress size={16} /> : <AnalyzeIcon />}
              onClick={handleAnalyze}
              disabled={analyzing || reprocessing}>
              {analyzing ? 'Analyzing...' : 'Analyze Messages'}
            </Button>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity='error' sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Status Indicator */}
      {statusDisplay && (
        <Alert severity={statusDisplay.severity} sx={{ mb: 2 }}>
          {statusDisplay.message}
          {statusDisplay.severity === 'warning' && analysisStatus?.lastError && (
            <Typography variant='caption' display='block' sx={{ mt: 0.5, fontFamily: 'monospace' }}>
              Error: {analysisStatus.lastError}
            </Typography>
          )}
        </Alert>
      )}

      {/* Queue Position Indicator */}
      {queuePosition?.hasQueuedBatches && (
        <Alert severity='info' icon={<CircularProgress size={20} />} sx={{ mb: 2 }}>
          {queuePosition.processingCount > 0 ? (
            <>
              <strong>Processing</strong> - Analyzing {queuePosition.contactBatchCount} batch
              {queuePosition.contactBatchCount > 1 ? 'es' : ''}
            </>
          ) : (
            <>
              <strong>Queued</strong> - Position {queuePosition.position} of {queuePosition.totalInQueue} in queue
              {queuePosition.contactBatchCount > 1 && ` (${queuePosition.contactBatchCount} batches)`}
            </>
          )}
        </Alert>
      )}

      {updates.length === 0 ? (
        <Typography variant='body2' color='text.secondary'>
          No pending suggestions. Click &quot;Analyze Messages&quot; to scan for new information.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {updates.map((update) => (
            <Card key={update.id} variant='outlined'>
              <CardContent sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
                      {new Date(update.createdAt).toLocaleString()}
                    </Typography>

                    {/* Field Suggestions */}
                    {update.suggestedChanges.fieldSuggestions.map((field) => (
                      <FieldSuggestionItem
                        key={field.fieldId}
                        suggestion={field}
                        selected={selectedFields[update.id]?.has(field.fieldId) ?? false}
                        onToggle={() => toggleFieldSelection(update.id, field.fieldId)}
                      />
                    ))}

                    {/* Tag Suggestions */}
                    {update.suggestedChanges.tagSuggestions.map((tag) => (
                      <TagSuggestionItem
                        key={tag.tagName}
                        suggestion={tag}
                        selected={selectedTags[update.id]?.has(tag.tagName) ?? false}
                        onToggle={() => toggleTagSelection(update.id, tag.tagName)}
                      />
                    ))}
                  </Box>
                </Box>

                {/* Conversation snippet toggle */}
                <Box sx={{ mt: 1 }}>
                  <Button
                    size='small'
                    onClick={() => setExpandedId(expandedId === update.id ? null : update.id)}
                    endIcon={expandedId === update.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    sx={{ textTransform: 'none' }}>
                    View source conversation
                  </Button>
                  <Collapse in={expandedId === update.id}>
                    <Box
                      sx={{
                        mt: 1,
                        p: 1.5,
                        bgcolor: 'grey.50',
                        borderRadius: 1,
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        maxHeight: 200,
                        overflow: 'auto',
                      }}>
                      {update.conversationSnippet}
                    </Box>
                  </Collapse>
                </Box>

                <Divider sx={{ my: 1.5 }} />

                {/* Action buttons */}
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button size='small' color='error' startIcon={<RejectIcon />} onClick={() => handleReject(update.id)}>
                    Reject All
                  </Button>
                  <Button
                    size='small'
                    variant='outlined'
                    onClick={() => handleAcceptSelected(update.id)}
                    disabled={getSelectionCount(update.id) === 0}>
                    Accept Selected ({getSelectionCount(update.id)}/{getTotalCount(update)})
                  </Button>
                  <Button
                    size='small'
                    variant='contained'
                    color='success'
                    startIcon={<AcceptIcon />}
                    onClick={() => handleAcceptAll(update.id)}>
                    Accept All
                  </Button>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}

interface FieldSuggestionItemProps {
  suggestion: FieldSuggestion;
  selected: boolean;
  onToggle: () => void;
}

function FieldSuggestionItem({ suggestion, selected, onToggle }: FieldSuggestionItemProps) {
  return (
    <Box sx={{ mb: 1 }}>
      <FormControlLabel
        control={<Checkbox size='small' checked={selected} onChange={onToggle} />}
        label={
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant='body2' fontWeight={500}>
                {suggestion.fieldName}
              </Typography>
              <Chip
                label={`${Math.round(suggestion.confidence * 100)}%`}
                size='small'
                color='primary'
                variant='outlined'
              />
            </Box>
            <Typography variant='body2' color='text.secondary'>
              {suggestion.suggestedValue}
            </Typography>
            <Typography variant='caption' color='text.secondary' sx={{ fontStyle: 'italic' }}>
              {suggestion.reasoning}
            </Typography>
          </Box>
        }
        sx={{ alignItems: 'flex-start', ml: 0 }}
      />
    </Box>
  );
}

interface TagSuggestionItemProps {
  suggestion: TagSuggestion;
  selected: boolean;
  onToggle: () => void;
}

function TagSuggestionItem({ suggestion, selected, onToggle }: TagSuggestionItemProps) {
  return (
    <Box sx={{ mb: 1 }}>
      <FormControlLabel
        control={<Checkbox size='small' checked={selected} onChange={onToggle} />}
        label={
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant='body2' fontWeight={500}>
                Add tag: {suggestion.tagName}
              </Typography>
              <Chip
                label={`${Math.round(suggestion.confidence * 100)}%`}
                size='small'
                color='secondary'
                variant='outlined'
              />
            </Box>
            <Typography variant='caption' color='text.secondary' sx={{ fontStyle: 'italic' }}>
              {suggestion.reasoning}
            </Typography>
          </Box>
        }
        sx={{ alignItems: 'flex-start', ml: 0 }}
      />
    </Box>
  );
}
