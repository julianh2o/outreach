import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Paper, Snackbar, Alert } from '@mui/material';

import { APP_TITLE, PAGE_TITLE_HOME } from '../utils/constants';
import { Contact, ChannelType, CustomFieldDefinition, Tag } from '../types';
import {
  fetchContacts,
  fetchChannelTypes,
  fetchCustomFieldDefinitions,
  fetchTags,
  purgeAllContacts,
  getExportUrl,
  getTemplateUrl,
  importContactsCSV,
} from '../utils/contactsApi';
import ContactListSidebar from '../components/ContactListSidebar';
import ContactDetailView from '../components/ContactDetailView';
import ContactDialog from '../components/ContactDialog';

export const Home = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [channelTypes, setChannelTypes] = useState<ChannelType[]>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [contactsData, channelTypesData, customFieldsData, tagsData] = await Promise.all([
        fetchContacts(),
        fetchChannelTypes(),
        fetchCustomFieldDefinitions(),
        fetchTags(),
      ]);
      setContacts(contactsData);
      setChannelTypes(channelTypesData);
      setCustomFieldDefs(customFieldsData);
      setTags(tagsData);

      // Update selected contact if it exists (either from URL or previous selection)
      const targetId = contactId || selectedContact?.id;
      if (targetId) {
        const updated = contactsData.find((c) => c.id === targetId);
        setSelectedContact(updated || null);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedContact?.id, contactId]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync URL with selected contact from URL params on initial load
  useEffect(() => {
    if (contactId && contacts.length > 0 && !selectedContact) {
      const contact = contacts.find((c) => c.id === contactId);
      if (contact) {
        setSelectedContact(contact);
      }
    }
  }, [contactId, contacts, selectedContact]);

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    navigate(`/conversation/${contact.id}`, { replace: true });
  };

  const handleAddContact = () => {
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
  };

  const handleDialogSave = () => {
    setDialogOpen(false);
    loadData();
  };

  const handleContactUpdate = () => {
    loadData();
  };

  const handleExport = () => {
    window.open(getExportUrl(), '_blank');
  };

  const handleDownloadTemplate = () => {
    window.open(getTemplateUrl(), '_blank');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const csv = await file.text();
      const result = await importContactsCSV(csv);

      if (result.errors.length > 0) {
        console.error('Import errors:', result.errors);
        setSnackbar({
          open: true,
          message: `Imported ${result.imported} contacts with ${result.errors.length} errors. Check console for details.`,
          severity: result.imported > 0 ? 'success' : 'error',
        });
      } else {
        setSnackbar({
          open: true,
          message: `Successfully imported ${result.imported} contacts.`,
          severity: 'success',
        });
      }
      loadData();
    } catch (error) {
      console.error('Import failed:', error);
      setSnackbar({
        open: true,
        message: 'Failed to import contacts.',
        severity: 'error',
      });
    }

    event.target.value = '';
  };

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handlePurgeAll = async () => {
    if (window.confirm('Are you sure you want to delete ALL contacts? This action cannot be undone.')) {
      try {
        const result = await purgeAllContacts();
        setSelectedContact(null);
        navigate('/', { replace: true });
        setSnackbar({
          open: true,
          message: `Successfully deleted ${result.deleted} contacts.`,
          severity: 'success',
        });
        loadData();
      } catch (error) {
        console.error('Purge failed:', error);
        setSnackbar({
          open: true,
          message: 'Failed to purge contacts.',
          severity: 'error',
        });
      }
    }
  };

  return (
    <>
      <Helmet>
        <title>
          {PAGE_TITLE_HOME} | {APP_TITLE}
        </title>
      </Helmet>
      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {/* Left sidebar - Contact list */}
        <Box sx={{ width: 350, flexShrink: 0 }}>
          <ContactListSidebar
            contacts={contacts}
            selectedContactId={selectedContact?.id || null}
            onSelectContact={handleSelectContact}
            onAddContact={handleAddContact}
            onImport={handleImportClick}
            onExport={handleExport}
            onDownloadTemplate={handleDownloadTemplate}
            onPurgeAll={handlePurgeAll}
          />
          <input type='file' ref={fileInputRef} style={{ display: 'none' }} accept='.csv' onChange={handleFileChange} />
        </Box>

        {/* Right panel - Contact detail */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {loading && contacts.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography color='text.secondary'>Loading...</Typography>
            </Box>
          ) : selectedContact ? (
            <ContactDetailView
              contact={selectedContact}
              channelTypes={channelTypes}
              customFieldDefs={customFieldDefs}
              tags={tags}
              onContactUpdate={handleContactUpdate}
              onTagsChange={setTags}
            />
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 400 }}>
                <Typography variant='h6' gutterBottom>
                  Select a contact
                </Typography>
                <Typography variant='body2' color='text.secondary'>
                  Choose a contact from the list to view their details, or click the + button to add a new contact.
                </Typography>
              </Paper>
            </Box>
          )}
        </Box>
      </Box>

      <ContactDialog
        open={dialogOpen}
        contact={null}
        channelTypes={channelTypes}
        customFieldDefs={customFieldDefs}
        tags={tags}
        onClose={handleDialogClose}
        onSave={handleDialogSave}
        onTagsChange={setTags}
      />
      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleSnackbarClose}>
        <Alert onClose={handleSnackbarClose} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};
