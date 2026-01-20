import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Autocomplete,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Contact, ContactFormData, ChannelType, CustomFieldDefinition, Tag, Channel } from '../../types';
import { createContact, updateContact, createTag } from '../../utils/contactsApi';

interface ChannelFormData {
  type: string;
  identifier: string;
  label: string;
  isPrimary: boolean;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface ContactDialogProps {
  open: boolean;
  contact: Contact | null;
  channelTypes: ChannelType[];
  customFieldDefs: CustomFieldDefinition[];
  tags: Tag[];
  onClose: () => void;
  onSave: () => void;
  onTagsChange: (tags: Tag[]) => void;
}

const emptyChannel: ChannelFormData = {
  type: 'phone',
  identifier: '',
  label: '',
  isPrimary: false,
  street1: '',
  street2: '',
  city: '',
  state: '',
  zip: '',
  country: '',
};

export default function ContactDialog({
  open,
  contact,
  channelTypes,
  customFieldDefs,
  tags,
  onClose,
  onSave,
  onTagsChange,
}: ContactDialogProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [notes, setNotes] = useState('');
  const [outreachFrequencyDays, setOutreachFrequencyDays] = useState<string>('');
  const [preferredContactMethod, setPreferredContactMethod] = useState('');
  const [channels, setChannels] = useState<ChannelFormData[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (contact) {
        setFirstName(contact.firstName);
        setLastName(contact.lastName || '');
        setBirthday(contact.birthday ? contact.birthday.split('T')[0] : '');
        setNotes(contact.notes || '');
        setOutreachFrequencyDays(contact.outreachFrequencyDays?.toString() || '');
        setPreferredContactMethod(contact.preferredContactMethod || '');
        setChannels(
          contact.channels.map((ch: Channel) => ({
            type: ch.type,
            identifier: ch.identifier,
            label: ch.label || '',
            isPrimary: ch.isPrimary,
            street1: ch.street1 || '',
            street2: ch.street2 || '',
            city: ch.city || '',
            state: ch.state || '',
            zip: ch.zip || '',
            country: ch.country || '',
          })),
        );
        setSelectedTagIds(contact.tags.map((t) => t.tag.id));
        const cfValues: Record<string, string> = {};
        contact.customFields.forEach((cf) => {
          cfValues[cf.fieldId] = cf.value;
        });
        setCustomFields(cfValues);
      } else {
        setFirstName('');
        setLastName('');
        setBirthday('');
        setNotes('');
        setOutreachFrequencyDays('');
        setPreferredContactMethod('');
        setChannels([]);
        setSelectedTagIds([]);
        setCustomFields({});
      }
    }
  }, [open, contact]);

  const handleAddChannel = () => {
    setChannels([...channels, { ...emptyChannel }]);
  };

  const handleRemoveChannel = (index: number) => {
    setChannels(channels.filter((_, i) => i !== index));
  };

  const handleChannelChange = (index: number, field: keyof ChannelFormData, value: string | boolean) => {
    const updated = [...channels];
    updated[index] = { ...updated[index], [field]: value };
    setChannels(updated);
  };

  const handleCustomFieldChange = (fieldId: string, value: string) => {
    setCustomFields({ ...customFields, [fieldId]: value });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: ContactFormData = {
        firstName,
        lastName: lastName || undefined,
        birthday: birthday || undefined,
        notes: notes || undefined,
        outreachFrequencyDays: outreachFrequencyDays ? parseInt(outreachFrequencyDays) : undefined,
        preferredContactMethod: preferredContactMethod || undefined,
        channels: channels.map((ch) => ({
          type: ch.type,
          identifier: ch.identifier,
          label: ch.label || undefined,
          isPrimary: ch.isPrimary,
          street1: ch.street1 || undefined,
          street2: ch.street2 || undefined,
          city: ch.city || undefined,
          state: ch.state || undefined,
          zip: ch.zip || undefined,
          country: ch.country || undefined,
        })),
        tagIds: selectedTagIds,
        customFields: Object.entries(customFields)
          .filter(([, value]) => value.trim() !== '')
          .map(([fieldId, value]) => ({ fieldId, value })),
      };

      if (contact) {
        await updateContact(contact.id, data);
      } else {
        await createContact(data);
      }
      onSave();
    } catch (error) {
      console.error('Error saving contact:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTagChange = async (_event: React.SyntheticEvent, value: (string | Tag)[]) => {
    const newTagIds: string[] = [];
    for (const item of value) {
      if (typeof item === 'string') {
        // Create new tag
        try {
          const newTag = await createTag(item);
          onTagsChange([...tags, newTag]);
          newTagIds.push(newTag.id);
        } catch (error) {
          console.error('Error creating tag:', error);
        }
      } else {
        newTagIds.push(item.id);
      }
    }
    setSelectedTagIds(newTagIds);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>{contact ? 'Edit Contact' : 'New Contact'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {/* Basic Info */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label='First Name'
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              fullWidth
            />
            <TextField label='Last Name' value={lastName} onChange={(e) => setLastName(e.target.value)} fullWidth />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label='Birthday'
              type='date'
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label='Outreach Frequency (days)'
              type='number'
              value={outreachFrequencyDays}
              onChange={(e) => setOutreachFrequencyDays(e.target.value)}
              fullWidth
            />
          </Box>
          <FormControl fullWidth>
            <InputLabel>Preferred Contact Method</InputLabel>
            <Select
              value={preferredContactMethod}
              onChange={(e) => setPreferredContactMethod(e.target.value)}
              label='Preferred Contact Method'>
              <MenuItem value=''>None</MenuItem>
              {channelTypes.map((ct) => (
                <MenuItem key={ct.id} value={ct.id}>
                  {ct.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Tags */}
          <Autocomplete
            multiple
            freeSolo
            options={tags}
            value={tags.filter((t) => selectedTagIds.includes(t.id))}
            getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
            onChange={handleTagChange}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={typeof option === 'string' ? option : option.id}
                  label={typeof option === 'string' ? option : option.name}
                  size='small'
                />
              ))
            }
            renderInput={(params) => <TextField {...params} label='Tags' placeholder='Add tag...' />}
          />

          {/* Channels */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Contact Channels ({channels.length})</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {channels.map((channel, index) => (
                  <Box key={index} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant='subtitle2'>Channel {index + 1}</Typography>
                      <IconButton size='small' onClick={() => handleRemoveChannel(index)}>
                        <DeleteIcon fontSize='small' />
                      </IconButton>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                      <FormControl sx={{ minWidth: 150 }}>
                        <InputLabel>Type</InputLabel>
                        <Select
                          value={channel.type}
                          onChange={(e) => handleChannelChange(index, 'type', e.target.value)}
                          label='Type'
                          size='small'>
                          {channelTypes.map((ct) => (
                            <MenuItem key={ct.id} value={ct.id}>
                              {ct.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        label={channel.type === 'address' ? 'Address Name' : 'Identifier'}
                        value={channel.identifier}
                        onChange={(e) => handleChannelChange(index, 'identifier', e.target.value)}
                        size='small'
                        fullWidth
                      />
                      <TextField
                        label='Label'
                        value={channel.label}
                        onChange={(e) => handleChannelChange(index, 'label', e.target.value)}
                        size='small'
                        placeholder='e.g., Work, Personal'
                        sx={{ minWidth: 120 }}
                      />
                      <FormControl sx={{ minWidth: 80 }}>
                        <InputLabel>Primary</InputLabel>
                        <Select
                          value={channel.isPrimary ? 'yes' : 'no'}
                          onChange={(e) => handleChannelChange(index, 'isPrimary', e.target.value === 'yes')}
                          label='Primary'
                          size='small'>
                          <MenuItem value='no'>No</MenuItem>
                          <MenuItem value='yes'>Yes</MenuItem>
                        </Select>
                      </FormControl>
                    </Box>
                    {channel.type === 'address' && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                        <TextField
                          label='Street 1'
                          value={channel.street1}
                          onChange={(e) => handleChannelChange(index, 'street1', e.target.value)}
                          size='small'
                          fullWidth
                        />
                        <TextField
                          label='Street 2'
                          value={channel.street2}
                          onChange={(e) => handleChannelChange(index, 'street2', e.target.value)}
                          size='small'
                          fullWidth
                        />
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <TextField
                            label='City'
                            value={channel.city}
                            onChange={(e) => handleChannelChange(index, 'city', e.target.value)}
                            size='small'
                            fullWidth
                          />
                          <TextField
                            label='State'
                            value={channel.state}
                            onChange={(e) => handleChannelChange(index, 'state', e.target.value)}
                            size='small'
                            sx={{ width: 100 }}
                          />
                          <TextField
                            label='ZIP'
                            value={channel.zip}
                            onChange={(e) => handleChannelChange(index, 'zip', e.target.value)}
                            size='small'
                            sx={{ width: 100 }}
                          />
                        </Box>
                        <TextField
                          label='Country'
                          value={channel.country}
                          onChange={(e) => handleChannelChange(index, 'country', e.target.value)}
                          size='small'
                          fullWidth
                        />
                      </Box>
                    )}
                  </Box>
                ))}
                <Button startIcon={<AddIcon />} onClick={handleAddChannel} variant='outlined'>
                  Add Channel
                </Button>
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Custom Fields */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>
                Custom Fields ({Object.values(customFields).filter((v) => v.trim() !== '').length})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                {customFieldDefs.map((field) => (
                  <TextField
                    key={field.id}
                    label={field.name}
                    value={customFields[field.id] || ''}
                    onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                    size='small'
                    multiline
                    minRows={1}
                    maxRows={4}
                  />
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Notes */}
          <TextField
            label='Notes'
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={3}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant='contained' disabled={saving || !firstName.trim()}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
