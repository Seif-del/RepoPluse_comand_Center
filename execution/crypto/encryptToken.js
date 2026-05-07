'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES  = 12;

function _keyBuffer(hexKey) {
  if (typeof hexKey !== 'string' || hexKey.length !== 64) {
    const err = new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    err.code = 'INVALID_ENCRYPTION_KEY';
    throw err;
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Returns a colon-delimited hex string: iv:authTag:ciphertext
 */
function encrypt(plaintext, hexKey) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    const err = new Error('plaintext must be a non-empty string');
    err.code = 'INVALID_PLAINTEXT';
    throw err;
  }
  const key    = _keyBuffer(hexKey);
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a string produced by encrypt().
 * Throws if the ciphertext is tampered or the key is wrong.
 */
function decrypt(ciphertext, hexKey) {
  if (typeof ciphertext !== 'string') {
    const err = new Error('ciphertext must be a string');
    err.code = 'INVALID_CIPHERTEXT';
    throw err;
  }
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    const err = new Error('ciphertext format is invalid — expected iv:tag:data');
    err.code = 'INVALID_CIPHERTEXT';
    throw err;
  }
  const [ivHex, tagHex, dataHex] = parts;
  const key      = _keyBuffer(hexKey);
  const iv       = Buffer.from(ivHex, 'hex');
  const tag      = Buffer.from(tagHex, 'hex');
  const data     = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
