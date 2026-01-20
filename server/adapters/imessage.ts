import Database from 'better-sqlite3';
import path from 'path';

export interface Message {
	userId: string;
	message: string;
	date: string;
	service: string;
	destinationCallerId: string;
	isFromMe: boolean;
}

const IMESSAGE_DB_PATH = path.join(process.cwd(), 'iMessage-Data.sqlite');

let db: Database.Database | null = null;

function getDb(): Database.Database {
	if (!db) {
		try {
			db = new Database(IMESSAGE_DB_PATH, { readonly: true });
		} catch (error) {
			throw new Error(`Failed to open iMessage database: ${error}`);
		}
	}
	return db;
}

function normalizePhoneNumber(phone: string): string {
	// Remove all non-digit characters except leading +
	const hasPlus = phone.startsWith('+');
	const digits = phone.replace(/\D/g, '');
	return hasPlus ? `+${digits}` : digits;
}

export function getMessagesByPhoneNumber(phoneNumber: string, limit = 50): Message[] {
	const database = getDb();
	const normalized = normalizePhoneNumber(phoneNumber);

	// Try matching with and without + prefix
	const variants = [normalized];
	if (!normalized.startsWith('+')) {
		variants.push(`+${normalized}`);
		variants.push(`+1${normalized}`); // US country code
	}

	const placeholders = variants.map(() => '?').join(', ');
	const stmt = database.prepare(`
		SELECT
			user_id as userId,
			message,
			date,
			service,
			destination_caller_id as destinationCallerId,
			is_from_me as isFromMe
		FROM Messages
		WHERE user_id IN (${placeholders})
		ORDER BY date DESC
		LIMIT ?
	`);

	const rows = stmt.all(...variants, limit) as Array<{
		userId: string;
		message: string;
		date: string;
		service: string;
		destinationCallerId: string;
		isFromMe: string;
	}>;

	return rows.map((row) => ({
		...row,
		isFromMe: row.isFromMe === '1',
	}));
}

/**
 * Get the most recent message date for a phone number
 * Returns null if no messages found
 */
export function getLastContactedDate(phoneNumber: string): Date | null {
	const database = getDb();
	const normalized = normalizePhoneNumber(phoneNumber);

	// Try matching with and without + prefix
	const variants = [normalized];
	if (!normalized.startsWith('+')) {
		variants.push(`+${normalized}`);
		variants.push(`+1${normalized}`); // US country code
	}

	const placeholders = variants.map(() => '?').join(', ');
	const stmt = database.prepare(`
		SELECT MAX(date) as lastDate
		FROM Messages
		WHERE user_id IN (${placeholders})
	`);

	const row = stmt.get(...variants) as { lastDate: string | null } | undefined;

	if (!row?.lastDate) {
		return null;
	}

	return new Date(row.lastDate);
}

/**
 * Get last contacted dates for multiple phone numbers in a single query
 * Returns a map of normalized phone number to last contacted date
 */
export function getLastContactedDatesForPhones(phoneNumbers: string[]): Map<string, Date> {
	if (phoneNumbers.length === 0) {
		return new Map();
	}

	const database = getDb();

	// Build all variants for all phone numbers
	const variantToOriginal = new Map<string, string>();
	for (const phone of phoneNumbers) {
		const normalized = normalizePhoneNumber(phone);
		variantToOriginal.set(normalized, phone);
		if (!normalized.startsWith('+')) {
			variantToOriginal.set(`+${normalized}`, phone);
			variantToOriginal.set(`+1${normalized}`, phone);
		}
	}

	const allVariants = Array.from(variantToOriginal.keys());
	const placeholders = allVariants.map(() => '?').join(', ');

	const stmt = database.prepare(`
		SELECT user_id as userId, MAX(date) as lastDate
		FROM Messages
		WHERE user_id IN (${placeholders})
		GROUP BY user_id
	`);

	const rows = stmt.all(...allVariants) as Array<{ userId: string; lastDate: string }>;

	// Map results back to original phone numbers
	const result = new Map<string, Date>();
	for (const row of rows) {
		const originalPhone = variantToOriginal.get(row.userId);
		if (originalPhone && row.lastDate) {
			const date = new Date(row.lastDate);
			// Keep the most recent date if multiple variants match
			const existing = result.get(originalPhone);
			if (!existing || date > existing) {
				result.set(originalPhone, date);
			}
		}
	}

	return result;
}

export function closeDb(): void {
	if (db) {
		db.close();
		db = null;
	}
}
