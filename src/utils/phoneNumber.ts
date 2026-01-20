/**
 * Phone number formatting utilities for display
 *
 * Storage format: E.164 with + prefix (e.g., +15551234567)
 * Display format: (555) 123-4567 for US, +44 20 1234 5678 for international
 */

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
export function formatPhoneForDisplay(phone: string): string {
  if (!phone) return '';

  // US number: format as (XXX) XXX-XXXX
  if (isUSPhoneNumber(phone)) {
    const digits = phone.slice(2); // Remove +1
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // International number: keep the + and format with spaces
  if (phone.startsWith('+')) {
    const digits = phone.slice(1);
    // Country code (1-3 digits) + rest with spaces every 3-4 digits
    if (digits.length <= 4) {
      return phone;
    }
    const countryCode = digits.slice(0, digits.length > 11 ? 2 : 1);
    const rest = digits.slice(countryCode.length);
    const groups = rest.match(/.{1,4}/g) || [];
    return '+' + countryCode + ' ' + groups.join(' ');
  }

  // No + prefix (legacy data or short codes), return as-is
  return phone;
}
