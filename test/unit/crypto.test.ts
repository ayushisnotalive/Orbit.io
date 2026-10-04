import { describe, it, expect } from 'vitest';
import {
  encryptTarget,
  decryptTarget,
  decryptTargetJson,
  generateSigningSecret,
  signWebhookPayload,
  hashToken,
} from '../../src/security/crypto.js';
import { AppError } from '../../src/lib/errors.js';

describe('Cryptographic Security Module (src/security/crypto.ts)', () => {
  const TEST_KEY_V1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const TEST_KEY_V2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

  describe('encryptTarget & decryptTarget', () => {
    it('encrypts and decrypts a plain string target correctly', () => {
      const plaintext = 'https://discord.com/api/webhooks/123/xyz';
      const encrypted = encryptTarget(plaintext, TEST_KEY_V1, 'v1');

      expect(encrypted).toMatch(/^v1\.[A-Za-z0-9+/=]+$/);

      const decrypted = decryptTarget(encrypted, () => TEST_KEY_V1);
      expect(decrypted).toBe(plaintext);
    });

    it('generates distinct IVs and ciphertexts for identical plaintext', () => {
      const plaintext = 'https://api.telegram.org/bot123/sendMessage';
      const enc1 = encryptTarget(plaintext, TEST_KEY_V1, 'v1');
      const enc2 = encryptTarget(plaintext, TEST_KEY_V1, 'v1');

      expect(enc1).not.toBe(enc2);
      expect(decryptTarget(enc1, () => TEST_KEY_V1)).toBe(plaintext);
      expect(decryptTarget(enc2, () => TEST_KEY_V1)).toBe(plaintext);
    });

    it('throws AppError internal on tampered ciphertext or altered auth tag', () => {
      const plaintext = 'test-secret';
      const encrypted = encryptTarget(plaintext, TEST_KEY_V1, 'v1');
      const [keyId, b64] = encrypted.split('.');
      const buf = Buffer.from(b64, 'base64');

      // Flip a bit in the ciphertext / auth tag
      buf[buf.length - 1] ^= 0xff;
      const tampered = `${keyId}.${buf.toString('base64')}`;

      expect(() => decryptTarget(tampered, () => TEST_KEY_V1)).toThrowError(AppError);
      try {
        decryptTarget(tampered, () => TEST_KEY_V1);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('internal');
      }
    });

    it('rejects invalid key lengths with AppError internal', () => {
      expect(() => encryptTarget('test', 'short-key', 'v1')).toThrowError(AppError);
    });
  });

  describe('decryptTargetJson (polymorphic JSON serialization)', () => {
    it('serializes and deserializes structured target objects transparently', () => {
      const targetObj = {
        url: 'https://example.com/webhook',
        headers: { Authorization: 'Bearer token-123' },
        timeoutMs: 5000,
      };

      const encrypted = encryptTarget(targetObj, TEST_KEY_V1, 'v1');
      const decrypted = decryptTargetJson<typeof targetObj>(encrypted, () => TEST_KEY_V1);

      expect(decrypted).toEqual(targetObj);
      expect(decrypted.url).toBe(targetObj.url);
      expect(decrypted.headers.Authorization).toBe('Bearer token-123');
    });

    it('throws AppError internal if decrypted string is not valid JSON', () => {
      const encrypted = encryptTarget('plain-non-json-string', TEST_KEY_V1, 'v1');
      expect(() => decryptTargetJson(encrypted, () => TEST_KEY_V1)).toThrowError(AppError);
    });
  });

  describe('Key rotation & version lookup', () => {
    it('decrypts payloads with different version prefixes using key resolver', () => {
      const msg1 = 'message for v1';
      const msg2 = 'message for v2';

      const enc1 = encryptTarget(msg1, TEST_KEY_V1, 'v1');
      const enc2 = encryptTarget(msg2, TEST_KEY_V2, 'v2');

      const resolver = (keyId: string) => {
        if (keyId === 'v1') return TEST_KEY_V1;
        if (keyId === 'v2') return TEST_KEY_V2;
        return undefined;
      };

      expect(decryptTarget(enc1, resolver)).toBe(msg1);
      expect(decryptTarget(enc2, resolver)).toBe(msg2);
    });

    it('throws AppError internal when requested key version is missing', () => {
      const enc = encryptTarget('secret', TEST_KEY_V1, 'v99');
      const resolver = () => undefined;

      expect(() => decryptTarget(enc, resolver)).toThrowError(AppError);
      try {
        decryptTarget(enc, resolver);
      } catch (err) {
        expect((err as AppError).code).toBe('internal');
        expect((err as AppError).message).toContain('Missing encryption key for version v99');
      }
    });
  });

  describe('Security Helpers (HMAC & Token Hashing)', () => {
    it('generates secure random hex signing secrets', () => {
      const secret1 = generateSigningSecret();
      const secret2 = generateSigningSecret();

      expect(secret1).toHaveLength(64); // 32 bytes in hex
      expect(secret2).toHaveLength(64);
      expect(secret1).not.toBe(secret2);
    });

    it('signs webhook payload with HMAC-SHA256 deterministically', () => {
      const secret = 'my-webhook-secret';
      const payload = JSON.stringify({ event: 'ping.failed', checkId: 'chk_123' });
      const timestamp = 1710000000;

      const sig1 = signWebhookPayload(secret, payload, timestamp);
      const sig2 = signWebhookPayload(secret, payload, timestamp);

      expect(sig1).toBe(sig2);
      expect(sig1).toHaveLength(64); // SHA-256 hex string
      expect(sig1).toMatch(/^[0-9a-f]{64}$/);

      // Different timestamp alters signature
      const sig3 = signWebhookPayload(secret, payload, timestamp + 1);
      expect(sig3).not.toBe(sig1);
    });

    it('computes deterministic SHA-256 token hash', () => {
      const token = 'session-token-xyz';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
