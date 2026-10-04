import crypto from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { env } from '../env.js';

const IV_LENGTH_BYTES = 12; // 96 bits recommended for AES-GCM
const TAG_LENGTH_BYTES = 16; // 128 bits auth tag
const KEY_LENGTH_BYTES = 32; // 256 bits

/**
 * Resolves the 32-byte hex encryption key for a given keyId version.
 */
function resolveEncryptionKey(keyId: string): string | undefined {
  const envVarName = `ENC_KEY_${keyId.toUpperCase()}`;
  return process.env[envVarName] || (keyId === 'v1' ? env.ENC_KEY_V1 : undefined);
}

/**
 * Converts a 32-byte key to a Buffer. Accepts 64-char hex or base64
 * (as emitted by scripts/gen-key.ts); either must decode to exactly 32 bytes.
 */
function parseKey(keyStr: string): Buffer {
  if (typeof keyStr !== 'string') {
    throw new AppError('internal', 'Encryption key must be a string');
  }
  const isHex = keyStr.length === KEY_LENGTH_BYTES * 2 && /^[0-9a-fA-F]+$/.test(keyStr);
  const buf = isHex ? Buffer.from(keyStr, 'hex') : Buffer.from(keyStr, 'base64');
  if (buf.length !== KEY_LENGTH_BYTES) {
    throw new AppError(
      'internal',
      'Encryption key must be 32 bytes (64 hex characters or 44-char base64)',
    );
  }
  return buf;
}

/**
 * Encrypts a string or structured object into keyId.base64(iv + tag + ciphertext) format (D-05, D-07).
 */
export function encryptTarget(
  value: string | object,
  keyHex?: string,
  keyId: string = 'v1',
): string {
  const activeKeyHex = keyHex || resolveEncryptionKey(keyId);
  if (!activeKeyHex) {
    throw new AppError('internal', `Missing encryption key for version ${keyId}`);
  }

  const key = parseKey(activeKeyHex);
  const plaintext = typeof value === 'string' ? value : JSON.stringify(value);

  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, tag, ciphertext]);
  return `${keyId}.${combined.toString('base64')}`;
}

/**
 * Decrypts a keyId.base64(iv + tag + ciphertext) payload into the original plaintext string (D-05, D-06).
 */
export function decryptTarget(
  encrypted: string,
  customKeyResolver?: (keyId: string) => string | undefined,
): string {
  const dotIndex = encrypted.indexOf('.');
  if (dotIndex === -1) {
    throw new AppError('internal', 'Invalid encrypted payload format');
  }

  const keyId = encrypted.slice(0, dotIndex);
  const b64Payload = encrypted.slice(dotIndex + 1);

  const keyHex = customKeyResolver ? customKeyResolver(keyId) : resolveEncryptionKey(keyId);
  if (!keyHex) {
    throw new AppError('internal', `Missing encryption key for version ${keyId}`);
  }

  const key = parseKey(keyHex);
  const buffer = Buffer.from(b64Payload, 'base64');

  if (buffer.length < IV_LENGTH_BYTES + TAG_LENGTH_BYTES) {
    throw new AppError('internal', 'Corrupted ciphertext payload: insufficient buffer length');
  }

  const iv = buffer.subarray(0, IV_LENGTH_BYTES);
  const tag = buffer.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + TAG_LENGTH_BYTES);
  const ciphertext = buffer.subarray(IV_LENGTH_BYTES + TAG_LENGTH_BYTES);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new AppError('internal', 'Decryption failed: corrupted data or invalid authentication tag');
  }
}

/**
 * Decrypts an encrypted target payload and parses the resulting string as JSON (D-07).
 */
export function decryptTargetJson<T>(
  encrypted: string,
  customKeyResolver?: (keyId: string) => string | undefined,
): T {
  const decrypted = decryptTarget(encrypted, customKeyResolver);
  try {
    return JSON.parse(decrypted) as T;
  } catch {
    throw new AppError('internal', 'Decrypted target payload is not valid JSON');
  }
}

/**
 * Generates a cryptographically secure random hex secret (D-08).
 */
export function generateSigningSecret(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Computes an HMAC-SHA256 signature over ${timestamp}.${payload} (D-08).
 */
export function signWebhookPayload(secret: string, payload: string, timestamp: number): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${payload}`);
  return hmac.digest('hex');
}

/**
 * Computes a deterministic SHA-256 hash digest of a token string (D-08).
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
