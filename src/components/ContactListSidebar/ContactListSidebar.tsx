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
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  MoreVert as MoreIcon,
  FileDownload as ExportIcon,
  FileUpload as ImportIcon,
  Description as TemplateIcon,
  Notifications as NotificationsIcon,
  DeleteForever as PurgeIcon,
  AdminPanelSettings as AdminIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { Contact } from '../../types';
import TagChip, { parseTagName } from '../TagChip';
import { formatPhoneForDisplay } from '../../utils/phoneNumber';

// Outreach frequency sections configuration
// Each section defines a label and the maximum days for that section (inclusive)
// Contacts are placed in the first section where their outreachFrequencyDays <= maxDays
// The last section (Others) captures contacts with no outreachFrequencyDays set
interface FrequencySection {
  id: string;
  label: string;
  maxDays: number | null; // null means no upper limit (for "Others" section)
}

const FREQUENCY_SECTIONS: FrequencySection[] = [
  { id: 'daily', label: 'Every Few Days (1-3)', maxDays: 3 },
  { id: 'weekly', label: 'Weekly (~7 days)', maxDays: 10 },
  { id: 'biweekly', label: 'Bi-weekly (~14 days)', maxDays: 21 },
  { id: 'monthly', label: 'Monthly (~30 days)', maxDays: 45 },
  { id: 'quarterly', label: 'Quarterly (~90 days)', maxDays: 120 },
  { id: 'others', label: 'Others', maxDays: null },
];

// Outreach status: how many days until outreach is due (negative = overdue)
interface OutreachStatus {
  daysUntilDue: number; // negative if overdue
  daysSinceContact: number;
  isOverdue: boolean;
  label: string;
}

function getOutreachStatus(contact: Contact): OutreachStatus | null {
  if (!contact.outreachFrequencyDays || !contact.lastContacted) {
    return null;
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

interface ContactListSidebarProps {
  contacts: Contact[];
  selectedContactId: string | null;
  onSelectContact: (contact: Contact) => void;
  onAddContact: () => void;
  onImport: () => void;
  onExport: () => void;
  onDownloadTemplate: () => void;
  onSendReminder: () => void;
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
  onSendReminder,
  onPurgeAll,
}: ContactListSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

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

  const handleSendReminderClick = () => {
    handleMenuClose();
    onSendReminder();
  };

  const handlePurgeAllClick = () => {
    handleMenuClose();
    onPurgeAll();
  };

  const navigate = useNavigate();

  const handleAdminClick = () => {
    handleMenuClose();
    navigate('/admin');
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

  // Group contacts by outreach frequency sections
  const groupedContacts = useMemo(() => {
    const groups: Map<string, Contact[]> = new Map();

    // Initialize all groups
    FREQUENCY_SECTIONS.forEach((section) => {
      groups.set(section.id, []);
    });

    // Sort contacts into appropriate sections
    filteredContacts.forEach((contact) => {
      const freq = contact.outreachFrequencyDays;

      if (freq == null) {
        // No frequency set -> Others
        groups.get('others')!.push(contact);
      } else {
        // Find the first section where freq <= maxDays
        let placed = false;
        for (const section of FREQUENCY_SECTIONS) {
          if (section.maxDays !== null && freq <= section.maxDays) {
            groups.get(section.id)!.push(contact);
            placed = true;
            break;
          }
        }
        // If freq is larger than all maxDays, put in Others
        if (!placed) {
          groups.get('others')!.push(contact);
        }
      }
    });

    return groups;
  }, [filteredContacts]);

  const getInitials = (contact: Contact): string => {
    const first = contact.firstName?.[0] || '';
    const last = contact.lastName?.[0] || '';
    return (first + last).toUpperCase() || '?';
  };

  const getSubtitle = (contact: Contact): string => {
    const email = contact.channels.find((c) => c.type === 'email')?.identifier;
    const phone = contact.channels.find((c) => c.type === 'phone')?.identifier;
    if (email) return email;
    if (phone) return formatPhoneForDisplay(phone);
    return '';
  };

  // Get tags that should be displayed in the sidebar (those starting with _)
  const getSidebarTags = (contact: Contact): string[] => {
    return contact.tags.map((t) => t.tag.name).filter((name) => name.startsWith('_'));
  };

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
          <MenuItem onClick={handleSendReminderClick}>
            <ListItemIcon>
              <NotificationsIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>Send Reminder</ListItemText>
          </MenuItem>
          <MenuItem onClick={handlePurgeAllClick} sx={{ color: 'error.main' }}>
            <ListItemIcon>
              <PurgeIcon fontSize='small' color='error' />
            </ListItemIcon>
            <ListItemText>Purge All</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleAdminClick}>
            <ListItemIcon>
              <AdminIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>Analysis Admin</ListItemText>
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
            {FREQUENCY_SECTIONS.map((section) => {
              const sectionContacts = groupedContacts.get(section.id) || [];
              if (sectionContacts.length === 0) return null;

              return (
                <React.Fragment key={section.id}>
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
                    {section.label}
                  </ListSubheader>
                  {sectionContacts.map((contact) => {
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
                          <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
                            {getInitials(contact)}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Typography variant='body1' sx={{ fontWeight: 500 }}>
                              {contact.firstName} {contact.lastName}
                            </Typography>
                          }
                          secondary={getSubtitle(contact)}
                          secondaryTypographyProps={{ noWrap: true }}
                        />
                        <Box sx={{ display: 'flex', gap: 0.5, ml: 1, flexShrink: 0 }}>
                          {outreachStatus && (
                            <Chip
                              label={outreachStatus.label}
                              size='small'
                              sx={{
                                backgroundColor: outreachStatus.isOverdue ? 'error.main' : 'info.main',
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
                  })}
                </React.Fragment>
              );
            })}
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
