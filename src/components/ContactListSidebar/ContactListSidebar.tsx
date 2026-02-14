import React, { useState, useMemo } from 'react';
import {
  Box,
  TextField,
  List,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Typography,
  InputAdornment,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListSubheader,
  Chip,
  Collapse,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  MoreVert as MoreIcon,
  FileDownload as ExportIcon,
  FileUpload as ImportIcon,
  Description as TemplateIcon,
  DeleteForever as PurgeIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  SyncAlt as SyncHelperIcon,
} from '@mui/icons-material';
import { Contact } from '../../types';
import TagChip from '../TagChip';

// Outreach status: how many days until outreach is due (negative = overdue)
interface OutreachStatus {
  daysUntilDue: number; // negative if overdue
  daysSinceContact: number;
  isOverdue: boolean;
  label: string;
}

function getOutreachStatus(contact: Contact): OutreachStatus | null {
  if (!contact.outreachFrequencyDays) {
    return null;
  }

  // If no lastContacted but has frequency, treat as "never contacted" (overdue)
  if (!contact.lastContacted) {
    return {
      daysUntilDue: -Infinity,
      daysSinceContact: Infinity,
      isOverdue: true,
      label: 'Never',
    };
  }

  const lastContactedDate = new Date(contact.lastContacted);
  const now = new Date();
  const daysSinceContact = Math.floor((now.getTime() - lastContactedDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysUntilDue = contact.outreachFrequencyDays - daysSinceContact;
  const isOverdue = daysUntilDue <= 0;

  let label: string;
  if (daysUntilDue < 0) {
    label = `${Math.abs(daysUntilDue)}d overdue`;
  } else if (daysUntilDue === 0) {
    label = 'Due today';
  } else {
    label = `${daysUntilDue}d`;
  }

  return { daysUntilDue, daysSinceContact, isOverdue, label };
}

function formatLastContacted(date: Date | string | null | undefined): string {
  if (!date) return 'Never';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function formatFrequency(days: number): string {
  if (days <= 3) return 'every few days';
  if (days <= 10) return 'weekly';
  if (days <= 21) return 'bi-weekly';
  if (days <= 45) return 'monthly';
  if (days <= 120) return 'quarterly';
  return `every ${days}d`;
}

interface ContactListSidebarProps {
  contacts: Contact[];
  selectedContactId: string | null;
  onSelectContact: (contact: Contact) => void;
  onAddContact: () => void;
  onImport: () => void;
  onExport: () => void;
  onDownloadTemplate: () => void;
  onDownloadSyncHelper: () => void;
  onPurgeAll: () => void;
}

export default function ContactListSidebar({
  contacts,
  selectedContactId,
  onSelectContact,
  onAddContact,
  onImport,
  onExport,
  onDownloadTemplate,
  onDownloadSyncHelper,
  onPurgeAll,
}: ContactListSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleImportClick = () => {
    handleMenuClose();
    onImport();
  };

  const handleExportClick = () => {
    handleMenuClose();
    onExport();
  };

  const handleTemplateClick = () => {
    handleMenuClose();
    onDownloadTemplate();
  };

  const handleSyncHelperClick = () => {
    handleMenuClose();
    onDownloadSyncHelper();
  };

  const handlePurgeAllClick = () => {
    handleMenuClose();
    onPurgeAll();
  };

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const query = searchQuery.toLowerCase();
    return contacts.filter((contact) => {
      const fullName = `${contact.firstName} ${contact.lastName || ''}`.toLowerCase();
      const email = contact.channels.find((c) => c.type === 'email')?.identifier?.toLowerCase() || '';
      const phone = contact.channels.find((c) => c.type === 'phone')?.identifier || '';
      const tags = contact.tags.map((t) => t.tag.name.toLowerCase()).join(' ');
      return fullName.includes(query) || email.includes(query) || phone.includes(query) || tags.includes(query);
    });
  }, [contacts, searchQuery]);

  // Organize contacts into sections
  const { overdueContacts, upcomingContacts, remainingContacts } = useMemo(() => {
    const withStatus = filteredContacts.map((contact) => ({
      contact,
      status: getOutreachStatus(contact),
    }));

    // Overdue contacts (sorted by most overdue first)
    const overdue = withStatus
      .filter((c) => c.status?.isOverdue)
      .sort((a, b) => (a.status?.daysUntilDue ?? 0) - (b.status?.daysUntilDue ?? 0))
      .map((c) => c.contact);

    // Upcoming contacts (have frequency, not overdue, sorted by soonest due)
    const upcoming = withStatus
      .filter((c) => c.status && !c.status.isOverdue)
      .sort((a, b) => (a.status?.daysUntilDue ?? 0) - (b.status?.daysUntilDue ?? 0))
      .map((c) => c.contact);

    // Get IDs of contacts in the top section (first 3 overdue or first 3 upcoming)
    const topSectionIds = new Set(
      overdue.length > 0 ? overdue.slice(0, 3).map((c) => c.id) : upcoming.slice(0, 3).map((c) => c.id),
    );

    // Remaining contacts (everyone not in the top section), sorted by lastContacted descending
    const remaining = filteredContacts
      .filter((c) => !topSectionIds.has(c.id))
      .sort((a, b) => {
        const aDate = a.lastContacted ? new Date(a.lastContacted).getTime() : 0;
        const bDate = b.lastContacted ? new Date(b.lastContacted).getTime() : 0;
        return bDate - aDate; // Most recent first
      });

    return {
      overdueContacts: overdue.slice(0, 3),
      upcomingContacts: upcoming.slice(0, 3),
      remainingContacts: remaining,
    };
  }, [filteredContacts]);

  const getInitials = (contact: Contact): string => {
    const first = contact.firstName?.[0] || '';
    const last = contact.lastName?.[0] || '';
    return (first + last).toUpperCase() || '?';
  };

  // Get tags that should be displayed in the sidebar (those starting with _)
  const getSidebarTags = (contact: Contact): string[] => {
    return contact.tags.map((t) => t.tag.name).filter((name) => name.startsWith('_'));
  };

  const renderContactItem = (contact: Contact, showOverduePill: boolean = false) => {
    const sidebarTags = getSidebarTags(contact);
    const outreachStatus = getOutreachStatus(contact);

    return (
      <ListItemButton
        key={contact.id}
        selected={contact.id === selectedContactId}
        onClick={() => onSelectContact(contact)}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          '&.Mui-selected': {
            backgroundColor: 'action.selected',
          },
        }}>
        <ListItemAvatar>
          <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>{getInitials(contact)}</Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={
            <Typography variant='body1' sx={{ fontWeight: 500 }}>
              {contact.firstName} {contact.lastName}
            </Typography>
          }
          secondary={
            <Box component='span' sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              <Typography component='span' variant='caption' color='text.secondary'>
                {formatLastContacted(contact.lastContacted)}
                {contact.outreachFrequencyDays && ` · ${formatFrequency(contact.outreachFrequencyDays)}`}
              </Typography>
            </Box>
          }
        />
        <Box sx={{ display: 'flex', gap: 0.5, ml: 1, flexShrink: 0 }}>
          {showOverduePill && outreachStatus?.isOverdue && (
            <Chip
              label={outreachStatus.label}
              size='small'
              sx={{
                backgroundColor: 'error.main',
                color: 'white',
                fontWeight: 500,
                fontSize: '0.7rem',
                height: 20,
              }}
            />
          )}
          {sidebarTags.map((tagName) => (
            <TagChip key={tagName} tagName={tagName} size='small' />
          ))}
        </Box>
      </ListItemButton>
    );
  };

  const hasOverdue = overdueContacts.length > 0;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderRight: 1, borderColor: 'divider' }}>
      {/* Search and Add */}
      <Box sx={{ p: 2, display: 'flex', gap: 1 }}>
        <TextField
          placeholder='Search contacts...'
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size='small'
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position='start'>
                <SearchIcon fontSize='small' color='action' />
              </InputAdornment>
            ),
          }}
        />
        <IconButton onClick={onAddContact} color='primary' sx={{ flexShrink: 0 }}>
          <AddIcon />
        </IconButton>
        <IconButton onClick={handleMenuOpen} sx={{ flexShrink: 0 }}>
          <MoreIcon />
        </IconButton>
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}>
          <MenuItem onClick={handleImportClick}>
            <ListItemIcon>
              <ImportIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>Import CSV</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleExportClick}>
            <ListItemIcon>
              <ExportIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>Export CSV</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleTemplateClick}>
            <ListItemIcon>
              <TemplateIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>Download Template</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleSyncHelperClick}>
            <ListItemIcon>
              <SyncHelperIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>Download Sync Helper</ListItemText>
          </MenuItem>
          <MenuItem onClick={handlePurgeAllClick} sx={{ color: 'error.main' }}>
            <ListItemIcon>
              <PurgeIcon fontSize='small' color='error' />
            </ListItemIcon>
            <ListItemText>Purge All</ListItemText>
          </MenuItem>
        </Menu>
      </Box>

      {/* Contact List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {filteredContacts.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant='body2' color='text.secondary'>
              {searchQuery ? 'No contacts found' : 'No contacts yet'}
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {/* Top Section: Overdue or Upcoming */}
            {hasOverdue ? (
              <>
                <ListSubheader
                  sx={{
                    bgcolor: 'error.dark',
                    color: 'error.contrastText',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    lineHeight: '32px',
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}>
                  Overdue Reachouts
                </ListSubheader>
                {overdueContacts.map((contact) => renderContactItem(contact, true))}
              </>
            ) : upcomingContacts.length > 0 ? (
              <>
                <ListSubheader
                  onClick={() => setUpcomingExpanded(!upcomingExpanded)}
                  sx={{
                    bgcolor: 'background.default',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'text.secondary',
                    lineHeight: '32px',
                    borderBottom: 1,
                    borderColor: 'divider',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}>
                  <span>Upcoming Reachouts</span>
                  {upcomingExpanded ? <ExpandLessIcon fontSize='small' /> : <ExpandMoreIcon fontSize='small' />}
                </ListSubheader>
                <Collapse in={upcomingExpanded}>
                  {upcomingContacts.map((contact) => renderContactItem(contact, false))}
                </Collapse>
              </>
            ) : null}

            {/* Remaining Contacts */}
            {remainingContacts.length > 0 && (
              <>
                <ListSubheader
                  sx={{
                    bgcolor: 'background.default',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'text.secondary',
                    lineHeight: '32px',
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}>
                  All Contacts
                </ListSubheader>
                {remainingContacts.map((contact) => renderContactItem(contact, true))}
              </>
            )}
          </List>
        )}
      </Box>

      {/* Footer with count */}
      <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
        <Typography variant='caption' color='text.secondary'>
          {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
        </Typography>
      </Box>
    </Box>
  );
}
