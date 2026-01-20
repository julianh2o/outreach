import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Collapse,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Divider,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  HourglassEmpty as PendingIcon,
  Loop as ProcessingIcon,
  BrokenImage as BrokenImageIcon,
} from '@mui/icons-material';
import {
  AdminSummary,
  RecentBatch,
  BatchDetail,
  FailedAttachment,
  FailedAttachmentSummary,
  fetchAdminSummary,
  fetchRecentBatches,
  reprocessBatch,
  fetchBatchDetail,
  purgeAllBatches,
  purgeAllMessages,
  fetchFailedAttachments,
  fetchFailedAttachmentsSummary,
} from '../utils/adminApi';

export function Admin() {
  const [activeTab, setActiveTab] = useState(0);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [batches, setBatches] = useState<RecentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<BatchDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgingMessages, setPurgingMessages] = useState(false);

  // Failed attachments state
  const [failedAttachments, setFailedAttachments] = useState<FailedAttachment[]>([]);
  const [failedSummary, setFailedSummary] = useState<FailedAttachmentSummary[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryData, batchesData] = await Promise.all([
        fetchAdminSummary(),
        fetchRecentBatches(20, statusFilter || undefined),
      ]);
      setSummary(summaryData);
      setBatches(batchesData);
    } catch (err) {
      setError('Failed to load admin data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadFailedAttachments = useCallback(async () => {
    try {
      setLoadingAttachments(true);
      const [attachments, summary] = await Promise.all([fetchFailedAttachments(100), fetchFailedAttachmentsSummary()]);
      setFailedAttachments(attachments);
      setFailedSummary(summary);
    } catch (err) {
      setError('Failed to load failed attachments');
      console.error(err);
    } finally {
      setLoadingAttachments(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 1) {
      loadFailedAttachments();
    }
  }, [activeTab, loadFailedAttachments]);

  const handlePurgeAll = async () => {
    if (
      !window.confirm('Are you sure you want to purge ALL batches, messages, and suggestions? This cannot be undone.')
    ) {
      return;
    }

    try {
      setPurging(true);
      const result = await purgeAllBatches();
      alert(
        `Purged ${result.deletedBatches} batches, ${result.deletedMessages} messages, ${result.deletedUpdates} suggestions`,
      );
      loadData();
    } catch (err) {
      setError('Failed to purge batches');
      console.error(err);
    } finally {
      setPurging(false);
    }
  };

  const handlePurgeMessages = async () => {
    if (
      !window.confirm(
        'Are you sure you want to purge ALL stored iMessages? This will delete all synced messages and reset the sync state. This cannot be undone.',
      )
    ) {
      return;
    }

    try {
      setPurgingMessages(true);
      const result = await purgeAllMessages();
      alert(`Purged ${result.deletedMessages} messages and ${result.deletedAttachments} attachments`);
    } catch (err) {
      setError('Failed to purge messages');
      console.error(err);
    } finally {
      setPurgingMessages(false);
    }
  };

  const handleExpandBatch = async (batchId: string) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      setBatchDetail(null);
      return;
    }

    setExpandedBatchId(batchId);
    setLoadingDetail(true);
    try {
      const detail = await fetchBatchDetail(batchId);
      setBatchDetail(detail);
    } catch (err) {
      console.error('Failed to load batch detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckIcon color='success' fontSize='small' />;
      case 'FAILED':
        return <ErrorIcon color='error' fontSize='small' />;
      case 'PROCESSING':
        return <ProcessingIcon color='info' fontSize='small' />;
      case 'PENDING':
      default:
        return <PendingIcon color='warning' fontSize='small' />;
    }
  };

  const getStatusColor = (status: string): 'success' | 'error' | 'warning' | 'info' | 'default' => {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'FAILED':
        return 'error';
      case 'PROCESSING':
        return 'info';
      case 'PENDING':
        return 'warning';
      default:
        return 'default';
    }
  };

  if (loading && !summary) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant='h4'>Admin</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button color='error' variant='outlined' onClick={handlePurgeMessages} disabled={purgingMessages || loading}>
            {purgingMessages ? 'Purging...' : 'Purge All Messages'}
          </Button>
          <Button color='error' variant='outlined' onClick={handlePurgeAll} disabled={purging || loading}>
            {purging ? 'Purging...' : 'Purge All Batches'}
          </Button>
          <Button
            startIcon={<RefreshIcon />}
            onClick={activeTab === 0 ? loadData : loadFailedAttachments}
            disabled={loading || loadingAttachments}>
            Refresh
          </Button>
        </Box>
      </Box>

      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3 }}>
        <Tab label='Message Analysis' />
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              Failed Attachments
              {failedSummary.length > 0 && (
                <Chip
                  size='small'
                  label={failedSummary.reduce((sum, s) => sum + s.count, 0)}
                  color='error'
                  sx={{ height: 20 }}
                />
              )}
            </Box>
          }
        />
      </Tabs>

      {error && (
        <Alert severity='error' sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Tab 0: Message Analysis */}
      {activeTab === 0 && (
        <>
          {/* Summary Cards */}
          {summary && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 4 }}>
              <Card>
                <CardContent>
                  <Typography color='text.secondary' gutterBottom>
                    Queue Status
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                      icon={<PendingIcon />}
                      label={`${summary.queue.pending} Pending`}
                      color='warning'
                      size='small'
                    />
                    <Chip
                      icon={<ProcessingIcon />}
                      label={`${summary.queue.processing} Processing`}
                      color='info'
                      size='small'
                    />
                  </Box>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography color='text.secondary' gutterBottom>
                    Last 24 Hours
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                      icon={<CheckIcon />}
                      label={`${summary.last24Hours.completed} Completed`}
                      color='success'
                      size='small'
                    />
                    <Chip
                      icon={<ErrorIcon />}
                      label={`${summary.last24Hours.failed} Failed`}
                      color='error'
                      size='small'
                    />
                  </Box>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography color='text.secondary' gutterBottom>
                    Total Processed
                  </Typography>
                  <Typography variant='h4'>{summary.queue.completed}</Typography>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography color='text.secondary' gutterBottom>
                    Pending Suggestions
                  </Typography>
                  <Typography variant='h4'>{summary.pendingSuggestions}</Typography>
                </CardContent>
              </Card>
            </Box>
          )}

          {/* Recent Batches Table */}
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant='h6'>Recent Batches</Typography>
              <FormControl size='small' sx={{ minWidth: 150 }}>
                <InputLabel>Filter by Status</InputLabel>
                <Select value={statusFilter} label='Filter by Status' onChange={(e) => setStatusFilter(e.target.value)}>
                  <MenuItem value=''>All</MenuItem>
                  <MenuItem value='PENDING'>Pending</MenuItem>
                  <MenuItem value='PROCESSING'>Processing</MenuItem>
                  <MenuItem value='COMPLETED'>Completed</MenuItem>
                  <MenuItem value='FAILED'>Failed</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <TableContainer>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell width={40}></TableCell>
                    <TableCell>Contact</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Messages</TableCell>
                    <TableCell>Suggestions</TableCell>
                    <TableCell>Updated</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {batches.map((batch) => (
                    <React.Fragment key={batch.id}>
                      <TableRow hover onClick={() => handleExpandBatch(batch.id)} sx={{ cursor: 'pointer' }}>
                        <TableCell>
                          <IconButton size='small'>
                            {expandedBatchId === batch.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </TableCell>
                        <TableCell>
                          <Typography variant='body2' fontWeight={500}>
                            {batch.contactName}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={getStatusIcon(batch.status)}
                            label={batch.status}
                            color={getStatusColor(batch.status)}
                            size='small'
                            variant='outlined'
                          />
                        </TableCell>
                        <TableCell>{batch.messageCount}</TableCell>
                        <TableCell>
                          {batch.suggestedUpdates.length > 0 ? (
                            <Chip
                              label={`${batch.suggestedUpdates.reduce((sum, su) => sum + su.changeCount, 0)} changes`}
                              size='small'
                              color={batch.suggestedUpdates.some((su) => su.hasNotableUpdates) ? 'primary' : 'default'}
                              variant='outlined'
                            />
                          ) : (
                            <Typography variant='body2' color='text.secondary'>
                              -
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant='body2' color='text.secondary'>
                            {new Date(batch.updatedAt).toLocaleString()}
                          </Typography>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
                          <Collapse in={expandedBatchId === batch.id} timeout='auto' unmountOnExit>
                            <Box sx={{ p: 2, bgcolor: 'grey.900' }}>
                              {loadingDetail ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                                  <CircularProgress size={24} />
                                </Box>
                              ) : batchDetail && batchDetail.id === batch.id ? (
                                <BatchDetailView detail={batchDetail} onReprocess={loadData} />
                              ) : null}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))}
                  {batches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align='center'>
                        <Typography color='text.secondary' sx={{ py: 4 }}>
                          No batches found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {/* Tab 1: Failed Attachments */}
      {activeTab === 1 && (
        <FailedAttachmentsPanel attachments={failedAttachments} summary={failedSummary} loading={loadingAttachments} />
      )}
    </Box>
  );
}

// Failed Attachments Panel Component
interface FailedAttachmentsPanelProps {
  attachments: FailedAttachment[];
  summary: FailedAttachmentSummary[];
  loading: boolean;
}

function FailedAttachmentsPanel({ attachments, summary, loading }: FailedAttachmentsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const getErrorLabel = (reason: string): { label: string; color: 'error' | 'warning' | 'info' } => {
    switch (reason) {
      case 'file_too_large':
        return { label: 'Too Large', color: 'warning' };
      case 'file_not_found':
        return { label: 'Not Found', color: 'error' };
      case 'read_error':
        return { label: 'Read Error', color: 'error' };
      case 'no_local_path':
        return { label: 'No Path', color: 'info' };
      default:
        return { label: reason, color: 'error' };
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      {/* Summary Cards */}
      {summary.length > 0 && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          {summary.map((s) => {
            const { label, color } = getErrorLabel(s.reason);
            return (
              <Card key={s.reason} sx={{ minWidth: 150 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant='h4' color={`${color}.main`}>
                    {s.count}
                  </Typography>
                  <Typography variant='body2' color='text.secondary'>
                    {label}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {attachments.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <BrokenImageIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography color='text.secondary'>No failed attachments</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell width={40}></TableCell>
                <TableCell>File</TableCell>
                <TableCell>From</TableCell>
                <TableCell>Error</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {attachments.map((att) => {
                const { label, color } = getErrorLabel(att.errorReason);
                return (
                  <React.Fragment key={att.id}>
                    <TableRow
                      hover
                      onClick={() => setExpandedId(expandedId === att.id ? null : att.id)}
                      sx={{ cursor: 'pointer' }}>
                      <TableCell>
                        <IconButton size='small'>
                          {expandedId === att.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Typography variant='body2' fontWeight={500}>
                          {att.transferName || att.filename || 'Unknown'}
                        </Typography>
                        <Typography variant='caption' color='text.secondary'>
                          {att.mimeType || 'Unknown type'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant='body2'>{att.message.handleId}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={label} color={color} size='small' variant='outlined' />
                        {att.errorDetails && (
                          <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                            {att.errorDetails}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{formatBytes(att.totalBytes)}</TableCell>
                      <TableCell>
                        <Typography variant='body2' color='text.secondary'>
                          {new Date(att.message.date).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
                        <Collapse in={expandedId === att.id} timeout='auto' unmountOnExit>
                          <Box sx={{ p: 2, bgcolor: 'grey.900' }}>
                            <Typography variant='subtitle2' gutterBottom>
                              Message Context
                            </Typography>
                            <Box
                              sx={{
                                p: 1.5,
                                bgcolor: 'grey.800',
                                borderRadius: 1,
                                maxHeight: 200,
                                overflow: 'auto',
                              }}>
                              {att.contextMessages.length > 0 ? (
                                att.contextMessages.map((msg, i) => (
                                  <Box
                                    key={i}
                                    sx={{
                                      mb: 1,
                                      p: 1,
                                      borderRadius: 1,
                                      bgcolor: msg.isFromMe ? 'primary.dark' : 'grey.700',
                                      ml: msg.isFromMe ? 4 : 0,
                                      mr: msg.isFromMe ? 0 : 4,
                                    }}>
                                    <Typography variant='body2'>{msg.text || '[attachment]'}</Typography>
                                    <Typography variant='caption' color='text.secondary'>
                                      {new Date(msg.date).toLocaleString()}
                                    </Typography>
                                  </Box>
                                ))
                              ) : (
                                <Typography variant='body2' color='text.secondary'>
                                  No context messages available
                                </Typography>
                              )}
                            </Box>
                            <Box sx={{ mt: 2 }}>
                              <Typography variant='caption' color='text.secondary'>
                                Attachment GUID: {att.guid}
                              </Typography>
                            </Box>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}

interface BatchDetailViewProps {
  detail: BatchDetail;
  onReprocess: () => void;
}

function BatchDetailView({ detail, onReprocess }: BatchDetailViewProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showResponse, setShowResponse] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  const handleReprocess = async () => {
    try {
      setReprocessing(true);
      await reprocessBatch(detail.id);
      onReprocess();
    } catch (error) {
      console.error('Failed to reprocess batch:', error);
    } finally {
      setReprocessing(false);
    }
  };

  return (
    <Box>
      {/* Error Message */}
      {detail.errorMessage && (
        <Alert severity='error' sx={{ mb: 2 }}>
          <Typography variant='subtitle2'>Error</Typography>
          <Typography variant='body2' sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
            {detail.errorMessage}
          </Typography>
        </Alert>
      )}

      {/* LLM Prompt */}
      {detail.llmPrompt && (
        <Box sx={{ mb: 2 }}>
          <Button size='small' onClick={() => setShowPrompt(!showPrompt)} sx={{ mb: 1 }}>
            {showPrompt ? 'Hide' : 'Show'} LLM Prompt
          </Button>
          <Collapse in={showPrompt}>
            <Box
              sx={{
                p: 1.5,
                bgcolor: 'grey.800',
                borderRadius: 1,
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                maxHeight: 300,
                overflow: 'auto',
                border: '1px solid',
                borderColor: 'info.main',
              }}>
              {detail.llmPrompt}
            </Box>
          </Collapse>
        </Box>
      )}

      {/* LLM Response */}
      {detail.llmResponse && (
        <Box sx={{ mb: 2 }}>
          <Button size='small' onClick={() => setShowResponse(!showResponse)} sx={{ mb: 1 }}>
            {showResponse ? 'Hide' : 'Show'} LLM Raw Response
          </Button>
          <Collapse in={showResponse}>
            <Box
              sx={{
                p: 1.5,
                bgcolor: 'grey.800',
                borderRadius: 1,
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                maxHeight: 300,
                overflow: 'auto',
                border: '1px solid',
                borderColor: 'success.main',
              }}>
              {detail.llmResponse}
            </Box>
          </Collapse>
        </Box>
      )}

      <Typography variant='subtitle2' gutterBottom>
        Conversation Snippet
      </Typography>
      <Box
        sx={{
          p: 1.5,
          bgcolor: 'grey.800',
          borderRadius: 1,
          fontSize: '0.75rem',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          maxHeight: 200,
          overflow: 'auto',
          mb: 2,
        }}>
        {detail.conversationSnippet}
      </Box>

      {detail.suggestedUpdates.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant='subtitle2' gutterBottom>
            Suggested Updates
          </Typography>
          {detail.suggestedUpdates.map((su) => (
            <Box key={su.id} sx={{ mb: 2, p: 1.5, bgcolor: 'grey.800', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Chip label={su.status} size='small' variant='outlined' />
                {su.hasNotableUpdates && <Chip label='Notable' size='small' color='primary' />}
              </Box>

              {su.suggestedChanges.fieldSuggestions.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant='caption' color='text.secondary'>
                    Field Suggestions:
                  </Typography>
                  {su.suggestedChanges.fieldSuggestions.map((f) => (
                    <Box key={f.fieldId} sx={{ ml: 2, mt: 0.5 }}>
                      <Typography variant='body2'>
                        <strong>{f.fieldName}</strong>: {f.suggestedValue}
                      </Typography>
                      <Typography variant='caption' color='text.secondary'>
                        {Math.round(f.confidence * 100)}% - {f.reasoning}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              {su.suggestedChanges.tagSuggestions.length > 0 && (
                <Box>
                  <Typography variant='caption' color='text.secondary'>
                    Tag Suggestions:
                  </Typography>
                  {su.suggestedChanges.tagSuggestions.map((t) => (
                    <Box key={t.tagName} sx={{ ml: 2, mt: 0.5 }}>
                      <Typography variant='body2'>
                        <strong>Add tag:</strong> {t.tagName}
                      </Typography>
                      <Typography variant='caption' color='text.secondary'>
                        {Math.round(t.confidence * 100)}% - {t.reasoning}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </>
      )}

      <Divider sx={{ my: 2 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant='caption' color='text.secondary'>
          Batch ID: {detail.id} | Created: {new Date(detail.createdAt).toLocaleString()}
        </Typography>
        <Button
          size='small'
          variant='outlined'
          color='warning'
          onClick={handleReprocess}
          disabled={reprocessing || detail.status === 'PENDING' || detail.status === 'PROCESSING'}
          startIcon={reprocessing ? <CircularProgress size={16} /> : <RefreshIcon />}>
          {reprocessing ? 'Reprocessing...' : 'Reprocess'}
        </Button>
      </Box>
    </Box>
  );
}

export default Admin;
