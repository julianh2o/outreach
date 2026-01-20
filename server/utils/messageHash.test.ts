import { describe, it, expect } from 'vitest';
import { generateMessageHash, parseMessageHash } from './messageHash';

describe('generateMessageHash', () => {
  it('generates a deterministic hash for the same input', () => {
    const hash1 = generateMessageHash('+12025551234', true, '2025-01-18 10:30:00', 'Hello world');
    const hash2 = generateMessageHash('+12025551234', true, '2025-01-18 10:30:00', 'Hello world');

    expect(hash1).toBe(hash2);
  });

  it('includes phone number in the hash', () => {
    const hash = generateMessageHash('+12025551234', true, '2025-01-18 10:30:00', 'Hello');

    expect(hash).toContain('+12025551234');
  });

  it('uses "out" for outgoing messages', () => {
    const hash = generateMessageHash('+12025551234', true, '2025-01-18 10:30:00', 'Hello');

    expect(hash).toContain(':out:');
  });

  it('uses "in" for incoming messages', () => {
    const hash = generateMessageHash('+12025551234', false, '2025-01-18 10:30:00', 'Hello');

    expect(hash).toContain(':in:');
  });

  it('includes timestamp in the hash', () => {
    const hash = generateMessageHash('+12025551234', true, '2025-01-18 10:30:00', 'Hello');

    expect(hash).toContain('2025-01-18 10:30:00');
  });

  it('generates different hashes for different content', () => {
    const hash1 = generateMessageHash('+12025551234', true, '2025-01-18 10:30:00', 'Hello');
    const hash2 = generateMessageHash('+12025551234', true, '2025-01-18 10:30:00', 'Goodbye');

    expect(hash1).not.toBe(hash2);
  });

  it('generates different hashes for different directions', () => {
    const hash1 = generateMessageHash('+12025551234', true, '2025-01-18 10:30:00', 'Hello');
    const hash2 = generateMessageHash('+12025551234', false, '2025-01-18 10:30:00', 'Hello');

    expect(hash1).not.toBe(hash2);
  });

  it('generates different hashes for different timestamps', () => {
    const hash1 = generateMessageHash('+12025551234', true, '2025-01-18 10:30:00', 'Hello');
    const hash2 = generateMessageHash('+12025551234', true, '2025-01-18 10:31:00', 'Hello');

    expect(hash1).not.toBe(hash2);
  });

  it('generates different hashes for different phone numbers', () => {
    const hash1 = generateMessageHash('+12025551234', true, '2025-01-18 10:30:00', 'Hello');
    const hash2 = generateMessageHash('+12025559999', true, '2025-01-18 10:30:00', 'Hello');

    expect(hash1).not.toBe(hash2);
  });

  it('generates a 4-character content hash suffix', () => {
    const hash = generateMessageHash('+12025551234', true, '2025-01-18 10:30:00', 'Hello');
    const parts = hash.split(':');
    const contentHash = parts[parts.length - 1];

    expect(contentHash).toHaveLength(4);
  });
});

describe('parseMessageHash', () => {
  it('parses a valid hash correctly', () => {
    const hash = generateMessageHash('+12025551234', true, '2025-01-18 10:30:00', 'Hello');
    const parsed = parseMessageHash(hash);

    expect(parsed).not.toBeNull();
    expect(parsed?.phoneNumber).toBe('+12025551234');
    expect(parsed?.direction).toBe('out');
    expect(parsed?.timestamp).toBe('2025-01-18 10:30:00');
    expect(parsed?.contentHash).toHaveLength(4);
  });

  it('parses incoming message hash correctly', () => {
    const hash = generateMessageHash('+12025551234', false, '2025-01-18 10:30:00', 'Hello');
    const parsed = parseMessageHash(hash);

    expect(parsed?.direction).toBe('in');
  });

  it('handles timestamps with colons', () => {
    const hash = generateMessageHash('+12025551234', true, '2025-01-18T10:30:00Z', 'Hello');
    const parsed = parseMessageHash(hash);

    expect(parsed?.timestamp).toBe('2025-01-18T10:30:00Z');
  });

  it('returns null for invalid hash with too few parts', () => {
    const parsed = parseMessageHash('invalid:hash');

    expect(parsed).toBeNull();
  });

  it('returns null for invalid direction', () => {
    const parsed = parseMessageHash('+12025551234:invalid:2025-01-18:abcd');

    expect(parsed).toBeNull();
  });
});
