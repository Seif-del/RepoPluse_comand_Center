'use strict';

const crypto = require('crypto');
const { encrypt, decrypt } = require('../../../../execution/crypto/encryptToken');

const VALID_KEY = crypto.randomBytes(32).toString('hex'); // 64-char hex

// ── encrypt — success ─────────────────────────────────────────────────────────

describe('encrypt — success', () => {
  it('returns a string', () => {
    expect(typeof encrypt('hello', VALID_KEY)).toBe('string');
  });

  it('returns a colon-delimited string with three parts', () => {
    const parts = encrypt('hello', VALID_KEY).split(':');
    expect(parts).toHaveLength(3);
  });

  it('IV part is 24 hex chars (12 bytes)', () => {
    const [iv] = encrypt('hello', VALID_KEY).split(':');
    expect(iv).toHaveLength(24);
  });

  it('auth tag part is 32 hex chars (16 bytes)', () => {
    const [, tag] = encrypt('hello', VALID_KEY).split(':');
    expect(tag).toHaveLength(32);
  });

  it('produces a different ciphertext each call (random IV)', () => {
    const a = encrypt('hello', VALID_KEY);
    const b = encrypt('hello', VALID_KEY);
    expect(a).not.toBe(b);
  });

  it('does not include the plaintext in the output', () => {
    const secret = 'super-secret-token';
    const enc = encrypt(secret, VALID_KEY);
    expect(enc).not.toContain(secret);
  });
});

// ── decrypt — round-trip ──────────────────────────────────────────────────────

describe('decrypt — round-trip', () => {
  it('decrypts back to the original plaintext', () => {
    const plaintext = 'gho_test_token_abc123';
    const enc = encrypt(plaintext, VALID_KEY);
    expect(decrypt(enc, VALID_KEY)).toBe(plaintext);
  });

  it('handles a long token string', () => {
    const token = 'x'.repeat(500);
    expect(decrypt(encrypt(token, VALID_KEY), VALID_KEY)).toBe(token);
  });

  it('handles unicode in the plaintext', () => {
    const token = 'héllo wörld 🎉';
    expect(decrypt(encrypt(token, VALID_KEY), VALID_KEY)).toBe(token);
  });
});

// ── decrypt — tamper detection ────────────────────────────────────────────────

describe('decrypt — tamper detection', () => {
  it('throws when ciphertext is modified', () => {
    const enc = encrypt('secret', VALID_KEY);
    const parts = enc.split(':');
    // Flip last char of ciphertext
    const tampered = parts[0] + ':' + parts[1] + ':' + parts[2].slice(0, -1) + 'f';
    expect(() => decrypt(tampered, VALID_KEY)).toThrow();
  });

  it('throws when auth tag is modified', () => {
    const enc = encrypt('secret', VALID_KEY);
    const parts = enc.split(':');
    const tampered = parts[0] + ':' + parts[1].replace(/.$/, 'f') + ':' + parts[2];
    expect(() => decrypt(tampered, VALID_KEY)).toThrow();
  });

  it('throws when the wrong key is used', () => {
    const enc = encrypt('secret', VALID_KEY);
    const wrongKey = crypto.randomBytes(32).toString('hex');
    expect(() => decrypt(enc, wrongKey)).toThrow();
  });
});

// ── encrypt — INVALID_PLAINTEXT ───────────────────────────────────────────────

describe('encrypt — INVALID_PLAINTEXT', () => {
  it('throws INVALID_PLAINTEXT for empty string', () => {
    expect(() => encrypt('', VALID_KEY)).toThrow(expect.objectContaining({ code: 'INVALID_PLAINTEXT' }));
  });

  it('throws INVALID_PLAINTEXT for null', () => {
    expect(() => encrypt(null, VALID_KEY)).toThrow(expect.objectContaining({ code: 'INVALID_PLAINTEXT' }));
  });
});

// ── INVALID_ENCRYPTION_KEY ────────────────────────────────────────────────────

describe('encrypt/decrypt — INVALID_ENCRYPTION_KEY', () => {
  it('throws INVALID_ENCRYPTION_KEY when key is too short', () => {
    expect(() => encrypt('hello', 'abc')).toThrow(expect.objectContaining({ code: 'INVALID_ENCRYPTION_KEY' }));
  });

  it('throws INVALID_ENCRYPTION_KEY when key is too long', () => {
    expect(() => encrypt('hello', VALID_KEY + 'ff')).toThrow(expect.objectContaining({ code: 'INVALID_ENCRYPTION_KEY' }));
  });

  it('throws INVALID_ENCRYPTION_KEY when key is null', () => {
    expect(() => encrypt('hello', null)).toThrow(expect.objectContaining({ code: 'INVALID_ENCRYPTION_KEY' }));
  });

  it('throws INVALID_ENCRYPTION_KEY for decrypt with invalid key', () => {
    const enc = encrypt('hello', VALID_KEY);
    expect(() => decrypt(enc, 'short')).toThrow(expect.objectContaining({ code: 'INVALID_ENCRYPTION_KEY' }));
  });
});

// ── decrypt — INVALID_CIPHERTEXT ─────────────────────────────────────────────

describe('decrypt — INVALID_CIPHERTEXT', () => {
  it('throws INVALID_CIPHERTEXT for non-string input', () => {
    expect(() => decrypt(null, VALID_KEY)).toThrow(expect.objectContaining({ code: 'INVALID_CIPHERTEXT' }));
  });

  it('throws INVALID_CIPHERTEXT for string without colons', () => {
    expect(() => decrypt('notvalid', VALID_KEY)).toThrow(expect.objectContaining({ code: 'INVALID_CIPHERTEXT' }));
  });

  it('throws INVALID_CIPHERTEXT for string with only two parts', () => {
    expect(() => decrypt('a:b', VALID_KEY)).toThrow(expect.objectContaining({ code: 'INVALID_CIPHERTEXT' }));
  });
});
