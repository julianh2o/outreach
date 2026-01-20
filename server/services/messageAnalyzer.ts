import { b, SuggestedUpdates, FieldSuggestion, TagSuggestion } from '../../baml_client/baml_client';
import { config } from '../config';
import { Contact, CustomFieldDefinition, CustomFieldValue, Tag, TagOnContact } from '@prisma/client';

export interface ContactWithFields extends Contact {
  customFields: CustomFieldValue[];
  tags: (TagOnContact & { tag: Tag })[];
}

export interface AnalysisContext {
  customFieldDefs: CustomFieldDefinition[];
  availableTags: Tag[];
}

export interface FilteredSuggestions {
  fieldSuggestions: FieldSuggestion[];
  tagSuggestions: TagSuggestion[];
  hasNotableUpdates: boolean;
}

export interface AnalysisResult {
  suggestions: FilteredSuggestions;
  llmPrompt: string;
  llmResponse: string;
}

/**
 * Build the input for the LLM analysis.
 */
export function buildAnalysisInput(snippet: string, contact: ContactWithFields, context: AnalysisContext) {
  const contactName = `${contact.firstName} ${contact.lastName || ''}`.trim();
  const currentDate = new Date().toISOString().split('T')[0];

  // Build available fields description
  const availableFieldsList = context.customFieldDefs.map((f) => `- ${f.id}: ${f.name}`).join('\n');

  // Build available tags list
  const availableTagsList =
    context.availableTags.length > 0 ? context.availableTags.map((t) => t.name).join(', ') : '(no tags defined yet)';

  // Build current values object
  const currentValues: Record<string, string | null | string[]> = {
    birthday: contact.birthday ? contact.birthday.toISOString().split('T')[0] : null,
    notes: contact.notes,
  };

  // Add custom field values
  for (const cf of contact.customFields) {
    currentValues[cf.fieldId] = cf.value;
  }

  // Add current tags
  const currentTags = contact.tags.map((t) => t.tag.name);
  currentValues['_currentTags'] = currentTags.length > 0 ? currentTags : null;

  return {
    conversationSnippet: snippet,
    contactName,
    currentDate,
    availableFields: availableFieldsList,
    availableTags: availableTagsList,
    currentValues: JSON.stringify(currentValues, null, 2),
  };
}

/**
 * Analyze a conversation snippet to extract contact information suggestions.
 */
export async function analyzeConversation(
  snippet: string,
  contact: ContactWithFields,
  context: AnalysisContext,
): Promise<{ result: SuggestedUpdates; prompt: string; rawResponse: string }> {
  const input = buildAnalysisInput(snippet, contact, context);

  // Build a readable prompt string for debugging
  const prompt = `Contact: ${input.contactName}
Date: ${input.currentDate}

Conversation:
${input.conversationSnippet}

Available Fields:
${input.availableFields}

Available Tags:
${input.availableTags}

Current Values:
${input.currentValues}`;

  try {
    const result = await b.ExtractContactInfo(input);

    // Stringify the result as the "raw response" for debugging
    const rawResponse = JSON.stringify(result, null, 2);

    return { result, prompt, rawResponse };
  } catch (error) {
    console.error('Error calling LLM for message analysis:', error);
    throw error;
  }
}

/**
 * Filter suggestions based on confidence threshold and whether they differ from current values.
 * Also validates that suggested tags exist in the available tags list.
 */
export function filterSuggestions(
  suggestions: SuggestedUpdates,
  contact: ContactWithFields,
  availableTags: Tag[],
  confidenceThreshold: number = config.messageAnalysis.confidenceThreshold,
): FilteredSuggestions {
  // Build current values map
  const currentValues: Record<string, string | null> = {
    birthday: contact.birthday ? contact.birthday.toISOString().split('T')[0] : null,
    notes: contact.notes,
  };

  for (const cf of contact.customFields) {
    currentValues[cf.fieldId] = cf.value;
  }

  // Build set of valid tag names (case-insensitive)
  const validTagNames = new Set(availableTags.map((t) => t.name.toLowerCase()));

  // Build set of currently assigned tags (case-insensitive)
  const currentTagNames = new Set(contact.tags.map((t) => t.tag.name.toLowerCase()));

  // Filter field suggestions by confidence and notable changes
  const fieldSuggestions = suggestions.fieldSuggestions.filter((suggestion) => {
    // Must meet confidence threshold
    if (suggestion.confidence < confidenceThreshold) {
      return false;
    }

    // Must be different from current value
    const currentValue = currentValues[suggestion.fieldId];
    if (currentValue === suggestion.suggestedValue) {
      return false;
    }

    // If current is null/empty and suggested is empty, skip
    if (!currentValue && !suggestion.suggestedValue) {
      return false;
    }

    return true;
  });

  // Filter tag suggestions by confidence, existence in available tags, and not already assigned
  const tagSuggestions = suggestions.tagSuggestions.filter((suggestion) => {
    // Must meet confidence threshold
    if (suggestion.confidence < confidenceThreshold) {
      return false;
    }

    // Must be an existing tag (case-insensitive check)
    if (!validTagNames.has(suggestion.tagName.toLowerCase())) {
      console.log(`Filtering out non-existent tag suggestion: ${suggestion.tagName}`);
      return false;
    }

    // Must not already be assigned to the contact
    if (currentTagNames.has(suggestion.tagName.toLowerCase())) {
      console.log(`Filtering out already-assigned tag: ${suggestion.tagName}`);
      return false;
    }

    return true;
  });

  const hasNotableUpdates = fieldSuggestions.length > 0 || tagSuggestions.length > 0;

  return {
    fieldSuggestions,
    tagSuggestions,
    hasNotableUpdates,
  };
}

/**
 * Analyze conversation and return filtered suggestions ready for storage.
 * This is the main entry point for analysis.
 */
export async function analyzeAndFilterConversation(
  snippet: string,
  contact: ContactWithFields,
  context: AnalysisContext,
): Promise<AnalysisResult> {
  const { result, prompt, rawResponse } = await analyzeConversation(snippet, contact, context);
  const suggestions = filterSuggestions(result, contact, context.availableTags);

  return {
    suggestions,
    llmPrompt: prompt,
    llmResponse: rawResponse,
  };
}
