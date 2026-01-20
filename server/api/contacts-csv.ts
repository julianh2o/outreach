import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { normalizePhoneNumber } from '../utils/phoneNumber';

const router = Router();

// CSV column headers - order matters for export/import consistency
const BASIC_FIELDS = [
	'firstName',
	'lastName',
	'birthday',
	'notes',
	'outreachFrequencyDays',
	'preferredContactMethod',
	'tags',
];

const CHANNEL_TYPES = ['phone', 'email', 'address', 'discord', 'instagram', 'facebook_messenger'];

// Helper to escape CSV values
function escapeCSV(value: string | null | undefined): string {
	if (value === null || value === undefined) return '';
	const str = String(value);
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

// Helper to parse CSV values
function parseCSV(value: string): string {
	if (!value) return '';
	let result = value;
	// Remove surrounding quotes and unescape double quotes
	if (result.startsWith('"') && result.endsWith('"')) {
		result = result.slice(1, -1).replace(/""/g, '"');
	}
	// Convert \n escape sequences to actual newlines
	result = result.replace(/\\n/g, '\n');
	return result;
}

// Parse entire CSV content into rows, properly handling newlines within quoted fields
function parseCSVRows(csv: string): string[][] {
	const rows: string[][] = [];
	let currentRow: string[] = [];
	let currentField = '';
	let inQuotes = false;

	for (let i = 0; i < csv.length; i++) {
		const char = csv[i];
		const nextChar = csv[i + 1];

		if (inQuotes) {
			if (char === '"' && nextChar === '"') {
				// Escaped quote
				currentField += '"';
				i++; // Skip next quote
			} else if (char === '"') {
				// End of quoted field
				inQuotes = false;
			} else {
				// Include character (including newlines) in field
				currentField += char;
			}
		} else {
			if (char === '"') {
				// Start of quoted field
				inQuotes = true;
			} else if (char === ',') {
				// End of field
				currentRow.push(currentField.trim());
				currentField = '';
			} else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
				// End of row
				if (char === '\r') i++; // Skip \n in \r\n
				currentRow.push(currentField.trim());
				if (currentRow.some((field) => field !== '')) {
					rows.push(currentRow);
				}
				currentRow = [];
				currentField = '';
			} else if (char === '\r') {
				// Standalone \r as newline
				currentRow.push(currentField.trim());
				if (currentRow.some((field) => field !== '')) {
					rows.push(currentRow);
				}
				currentRow = [];
				currentField = '';
			} else {
				currentField += char;
			}
		}
	}

	// Handle last field/row if no trailing newline
	currentRow.push(currentField.trim());
	if (currentRow.some((field) => field !== '')) {
		rows.push(currentRow);
	}

	return rows;
}

// GET /api/contacts/csv/export - Export contacts as CSV
router.get('/export', async (_req: Request, res: Response) => {
	try {
		const [contacts, customFieldDefs] = await Promise.all([
			prisma.contact.findMany({
				include: {
					channels: true,
					tags: { include: { tag: true } },
					customFields: { include: { field: true } },
				},
				orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
			}),
			prisma.customFieldDefinition.findMany({ orderBy: { sortOrder: 'asc' } }),
		]);

		// Build headers
		const headers = [...BASIC_FIELDS];

		// Add channel headers (type_identifier, type_label, type_isPrimary, plus address fields)
		for (const type of CHANNEL_TYPES) {
			headers.push(`${type}_identifier`, `${type}_label`, `${type}_isPrimary`);
			if (type === 'address') {
				headers.push(
					'address_street1',
					'address_street2',
					'address_city',
					'address_state',
					'address_zip',
					'address_country',
				);
			}
		}

		// Add custom field headers
		for (const cf of customFieldDefs) {
			headers.push(`cf_${cf.id}`);
		}

		// Build rows
		const rows: string[][] = [];
		for (const contact of contacts) {
			const row: string[] = [];

			// Basic fields
			row.push(escapeCSV(contact.firstName));
			row.push(escapeCSV(contact.lastName));
			row.push(escapeCSV(contact.birthday ? contact.birthday.toISOString().split('T')[0] : ''));
			row.push(escapeCSV(contact.notes));
			row.push(escapeCSV(contact.outreachFrequencyDays?.toString()));
			row.push(escapeCSV(contact.preferredContactMethod));
			row.push(escapeCSV(contact.tags.map((t) => t.tag.name).join(';')));

			// Channel fields
			for (const type of CHANNEL_TYPES) {
				const channel = contact.channels.find((c) => c.type === type);
				row.push(escapeCSV(channel?.identifier));
				row.push(escapeCSV(channel?.label));
				row.push(channel?.isPrimary ? 'true' : '');
				if (type === 'address') {
					row.push(escapeCSV(channel?.street1));
					row.push(escapeCSV(channel?.street2));
					row.push(escapeCSV(channel?.city));
					row.push(escapeCSV(channel?.state));
					row.push(escapeCSV(channel?.zip));
					row.push(escapeCSV(channel?.country));
				}
			}

			// Custom fields
			for (const cf of customFieldDefs) {
				const value = contact.customFields.find((f) => f.fieldId === cf.id);
				row.push(escapeCSV(value?.value));
			}

			rows.push(row);
		}

		// Generate CSV content
		const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
		res.send(csv);
	} catch (error) {
		console.error('Error exporting contacts:', error);
		res.status(500).json({ error: 'Failed to export contacts' });
	}
});

// GET /api/contacts/csv/template - Download sample CSV template
router.get('/template', async (_req: Request, res: Response) => {
	try {
		const customFieldDefs = await prisma.customFieldDefinition.findMany({
			orderBy: { sortOrder: 'asc' },
		});

		// Build headers
		const headers = [...BASIC_FIELDS];

		for (const type of CHANNEL_TYPES) {
			headers.push(`${type}_identifier`, `${type}_label`, `${type}_isPrimary`);
			if (type === 'address') {
				headers.push(
					'address_street1',
					'address_street2',
					'address_city',
					'address_state',
					'address_zip',
					'address_country',
				);
			}
		}

		for (const cf of customFieldDefs) {
			headers.push(`cf_${cf.id}`);
		}

		// Create sample rows dynamically based on headers length
		const baseFieldCount = headers.length - customFieldDefs.length; // Fields before custom fields

		// Row 1: Full example with all channel types filled
		const row1: string[] = [
			'John', // firstName
			'Doe', // lastName
			'1990-05-15', // birthday
			'Met at conference 2024', // notes
			'30', // outreachFrequencyDays
			'phone', // preferredContactMethod
			'Friend;Coworker', // tags
			// phone
			'555-123-4567',
			'Mobile',
			'true',
			// email
			'john.doe@example.com',
			'Work',
			'true',
			// address
			'',
			'Home',
			'',
			'123 Main St',
			'Apt 4B',
			'New York',
			'NY',
			'10001',
			'USA',
			// discord
			'johndoe#1234',
			'',
			'',
			// instagram
			'@johndoe',
			'Personal',
			'',
			// facebook_messenger
			'johndoe',
			'',
			'',
		];
		// Pad row1 to baseFieldCount if needed, then add custom field placeholders
		while (row1.length < baseFieldCount) {
			row1.push('');
		}
		for (const _cf of customFieldDefs) {
			row1.push('');
		}

		// Row 2: Minimal example
		const row2: string[] = [
			'Jane', // firstName
			'Smith', // lastName
			'', // birthday
			'', // notes
			'', // outreachFrequencyDays
			'', // preferredContactMethod
			'', // tags
			// phone
			'555-987-6543',
			'',
			'',
			// email
			'jane@example.com',
			'',
			'true',
		];
		// Pad to full header length
		while (row2.length < headers.length) {
			row2.push('');
		}

		const sampleRows = [row1, row2];

		// Generate CSV content
		const csv = [headers.join(','), ...sampleRows.map((r) => r.slice(0, headers.length).join(','))].join('\n');

		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', 'attachment; filename="contacts_template.csv"');
		res.send(csv);
	} catch (error) {
		console.error('Error generating template:', error);
		res.status(500).json({ error: 'Failed to generate template' });
	}
});

// POST /api/contacts/csv/import - Import contacts from CSV
router.post('/import', async (req: Request, res: Response) => {
	try {
		const { csv } = req.body;
		if (!csv || typeof csv !== 'string') {
			res.status(400).json({ error: 'CSV data is required' });
			return;
		}

		const rows = parseCSVRows(csv);
		if (rows.length < 2) {
			res.status(400).json({ error: 'CSV must have headers and at least one data row' });
			return;
		}

		const headers = rows[0];
		const customFieldDefs = await prisma.customFieldDefinition.findMany();
		const customFieldMap = new Map(customFieldDefs.map((cf) => [cf.id, cf]));

		const results = {
			imported: 0,
			errors: [] as string[],
		};

		for (let i = 1; i < rows.length; i++) {
			try {
				const values = rows[i];
				const data: Record<string, string> = {};

				for (let j = 0; j < headers.length; j++) {
					data[headers[j]] = parseCSV(values[j] || '');
				}

				// Validate required field
				if (!data.firstName?.trim()) {
					results.errors.push(`Row ${i + 1}: firstName is required`);
					continue;
				}

				// Parse tags
				const tagNames = data.tags
					? data.tags
							.split(';')
							.map((t) => t.trim())
							.filter(Boolean)
					: [];

				// Create or find tags
				const tagIds: string[] = [];
				for (const tagName of tagNames) {
					let tag = await prisma.tag.findUnique({ where: { name: tagName } });
					if (!tag) {
						tag = await prisma.tag.create({ data: { name: tagName } });
					}
					tagIds.push(tag.id);
				}

				// Build channels array
				const channels: {
					type: string;
					identifier: string;
					label?: string;
					isPrimary: boolean;
					street1?: string;
					street2?: string;
					city?: string;
					state?: string;
					zip?: string;
					country?: string;
				}[] = [];

				for (const type of CHANNEL_TYPES) {
					const identifier = data[`${type}_identifier`];
					if (identifier?.trim()) {
						// Normalize phone numbers to E.164 format
						const normalizedIdentifier = type === 'phone' ? normalizePhoneNumber(identifier.trim()) : identifier.trim();

						const channel: (typeof channels)[0] = {
							type,
							identifier: normalizedIdentifier,
							label: data[`${type}_label`] || undefined,
							isPrimary: data[`${type}_isPrimary`]?.toLowerCase() === 'true',
						};
						if (type === 'address') {
							channel.street1 = data['address_street1'] || undefined;
							channel.street2 = data['address_street2'] || undefined;
							channel.city = data['address_city'] || undefined;
							channel.state = data['address_state'] || undefined;
							channel.zip = data['address_zip'] || undefined;
							channel.country = data['address_country'] || undefined;
						}
						channels.push(channel);
					}
				}

				// Build custom fields array
				const customFields: { fieldId: string; value: string }[] = [];
				for (const [key, value] of Object.entries(data)) {
					if (key.startsWith('cf_') && value?.trim()) {
						const fieldId = key.slice(3);
						if (customFieldMap.has(fieldId)) {
							customFields.push({ fieldId, value: value.trim() });
						}
					}
				}

				// Create contact
				await prisma.contact.create({
					data: {
						firstName: data.firstName.trim(),
						lastName: data.lastName?.trim() || null,
						birthday: data.birthday ? new Date(data.birthday) : null,
						notes: data.notes?.trim() || null,
						outreachFrequencyDays: data.outreachFrequencyDays ? parseInt(data.outreachFrequencyDays) : null,
						preferredContactMethod: data.preferredContactMethod?.trim() || null,
						channels: { create: channels },
						tags: { create: tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) },
						customFields: { create: customFields },
					},
				});

				results.imported++;
			} catch (rowError) {
				results.errors.push(`Row ${i + 1}: ${rowError instanceof Error ? rowError.message : 'Unknown error'}`);
			}
		}

		res.json(results);
	} catch (error) {
		console.error('Error importing contacts:', error);
		res.status(500).json({ error: 'Failed to import contacts' });
	}
});

export default router;
