import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Box, Typography, CircularProgress, TextField, IconButton, Alert } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { Message, Attachment, fetchMessages, sendMessage } from '../../utils/contactsApi';

const INITIAL_MESSAGES = 15;
const LOAD_MORE_MESSAGES = 30;

interface MessageConversationProps {
  phoneNumber: string;
  contactName: string;
}

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays < 7) {
    return (
      date.toLocaleDateString('en-US', { weekday: 'short' }) +
      ' ' +
      date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    );
  } else {
    return (
      date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' +
      date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    );
  }
}

function shouldShowDateSeparator(current: Message, previous: Message | null): boolean {
  if (!previous) return true;
  const currentDate = new Date(current.date).toDateString();
  const previousDate = new Date(previous.date).toDateString();
  return currentDate !== previousDate;
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentDisplayName(att: Attachment): string {
  return att.transferName || att.filename?.split('/').pop() || 'Attachment';
}

interface AttachmentDisplayProps {
  attachment: Attachment;
  isFromMe: boolean;
}

function AttachmentDisplay({ attachment, isFromMe }: AttachmentDisplayProps) {
  const [imageError, setImageError] = useState(false);

  // Image attachment - display inline
  if (attachment.isImage && attachment.url && !imageError) {
    return (
      <Box
        component='a'
        href={attachment.url}
        target='_blank'
        rel='noopener noreferrer'
        sx={{ display: 'block', mb: 0.5 }}>
        <Box
          component='img'
          src={attachment.url}
          alt={getAttachmentDisplayName(attachment)}
          onError={() => setImageError(true)}
          sx={{
            maxWidth: '100%',
            maxHeight: 300,
            borderRadius: 1,
            cursor: 'pointer',
            '&:hover': {
              opacity: 0.9,
            },
          }}
        />
      </Box>
    );
  }

  // Non-image or missing attachment - display as clickable link
  const hasFile = attachment.url != null;

  const content = (
    <>
      <AttachFileIcon sx={{ fontSize: 20, opacity: 0.7 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant='body2'
          sx={{
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
          {getAttachmentDisplayName(attachment)}
        </Typography>
        <Typography variant='caption' sx={{ opacity: 0.7 }}>
          {attachment.mimeType || 'Unknown type'}
          {attachment.totalBytes > 0 && ` - ${formatFileSize(attachment.totalBytes)}`}
          {!hasFile && ' (not synced)'}
        </Typography>
      </Box>
    </>
  );

  const boxStyles = {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    p: 1,
    mb: 0.5,
    borderRadius: 1,
    bgcolor: isFromMe ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
    textDecoration: 'none',
    color: 'inherit',
  };

  if (hasFile && attachment.url) {
    return (
      <Box
        component='a'
        href={attachment.url}
        target='_blank'
        rel='noopener noreferrer'
        download={getAttachmentDisplayName(attachment)}
        sx={{
          ...boxStyles,
          cursor: 'pointer',
          '&:hover': {
            bgcolor: isFromMe ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.1)',
          },
        }}>
        {content}
      </Box>
    );
  }

  return <Box sx={{ ...boxStyles, cursor: 'default' }}>{content}</Box>;
}

export default function MessageConversation({ phoneNumber, contactName }: MessageConversationProps) {
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [displayCount, setDisplayCount] = useState(INITIAL_MESSAGES);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line no-undef
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const initialScrollDone = useRef(false);

  // Compose state
  const [composeText, setComposeText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Load all messages once
  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      setLoading(true);
      setError(null);
      initialScrollDone.current = false;
      setDisplayCount(INITIAL_MESSAGES);
      try {
        const data = await fetchMessages(phoneNumber, 200);
        if (!cancelled) {
          // Data comes newest first, keep it that way for slicing
          setAllMessages(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load messages');
          console.error('Error loading messages:', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [phoneNumber]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && containerEl && !initialScrollDone.current && allMessages.length > 0) {
      containerEl.scrollTop = containerEl.scrollHeight;
      initialScrollDone.current = true;
    }
  }, [loading, allMessages.length, containerEl]);

  // Handle scroll to load more messages
  const handleScroll = useCallback(() => {
    if (!containerEl || loadingMore) return;

    const scrollTop = containerEl.scrollTop;
    const scrollHeight = containerEl.scrollHeight;
    const clientHeight = containerEl.clientHeight;

    // If scrolled to top half of content, load more
    if (scrollTop < clientHeight / 2 && displayCount < allMessages.length) {
      setLoadingMore(true);
      const prevScrollHeight = scrollHeight;

      // Use setTimeout to allow state update before measuring
      window.setTimeout(() => {
        setDisplayCount((prev) => Math.min(prev + LOAD_MORE_MESSAGES, allMessages.length));
        // Maintain scroll position after adding messages
        window.requestAnimationFrame(() => {
          if (containerEl) {
            const newScrollHeight = containerEl.scrollHeight;
            containerEl.scrollTop = newScrollHeight - prevScrollHeight + scrollTop;
          }
          setLoadingMore(false);
        });
      }, 0);
    }
  }, [containerEl, loadingMore, displayCount, allMessages.length]);

  // Handle sending a message
  const handleSend = useCallback(async () => {
    if (!composeText.trim() || sending) return;

    setSending(true);
    setSendError(null);

    try {
      await sendMessage(phoneNumber, composeText.trim());

      // Optimistic update: add message to display
      const newMessage: Message = {
        userId: phoneNumber,
        message: composeText.trim(),
        date: new Date().toISOString(),
        service: 'iMessage',
        destinationCallerId: phoneNumber,
        isFromMe: true,
        hasAttachments: false,
        attachments: [],
      };

      setAllMessages((prev) => [newMessage, ...prev]);
      setComposeText('');

      // Scroll to bottom after sending
      if (containerEl) {
        setTimeout(() => {
          containerEl.scrollTop = containerEl.scrollHeight;
        }, 50);
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [composeText, sending, phoneNumber, containerEl]);

  // Handle Enter key in compose field
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Get displayed messages (most recent N, reversed for display order)
  const displayedMessages = allMessages.slice(0, displayCount).reverse();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 200 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography color='error'>{error}</Typography>
      </Box>
    );
  }

  if (allMessages.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography color='text.secondary'>No messages found</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}>
      {/* Messages area */}
      <Box
        ref={setContainerEl}
        onScroll={handleScroll}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          p: 2,
          flex: 1,
          overflowY: 'auto',
          bgcolor: 'background.default',
        }}>
        {loadingMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <CircularProgress size={16} />
          </Box>
        )}
        {displayedMessages.map((msg, idx) => {
          const previous = idx > 0 ? displayedMessages[idx - 1] : null;
          const showDateSeparator = shouldShowDateSeparator(msg, previous);

          return (
            <React.Fragment key={`${msg.date}-${idx}`}>
              {showDateSeparator && (
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                  <Typography
                    variant='caption'
                    sx={{
                      bgcolor: 'action.hover',
                      px: 2,
                      py: 0.5,
                      borderRadius: 1,
                      color: 'text.secondary',
                    }}>
                    {formatDateSeparator(msg.date)}
                  </Typography>
                </Box>
              )}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: msg.isFromMe ? 'flex-end' : 'flex-start',
                  mb: 0.5,
                }}>
                <Box
                  sx={{
                    maxWidth: '75%',
                    px: 1.5,
                    py: 1,
                    borderRadius: 1.25,
                    bgcolor: msg.isFromMe ? 'primary.main' : 'grey.800',
                    color: msg.isFromMe ? 'primary.contrastText' : 'text.primary',
                  }}>
                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <Box sx={{ mb: msg.message ? 0.5 : 0 }}>
                      {msg.attachments.map((att) => (
                        <AttachmentDisplay key={att.id} attachment={att} isFromMe={msg.isFromMe} />
                      ))}
                    </Box>
                  )}
                  {/* Message text */}
                  {msg.message && (
                    <Typography
                      variant='body2'
                      sx={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                      {msg.message}
                    </Typography>
                  )}
                  <Typography
                    variant='caption'
                    sx={{
                      display: 'block',
                      mt: 0.5,
                      opacity: 0.7,
                      textAlign: msg.isFromMe ? 'right' : 'left',
                      fontSize: '0.65rem',
                    }}>
                    {formatMessageDate(msg.date)}
                  </Typography>
                </Box>
              </Box>
            </React.Fragment>
          );
        })}
      </Box>

      {/* Compose area */}
      <Box
        sx={{
          p: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}>
        {sendError && (
          <Alert severity='error' sx={{ mb: 1 }} onClose={() => setSendError(null)}>
            {sendError}
          </Alert>
        )}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            size='small'
            placeholder='Type a message...'
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />
          <IconButton
            color='primary'
            onClick={handleSend}
            disabled={!composeText.trim() || sending}
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': {
                bgcolor: 'primary.dark',
              },
              '&.Mui-disabled': {
                bgcolor: 'action.disabledBackground',
              },
            }}>
            {sending ? <CircularProgress size={24} color='inherit' /> : <SendIcon />}
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}
