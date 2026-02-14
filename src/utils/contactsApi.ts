import { Contact, ContactFormData, ChannelType, CustomFieldDefinition, Tag } from '../types';
import { getApiBaseUrl } from './api';

const getUrl = (path: string) => `${getApiBaseUrl()}${path}`;

// Contacts
export async function fetchContacts(): Promise<Contact[]> {
  const response = await fetch(getUrl('/api/contacts'));
  if (!response.ok) {
    throw new Error('Failed to fetch contacts');
  }
  return response.json();
}

export async function fetchContact(id: string): Promise<Contact> {
  const response = await fetch(getUrl(`/api/contacts/${id}`));
  if (!response.ok) {
    throw new Error('Failed to fetch contact');
  }
  return response.json();
}

export async function createContact(data: ContactFormData): Promise<Contact> {
  const response = await fetch(getUrl('/api/contacts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to create contact');
  }
  return response.json();
}

export async function updateContact(id: string, data: ContactFormData): Promise<Contact> {
  const response = await fetch(getUrl(`/api/contacts/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update contact');
  }
  return response.json();
}

export async function deleteContact(id: string): Promise<void> {
  const response = await fetch(getUrl(`/api/contacts/${id}`), {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete contact');
  }
}

export async function purgeAllContacts(): Promise<{ deleted: number }> {
  const response = await fetch(getUrl('/api/contacts'), {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to purge contacts');
  }
  return response.json();
}

// Lookups
export async function fetchChannelTypes(): Promise<ChannelType[]> {
  const response = await fetch(getUrl('/api/lookups/channel-types'));
  if (!response.ok) {
    throw new Error('Failed to fetch channel types');
  }
  return response.json();
}

export async function fetchCustomFieldDefinitions(): Promise<CustomFieldDefinition[]> {
  const response = await fetch(getUrl('/api/lookups/custom-fields'));
  if (!response.ok) {
    throw new Error('Failed to fetch custom field definitions');
  }
  return response.json();
}

export async function fetchTags(): Promise<Tag[]> {
  const response = await fetch(getUrl('/api/lookups/tags'));
  if (!response.ok) {
    throw new Error('Failed to fetch tags');
  }
  return response.json();
}

export async function createTag(name: string): Promise<Tag> {
  const response = await fetch(getUrl('/api/lookups/tags'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error('Failed to create tag');
  }
  return response.json();
}

// CSV Import/Export
export function getExportUrl(): string {
  return getUrl('/api/contacts/csv/export');
}

export function getTemplateUrl(): string {
  return getUrl('/api/contacts/csv/template');
}

// Sync Helper Download
export function getSyncHelperUrl(): string {
  return getUrl('/api/downloads/sync-helper');
}

export async function importContactsCSV(csv: string): Promise<{ imported: number; errors: string[] }> {
  const response = await fetch(getUrl('/api/contacts/csv/import'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv }),
  });
  if (!response.ok) {
    throw new Error('Failed to import contacts');
  }
  return response.json();
}

// Sync last contacted dates from iMessage
export async function syncLastContactedDates(): Promise<{ updated: number }> {
  const response = await fetch(getUrl('/api/contacts/sync-last-contacted'), {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to sync last contacted dates');
  }
  return response.json();
}

// Mark contact as contacted today
export async function markContactedToday(id: string): Promise<Contact> {
  const response = await fetch(getUrl(`/api/contacts/${id}/mark-contacted`), {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to mark contact as contacted');
  }
  return response.json();
}

// Messages
export interface Attachment {
  id: string;
  guid: string;
  filename: string | null;
  mimeType: string | null;
  transferName: string | null;
  totalBytes: number;
  localPath: string | null;
  isImage: boolean;
  url: string | null;
}

export interface Message {
  userId: string;
  message: string;
  date: string;
  service: string;
  destinationCallerId: string;
  isFromMe: boolean;
  hasAttachments: boolean;
  attachments: Attachment[];
}

export async function fetchMessages(phoneNumber: string, limit = 50): Promise<Message[]> {
  const encoded = encodeURIComponent(phoneNumber);
  const response = await fetch(getUrl(`/api/messages/${encoded}?limit=${limit}`));
  if (!response.ok) {
    throw new Error('Failed to fetch messages');
  }
  return response.json();
}

export async function sendMessage(handleId: string, text: string): Promise<{ success: boolean }> {
  const response = await fetch(getUrl('/api/messages/send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handleId, text }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to send message' }));
    throw new Error(error.error || 'Failed to send message');
  }
  return response.json();
}
