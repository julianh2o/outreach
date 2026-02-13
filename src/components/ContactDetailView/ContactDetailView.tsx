import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Chip,
  Divider,
  Select,
  MenuItem,
  FormControl,
  Autocomplete,
  Button,
} from '@mui/material';
import {
  Edit as EditIcon,
  Check as SaveIcon,
  Close as CancelIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { Contact, ChannelType, CustomFieldDefinition, Tag, Channel } from '../../types';
import { updateContact, createTag, markContactedToday } from '../../utils/contactsApi';
import MessageConversation from '../MessageConversation';
import TagChip from '../TagChip';
import { formatPhoneForDisplay } from '../../utils/phoneNumber';

interface ContactDetailViewProps {
  contact: Contact;
  channelTypes: ChannelType[];
  customFieldDefs: CustomFieldDefinition[];
  tags: Tag[];
  onContactUpdate: () => void;
  onTagsChange: (tags: Tag[]) => void;
}

type EditingSection = 'basic' | 'channels' | 'custom' | 'notes' | null;

interface ChannelDisplay {
  type: string;
  typeName: string;
  identifier: string;
  label?: string | null;
  isPrimary: boolean;
  address?: {
    street1?: string | null;
    street2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
  };
}

export default function ContactDetailView({
  contact,
  channelTypes,
  customFieldDefs,
  tags,
  onContactUpdate,
  onTagsChange,
}: ContactDetailViewProps) {
  const [editingSection, setEditingSection] = useState<EditingSection>(null);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  // Reset editing state when contact changes
  useEffect(() => {
    setEditingSection(null);
    setEditData({});
  }, [contact.id]);

  const getChannelTypeName = (typeId: string): string => {
    return channelTypes.find((ct) => ct.id === typeId)?.name || typeId;
  };

  const getCustomFieldName = (fieldId: string): string => {
    return customFieldDefs.find((cf) => cf.id === fieldId)?.name || fieldId;
  };

  const formatBirthday = (birthday: string | null | undefined): string => {
    if (!birthday) return '';
    const date = new Date(birthday);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const formatAddress = (channel: Channel): string => {
    const parts = [channel.street1, channel.street2, channel.city, channel.state, channel.zip, channel.country].filter(
      Boolean,
    );
    if (channel.city && channel.state) {
      const idx = parts.indexOf(channel.city);
      if (idx !== -1 && parts[idx + 1] === channel.state) {
        parts[idx] = `${channel.city}, ${channel.state}`;
        parts.splice(idx + 1, 1);
      }
    }
    return parts.join('\n');
  };

  const startEditing = (section: EditingSection) => {
    if (section === 'basic') {
      setEditData({
        firstName: contact.firstName,
        lastName: contact.lastName || '',
        birthday: contact.birthday ? contact.birthday.split('T')[0] : '',
        outreachFrequencyDays: contact.outreachFrequencyDays?.toString() || '',
        preferredContactMethod: contact.preferredContactMethod || '',
        tagIds: contact.tags.map((t) => t.tag.id),
      });
    } else if (section === 'channels') {
      setEditData({
        channels: contact.channels.map((ch) => ({
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
      });
    } else if (section === 'custom') {
      const customFields: Record<string, string> = {};
      contact.customFields.forEach((cf) => {
        customFields[cf.fieldId] = cf.value;
      });
      setEditData({ customFields });
    } else if (section === 'notes') {
      setEditData({ notes: contact.notes || '' });
    }
    setEditingSection(section);
  };

  const cancelEditing = () => {
    setEditingSection(null);
    setEditData({});
  };

  const saveSection = async () => {
    setSaving(true);
    try {
      // Build base data from current contact
      let firstName = contact.firstName;
      let lastName = contact.lastName || undefined;
      let birthday = contact.birthday ? contact.birthday.split('T')[0] : undefined;
      let notes = contact.notes || undefined;
      let outreachFrequencyDays: number | null | undefined = contact.outreachFrequencyDays ?? undefined;
      let preferredContactMethod = contact.preferredContactMethod || undefined;
      let channels = contact.channels.map((ch) => ({
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
      }));
      let tagIds = contact.tags.map((t) => t.tag.id);
      let customFields = contact.customFields.map((cf) => ({ fieldId: cf.fieldId, value: cf.value }));

      if (editingSection === 'basic') {
        firstName = editData.firstName as string;
        lastName = (editData.lastName as string) || undefined;
        birthday = (editData.birthday as string) || undefined;
        // Explicitly set to null when cleared to remove the value
        outreachFrequencyDays = (editData.outreachFrequencyDays as string)
          ? parseInt(editData.outreachFrequencyDays as string)
          : null;
        preferredContactMethod = (editData.preferredContactMethod as string) || undefined;
        tagIds = editData.tagIds as string[];
      } else if (editingSection === 'channels') {
        channels = (editData.channels as Array<Record<string, unknown>>)
          .filter((ch) => (ch.identifier as string)?.trim())
          .map((ch) => ({
            type: ch.type as string,
            identifier: ch.identifier as string,
            label: (ch.label as string) || undefined,
            isPrimary: ch.isPrimary as boolean,
            street1: (ch.street1 as string) || undefined,
            street2: (ch.street2 as string) || undefined,
            city: (ch.city as string) || undefined,
            state: (ch.state as string) || undefined,
            zip: (ch.zip as string) || undefined,
            country: (ch.country as string) || undefined,
          }));
      } else if (editingSection === 'custom') {
        const cf = editData.customFields as Record<string, string>;
        customFields = Object.entries(cf)
          .filter(([, value]) => value?.trim())
          .map(([fieldId, value]) => ({ fieldId, value }));
      } else if (editingSection === 'notes') {
        notes = (editData.notes as string) || undefined;
      }

      await updateContact(contact.id, {
        firstName,
        lastName,
        birthday,
        notes,
        outreachFrequencyDays,
        preferredContactMethod,
        channels,
        tagIds,
        customFields,
      });
      setEditingSection(null);
      setEditData({});
      onContactUpdate();
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
    setEditData({ ...editData, tagIds: newTagIds });
  };

  const SectionHeader = ({
    title,
    section,
    showEdit = true,
  }: {
    title: string;
    section: EditingSection;
    showEdit?: boolean;
  }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
      <Typography variant='subtitle2' color='text.secondary' sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
        {title}
      </Typography>
      {showEdit && editingSection !== section && (
        <IconButton size='small' onClick={() => startEditing(section)} sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}>
          <EditIcon fontSize='small' />
        </IconButton>
      )}
      {editingSection === section && (
        <Box>
          <IconButton size='small' onClick={saveSection} disabled={saving} color='primary'>
            <SaveIcon fontSize='small' />
          </IconButton>
          <IconButton size='small' onClick={cancelEditing} disabled={saving}>
            <CancelIcon fontSize='small' />
          </IconButton>
        </Box>
      )}
    </Box>
  );

  const channels: ChannelDisplay[] = contact.channels.map((ch) => ({
    type: ch.type,
    typeName: getChannelTypeName(ch.type),
    identifier: ch.identifier,
    label: ch.label,
    isPrimary: ch.isPrimary,
    address:
      ch.type === 'address'
        ? {
            street1: ch.street1,
            street2: ch.street2,
            city: ch.city,
            state: ch.state,
            zip: ch.zip,
            country: ch.country,
          }
        : undefined,
  }));

  const filledCustomFields = contact.customFields.filter((cf) => cf.value?.trim());
  const phoneChannel = contact.channels.find((ch) => ch.type === 'phone');

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left side - Contact details */}
      <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
        {/* Header with name */}
        <Box sx={{ mb: 3 }}>
          <SectionHeader title='' section='basic' />
          {editingSection === 'basic' ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label='First Name'
                  value={editData.firstName || ''}
                  onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
                  size='small'
                  fullWidth
                />
                <TextField
                  label='Last Name'
                  value={editData.lastName || ''}
                  onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
                  size='small'
                  fullWidth
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label='Birthday'
                  type='date'
                  value={editData.birthday || ''}
                  onChange={(e) => setEditData({ ...editData, birthday: e.target.value })}
                  size='small'
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  label='Outreach (days)'
                  type='number'
                  value={editData.outreachFrequencyDays || ''}
                  onChange={(e) => setEditData({ ...editData, outreachFrequencyDays: e.target.value })}
                  size='small'
                  fullWidth
                />
              </Box>
              <FormControl size='small' fullWidth>
                <Select
                  value={editData.preferredContactMethod || ''}
                  onChange={(e) => setEditData({ ...editData, preferredContactMethod: e.target.value })}
                  displayEmpty>
                  <MenuItem value=''>No preferred method</MenuItem>
                  {channelTypes.map((ct) => (
                    <MenuItem key={ct.id} value={ct.id}>
                      {ct.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Autocomplete
                multiple
                freeSolo
                options={tags}
                value={tags.filter((t) => (editData.tagIds as string[])?.includes(t.id))}
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
                renderInput={(params) => <TextField {...params} label='Tags' size='small' />}
              />
            </Box>
          ) : (
            <>
              <Typography variant='h4' sx={{ fontWeight: 600, mb: 1 }}>
                {contact.firstName} {contact.lastName}
              </Typography>
              {contact.tags.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                  {contact.tags.map((t) => (
                    <TagChip key={t.tag.id} tagName={t.tag.name} size='small' />
                  ))}
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 3, color: 'text.secondary', flexWrap: 'wrap', alignItems: 'center' }}>
                {contact.birthday && <Typography variant='body2'>{formatBirthday(contact.birthday)}</Typography>}
                {contact.outreachFrequencyDays && (
                  <Typography variant='body2'>Contact every {contact.outreachFrequencyDays} days</Typography>
                )}
                {contact.preferredContactMethod && (
                  <Typography variant='body2'>Prefers {getChannelTypeName(contact.preferredContactMethod)}</Typography>
                )}
                {contact.lastContacted && (
                  <Typography variant='body2'>
                    Last contacted: {new Date(contact.lastContacted).toLocaleDateString()}
                  </Typography>
                )}
              </Box>
              <Box sx={{ mt: 2 }}>
                <Button
                  variant='outlined'
                  size='small'
                  startIcon={<CheckCircleIcon />}
                  onClick={async () => {
                    try {
                      await markContactedToday(contact.id);
                      onContactUpdate();
                    } catch (error) {
                      console.error('Error marking contact:', error);
                    }
                  }}>
                  Mark Contacted Today
                </Button>
              </Box>
            </>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Contact Methods */}
        {(channels.length > 0 || editingSection === 'channels') && (
          <>
            <SectionHeader title='Contact' section='channels' />
            {editingSection === 'channels' ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {(editData.channels as Array<Record<string, string | boolean>>)?.map((ch, idx) => (
                  <Box key={idx} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      <FormControl size='small' sx={{ minWidth: 120 }}>
                        <Select
                          value={ch.type}
                          onChange={(e) => {
                            const updated = [...(editData.channels as Array<Record<string, string | boolean>>)];
                            updated[idx] = { ...updated[idx], type: e.target.value };
                            setEditData({ ...editData, channels: updated });
                          }}>
                          {channelTypes.map((ct) => (
                            <MenuItem key={ct.id} value={ct.id}>
                              {ct.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        label='Value'
                        value={ch.identifier}
                        onChange={(e) => {
                          const updated = [...(editData.channels as Array<Record<string, string | boolean>>)];
                          updated[idx] = { ...updated[idx], identifier: e.target.value };
                          setEditData({ ...editData, channels: updated });
                        }}
                        size='small'
                        fullWidth
                      />
                      <TextField
                        label='Label'
                        value={ch.label}
                        onChange={(e) => {
                          const updated = [...(editData.channels as Array<Record<string, string | boolean>>)];
                          updated[idx] = { ...updated[idx], label: e.target.value };
                          setEditData({ ...editData, channels: updated });
                        }}
                        size='small'
                        sx={{ width: 100 }}
                      />
                      <IconButton
                        size='small'
                        onClick={() => {
                          const updated = (editData.channels as Array<Record<string, string | boolean>>).filter(
                            (_, i) => i !== idx,
                          );
                          setEditData({ ...editData, channels: updated });
                        }}>
                        <CancelIcon fontSize='small' />
                      </IconButton>
                    </Box>
                    {ch.type === 'address' && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                        <TextField
                          label='Street 1'
                          value={ch.street1 || ''}
                          onChange={(e) => {
                            const updated = [...(editData.channels as Array<Record<string, string | boolean>>)];
                            updated[idx] = { ...updated[idx], street1: e.target.value };
                            setEditData({ ...editData, channels: updated });
                          }}
                          size='small'
                          fullWidth
                        />
                        <TextField
                          label='Street 2'
                          value={ch.street2 || ''}
                          onChange={(e) => {
                            const updated = [...(editData.channels as Array<Record<string, string | boolean>>)];
                            updated[idx] = { ...updated[idx], street2: e.target.value };
                            setEditData({ ...editData, channels: updated });
                          }}
                          size='small'
                          fullWidth
                        />
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <TextField
                            label='City'
                            value={ch.city || ''}
                            onChange={(e) => {
                              const updated = [...(editData.channels as Array<Record<string, string | boolean>>)];
                              updated[idx] = { ...updated[idx], city: e.target.value };
                              setEditData({ ...editData, channels: updated });
                            }}
                            size='small'
                            fullWidth
                          />
                          <TextField
                            label='State'
                            value={ch.state || ''}
                            onChange={(e) => {
                              const updated = [...(editData.channels as Array<Record<string, string | boolean>>)];
                              updated[idx] = { ...updated[idx], state: e.target.value };
                              setEditData({ ...editData, channels: updated });
                            }}
                            size='small'
                            sx={{ width: 80 }}
                          />
                          <TextField
                            label='ZIP'
                            value={ch.zip || ''}
                            onChange={(e) => {
                              const updated = [...(editData.channels as Array<Record<string, string | boolean>>)];
                              updated[idx] = { ...updated[idx], zip: e.target.value };
                              setEditData({ ...editData, channels: updated });
                            }}
                            size='small'
                            sx={{ width: 100 }}
                          />
                        </Box>
                      </Box>
                    )}
                  </Box>
                ))}
                <Box
                  sx={{
                    p: 1,
                    border: '1px dashed',
                    borderColor: 'divider',
                    borderRadius: 1,
                    textAlign: 'center',
                    cursor: 'pointer',
                    '&:hover': { borderColor: 'primary.main' },
                  }}
                  onClick={() => {
                    const updated = [
                      ...((editData.channels as Array<Record<string, string | boolean>>) || []),
                      { type: 'phone', identifier: '', label: '', isPrimary: false },
                    ];
                    setEditData({ ...editData, channels: updated });
                  }}>
                  <Typography variant='body2' color='text.secondary'>
                    + Add contact method
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {channels.map((ch, idx) => (
                  <Box key={idx}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography variant='body1' sx={{ fontWeight: 500 }}>
                        {ch.type === 'address'
                          ? formatAddress(contact.channels[idx])
                          : ch.type === 'phone'
                            ? formatPhoneForDisplay(ch.identifier)
                            : ch.identifier}
                      </Typography>
                      <Typography variant='caption' color='text.secondary'>
                        {ch.typeName}
                        {ch.label && ` - ${ch.label}`}
                        {ch.isPrimary && ' (primary)'}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
            <Divider sx={{ my: 2 }} />
          </>
        )}

        {/* Custom Fields */}
        {(filledCustomFields.length > 0 || editingSection === 'custom') && (
          <>
            <SectionHeader title='Details' section='custom' />
            {editingSection === 'custom' ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                {customFieldDefs.map((field) => (
                  <TextField
                    key={field.id}
                    label={field.name}
                    value={(editData.customFields as Record<string, string>)?.[field.id] || ''}
                    onChange={(e) => {
                      const cf = { ...((editData.customFields as Record<string, string>) || {}) };
                      cf[field.id] = e.target.value;
                      setEditData({ ...editData, customFields: cf });
                    }}
                    size='small'
                    multiline
                    minRows={1}
                    maxRows={3}
                  />
                ))}
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                {filledCustomFields.map((cf) => (
                  <Box key={cf.fieldId}>
                    <Typography variant='caption' color='text.secondary'>
                      {getCustomFieldName(cf.fieldId)}
                    </Typography>
                    <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap' }}>
                      {cf.value}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
            <Divider sx={{ my: 2 }} />
          </>
        )}

        {/* Notes */}
        {(contact.notes || editingSection === 'notes') && (
          <>
            <SectionHeader title='Notes' section='notes' />
            {editingSection === 'notes' ? (
              <TextField
                value={editData.notes || ''}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                multiline
                rows={4}
                fullWidth
                size='small'
              />
            ) : (
              <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap' }}>
                {contact.notes}
              </Typography>
            )}
          </>
        )}

      </Box>

      {/* Right side - Messages */}
      {phoneChannel && (
        <Box
          sx={{
            width: 380,
            borderLeft: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography
              variant='subtitle2'
              color='text.secondary'
              sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              Messages
            </Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <MessageConversation
              phoneNumber={phoneChannel.identifier}
              contactName={`${contact.firstName} ${contact.lastName || ''}`.trim()}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
