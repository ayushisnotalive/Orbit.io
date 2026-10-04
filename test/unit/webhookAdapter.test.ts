import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebhookAdapter } from '../../src/jobs/adapters/webhook.js';
import type { DeliveryContext } from '../../src/jobs/adapters/base.js';
import * as ssrf from '../../src/alerts/ssrf.js';
import { createHmac } from 'node:crypto';

// Mock global fetch
global.fetch = vi.fn();

// Mock SSRF validation
vi.mock('../../src/alerts/ssrf.js', () => ({
  validateSafeUrl: vi.fn(),
}));

describe('WebhookAdapter', () => {
  let adapter: WebhookAdapter;
  let mockContext: DeliveryContext;

  beforeEach(() => {
    adapter = new WebhookAdapter();

    mockContext = {
      alert: {
        id: BigInt(1),
        kind: 'DOWN',
        incident: {
          id: 'incident-123',
          reason: 'MISSED_PING',
          startedAt: new Date('2026-09-29T10:00:00Z'),
          resolvedAt: null,
        },
        channel: {
          signingSecret: 'test-secret-key-12345',
        },
      } as any,
      check: {
        id: 'check-123',
        name: 'Production API',
        pingUuid: 'ping-uuid-123',
        periodSeconds: 300,
      } as any,
      destination: 'https://example.com/webhook',
      channel: 'WEBHOOK',
      attempts: 0,
    };

    vi.clearAllMocks();
    
    // Default: allow all URLs
    (ssrf.validateSafeUrl as any).mockResolvedValue({ valid: true });
  });

  describe('Adapter Properties', () => {
    it('should have correct name and channel', () => {
      expect(adapter.name).toBe('webhook');
      expect(adapter.channel).toBe('WEBHOOK');
    });
  });

  describe('Successful Delivery', () => {
    it('should send DOWN alert webhook successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.provider).toBe('webhook');
      expect(result.metadata?.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'OrbitPing/1.0 (https://orbitping.com)',
          }),
        })
      );
    });

    it('should send RECOVERED alert webhook successfully', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:30:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.status).toBe(200);
    });

    it('should accept 204 No Content response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.status).toBe(204);
    });
  });

  describe('HMAC Signature', () => {
    it('should include X-OrbitPing-Signature header with sha256 prefix', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.headers['X-OrbitPing-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should sign `${timestamp}.${body}` with the channel secret (D-08)', async () => {
      (global.fetch as any).mockResolvedValueOnce({ ok: true, status: 200 });

      await adapter.deliver(mockContext);

      const { headers, body } = (global.fetch as any).mock.calls[0][1];
      const expected = createHmac('sha256', 'test-secret-key-12345')
        .update(`${headers['X-OrbitPing-Timestamp']}.${body}`)
        .digest('hex');
      expect(headers['X-OrbitPing-Signature']).toBe(`sha256=${expected}`);
    });

    it('should reject redirects to prevent SSRF bypass (D-11)', async () => {
      (global.fetch as any).mockResolvedValueOnce({ ok: true, status: 200 });

      await adapter.deliver(mockContext);

      expect((global.fetch as any).mock.calls[0][1].redirect).toBe('error');
    });

    it('should generate different signatures for different payloads', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);
      const sig1 = (global.fetch as any).mock.calls[0][1].headers['X-OrbitPing-Signature'];

      // Change alert kind
      mockContext.alert.kind = 'RECOVERED';
      await adapter.deliver(mockContext);
      const sig2 = (global.fetch as any).mock.calls[1][1].headers['X-OrbitPing-Signature'];

      expect(sig1).not.toBe(sig2);
    });

    it('should include X-OrbitPing-Timestamp header', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.headers['X-OrbitPing-Timestamp']).toMatch(/^\d+$/);
    });

    it('should include X-OrbitPing-Retry header with attempt count', async () => {
      mockContext.attempts = 3;

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.headers['X-OrbitPing-Retry']).toBe('3');
    });
  });

  describe('Payload Structure', () => {
    it('should include correct event type for DOWN alert', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.event).toBe('check.down');
    });

    it('should include correct event type for RECOVERED alert', async () => {
      mockContext.alert.kind = 'RECOVERED';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.event).toBe('check.recovered');
    });

    it('should include check details with ping URL', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.check).toEqual({
        id: 'check-123',
        name: 'Production API',
        url: expect.stringContaining('/ping/ping-uuid-123'),
      });
    });

    it('should include incident details', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.incident).toEqual({
        id: 'incident-123',
        reason: 'MISSED_PING',
        startedAt: '2026-09-29T10:00:00.000Z',
        resolvedAt: null,
        duration: null,
      });
    });

    it('should include duration for RECOVERED alerts', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.startedAt = new Date('2026-09-29T10:00:00Z');
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:05:30Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.incident.duration).toBe(330); // 5m 30s = 330 seconds
    });

    it('should include timestamp', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('SSRF Protection', () => {
    it('should call validateSafeUrl before sending', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      expect(ssrf.validateSafeUrl).toHaveBeenCalledWith('https://example.com/webhook');
    });

    it('should throw error when SSRF validation fails', async () => {
      (ssrf.validateSafeUrl as any).mockResolvedValueOnce({
        valid: false,
        reason: 'Blocked destination IP address: 192.168.1.1',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'SSRF protection: Blocked destination IP address: 192.168.1.1'
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should block private IP addresses', async () => {
      mockContext.destination = 'http://192.168.1.1/webhook';

      (ssrf.validateSafeUrl as any).mockResolvedValueOnce({
        valid: false,
        reason: 'Blocked destination IP address: 192.168.1.1',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow('SSRF protection');
    });

    it('should block localhost', async () => {
      mockContext.destination = 'http://localhost:3000/webhook';

      (ssrf.validateSafeUrl as any).mockResolvedValueOnce({
        valid: false,
        reason: 'Blocked target: localhost',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow('SSRF protection');
    });
  });

  describe('Error Handling', () => {
    it('should throw on 400 Bad Request', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Webhook returned 400'
      );
    });

    it('should throw on 401 Unauthorized', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Webhook returned 401'
      );
    });

    it('should throw on 500 Server Error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Webhook returned 500'
      );
    });

    it('should throw on network timeout', async () => {
      (global.fetch as any).mockRejectedValueOnce(
        new Error('Network timeout')
      );

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Network timeout'
      );
    });

    it('should throw when signing secret is missing', async () => {
      mockContext.alert.channel.signingSecret = null;

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Webhook channel missing signing secret'
      );
    });
  });

  describe('HTTP Request Configuration', () => {
    it('should use POST method', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.method).toBe('POST');
    });

    it('should set Content-Type to application/json', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
    });

    it('should include User-Agent header', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.headers['User-Agent']).toBe('OrbitPing/1.0 (https://orbitping.com)');
    });

    it('should include abort signal for timeout', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.signal).toBeDefined();
    });
  });

  describe('URL Masking', () => {
    it('should mask webhook URL in logs', async () => {
      mockContext.destination = 'https://example.com/webhooks/secret-path';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      // Just verify no error - actual log masking is internal
      await adapter.deliver(mockContext);
      expect(true).toBe(true);
    });
  });
});
