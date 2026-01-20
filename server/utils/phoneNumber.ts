/**
 * Phone number normalization and formatting utilities
 *
 * Storage format: E.164 with + prefix (e.g., +15551234567)
 * Display format: (555) 123-4567 for US, +44 20 1234 5678 for international
 */

/**
 * Normalize a phone number to E.164 format for storage
 * Strips all non-digit characters and adds +1 for US numbers
 */
export function normalizePhoneNumber(phone: string): string {
	if (!phone) return '';

	// Remove all non-digit characters except leading +
	const hasPlus = phone.trim().startsWith('+');
	const digits = phone.replace(/\D/g, '');

	if (!digits) return '';

	// If it already had a + and has country code, keep it
	if (hasPlus && digits.length > 10) {
		return '+' + digits;
	}

	// US numbers: 10 digits or 11 digits starting with 1
	if (digits.length === 10) {
		return '+1' + digits;
	}

	if (digits.length === 11 && digits.startsWith('1')) {
		return '+' + digits;
	}

	// For other lengths, assume it's international if > 10 digits
	if (digits.length > 10) {
		return '+' + digits;
	}

	// Short numbers (< 10 digits) - store as-is with what we have
	// This handles cases like short codes or incomplete numbers
	return digits;
}

/**
 * Check if a normalized phone number is a US number (+1)
 */
export function isUSPhoneNumber(normalizedPhone: string): boolean {
	return normalizedPhone.startsWith('+1') && normalizedPhone.length === 12;
}

/**
 * Format a normalized phone number for display
 * US numbers: (555) 123-4567 (without +1)
 * International: +44 20 1234 5678 (with country code)
 */
export function formatPhoneForDisplay(normalizedPhone: string): string {
	if (!normalizedPhone) return '';

	// US number: format as (XXX) XXX-XXXX
	if (isUSPhoneNumber(normalizedPhone)) {
		const digits = normalizedPhone.slice(2); // Remove +1
		return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
	}

	// International number: keep the + and format with spaces
	if (normalizedPhone.startsWith('+')) {
		// Basic international formatting - group digits
		const digits = normalizedPhone.slice(1);
		// Country code (1-3 digits) + rest with spaces every 3-4 digits
		if (digits.length <= 4) {
			return normalizedPhone;
		}
		// Simple grouping: country code, then groups of 3-4
		const countryCode = digits.slice(0, digits.length > 11 ? 2 : 1);
		const rest = digits.slice(countryCode.length);
		const groups = rest.match(/.{1,4}/g) || [];
		return '+' + countryCode + ' ' + groups.join(' ');
	}

	// No + prefix, return as-is
	return normalizedPhone;
}
