'use strict';

const { hashToken } = require('../../../../execution/auth/hashToken');

describe('hashToken', () => {
  describe('valid input', () => {
    it('returns a string', () => {
      expect(typeof hashToken('abc123')).toBe('string');
    });

    it('returns exactly 64 characters', () => {
      expect(hashToken('abc123')).toHaveLength(64);
    });

    it('returns only lowercase hexadecimal characters', () => {
      expect(hashToken('abc123')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic — same input produces the same output', () => {
      const token = 'session-token-xyz';
      expect(hashToken(token)).toBe(hashToken(token));
    });

    it('produces different outputs for different inputs', () => {
      expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
    });

    it('produces the expected SHA-256 digest for a known input', () => {
      // echo -n "hello" | sha256sum  →  2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
      expect(hashToken('hello')).toBe(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      );
    });

    it('does not mutate the input', () => {
      const token = 'immutable-token';
      const snapshot = token;
      hashToken(token);
      expect(token).toBe(snapshot);
    });
  });

  describe('empty and whitespace input', () => {
    it('throws on an empty string', () => {
      expect(() => hashToken('')).toThrow('rawToken must not be empty');
    });

    it('throws with code EMPTY_TOKEN on an empty string', () => {
      let caught;
      try { hashToken(''); } catch (err) { caught = err; }
      expect(caught.code).toBe('EMPTY_TOKEN');
    });

    it('throws on a whitespace-only string', () => {
      expect(() => hashToken('   ')).toThrow('rawToken must not be empty');
    });

    it('throws with code EMPTY_TOKEN on a whitespace-only string', () => {
      let caught;
      try { hashToken('\t\n'); } catch (err) { caught = err; }
      expect(caught.code).toBe('EMPTY_TOKEN');
    });
  });

  describe('non-string input', () => {
    const nonStrings = [null, undefined, 0, 42, true, false, {}, [], Symbol('t')];

    nonStrings.forEach((value) => {
      it(`throws on ${String(value)} (${typeof value})`, () => {
        expect(() => hashToken(value)).toThrow('rawToken must be a string');
      });

      it(`throws with code INVALID_TOKEN_TYPE on ${String(value)}`, () => {
        let caught;
        try { hashToken(value); } catch (err) { caught = err; }
        expect(caught.code).toBe('INVALID_TOKEN_TYPE');
      });
    });
  });
});
