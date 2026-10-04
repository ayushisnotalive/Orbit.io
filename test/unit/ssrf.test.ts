import { describe, it, expect, vi } from 'vitest';
import { isPrivateIp, validateSafeUrl, safeFetch } from '../../src/alerts/ssrf.js';
import { AppError } from '../../src/lib/errors.js';

describe('SSRF Defense Module (src/alerts/ssrf.ts)', () => {
  describe('isPrivateIp (IPv4)', () => {
    it('blocks loopback addresses (127.0.0.0/8)', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('127.255.255.255')).toBe(true);
    });

    it('blocks cloud metadata IP (169.254.169.254) and link-local (169.254.0.0/16)', () => {
      expect(isPrivateIp('169.254.169.254')).toBe(true);
      expect(isPrivateIp('169.254.1.1')).toBe(true);
    });

    it('blocks RFC 1918 private subnets (10/8, 172.16/12, 192.168/16)', () => {
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('10.254.254.254')).toBe(true);
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('172.31.255.255')).toBe(true);
      expect(isPrivateIp('192.168.0.1')).toBe(true);
      expect(isPrivateIp('192.168.100.50')).toBe(true);
    });

    it('blocks Carrier-Grade NAT (100.64.0.0/10)', () => {
      expect(isPrivateIp('100.64.0.1')).toBe(true);
      expect(isPrivateIp('100.127.255.255')).toBe(true);
    });

    it('blocks zero network and broadcast', () => {
      expect(isPrivateIp('0.0.0.0')).toBe(true);
      expect(isPrivateIp('255.255.255.255')).toBe(true);
    });

    it('permits public routable IPv4 addresses', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false);
      expect(isPrivateIp('1.1.1.1')).toBe(false);
      expect(isPrivateIp('140.82.112.4')).toBe(false); // GitHub
      expect(isPrivateIp('100.63.255.255')).toBe(false); // just below CGNAT
      expect(isPrivateIp('172.32.0.1')).toBe(false); // just above 172.31
    });
  });

  describe('isPrivateIp (IPv6)', () => {
    it('blocks loopback (::1) and unspecified (::)', () => {
      expect(isPrivateIp('::1')).toBe(true);
      expect(isPrivateIp('::')).toBe(true);
    });

    it('blocks unique local addresses (fc00::/7)', () => {
      expect(isPrivateIp('fc00::1')).toBe(true);
      expect(isPrivateIp('fd12:3456:789a::1')).toBe(true);
    });

    it('blocks link-local unicast (fe80::/10)', () => {
      expect(isPrivateIp('fe80::1')).toBe(true);
      expect(isPrivateIp('feb0::1')).toBe(true);
    });

    it('blocks IPv4-mapped IPv6 addresses for private targets (::ffff:127.0.0.1, ::ffff:169.254.169.254)', () => {
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
      expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true);
    });

    it('permits public IPv4-mapped addresses and public IPv6 addresses', () => {
      expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
      expect(isPrivateIp('2606:4700:4700::1111')).toBe(false); // Cloudflare DNS IPv6
    });
  });

  describe('validateSafeUrl', () => {
    it('rejects invalid or malformed URLs', async () => {
      const res = await validateSafeUrl('not-a-valid-url');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Invalid URL');
    });

    it('rejects non-HTTP protocols (ftp:, file:, gopher:)', async () => {
      const res1 = await validateSafeUrl('ftp://example.com/file');
      expect(res1.valid).toBe(false);

      const res2 = await validateSafeUrl('file:///etc/passwd');
      expect(res2.valid).toBe(false);
    });

    it('rejects URLs targeting localhost or 127.0.0.1 directly', async () => {
      const res1 = await validateSafeUrl('http://127.0.0.1:8080/hook');
      expect(res1.valid).toBe(false);

      const res2 = await validateSafeUrl('http://localhost:3000/hook');
      expect(res2.valid).toBe(false);
    });

    it('rejects URLs targeting cloud metadata (169.254.169.254)', async () => {
      const res = await validateSafeUrl('http://169.254.169.254/latest/meta-data');
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/blocked/i);
    });

    it('approves legitimate public webhook URLs', async () => {
      // Test against well-known public host
      const res = await validateSafeUrl('https://example.com/webhook');
      expect(res.valid).toBe(true);
      expect(res.ips).toBeDefined();
      expect(res.ips!.length).toBeGreaterThan(0);
    });
  });

  describe('safeFetch', () => {
    it('throws AppError invalid_input when destination fails SSRF validation', async () => {
      await expect(safeFetch('http://127.0.0.1:9090/webhook')).rejects.toThrowError(AppError);
      try {
        await safeFetch('http://169.254.169.254/metadata');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('invalid_input');
        expect((err as AppError).field).toBe('url');
      }
    });

    it('disallows HTTP redirects with redirect: error', async () => {
      // Mock global fetch to verify redirect option
      const originalFetch = global.fetch;
      const mockFetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
      global.fetch = mockFetch;

      try {
        await safeFetch('https://example.com/webhook', { method: 'POST', body: 'test' });
        expect(mockFetch).toHaveBeenCalled();
        const callArgs = mockFetch.mock.calls[0];
        expect(callArgs[1].redirect).toBe('error');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
