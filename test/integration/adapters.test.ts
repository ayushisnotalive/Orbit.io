import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EmailAdapter,
  TelegramAdapter,
  WebhookAdapter,
  SlackAdapter,
  DiscordAdapter,
  getDeliveryAdapter,
  registerDeliveryAdapter,
  clearAdapterRegistry,
} from '../../src/jobs/adapters/index.js';
import type { DeliveryContext } from '../../src/jobs/adapters/base.js';
import * as ssrf from '../../src/alerts/ssrf.js';

// Mock global fetch
global.fetch = vi.fn();

// Mock SSRF validation module
vi.mock('../../src/alerts/ssrf.js', () => ({
  validateSafeUrl: vi.fn(),
}));

describe('Adapter Integration Tests', () => {
  let mockContext: DeliveryContext;

  beforeEach(() => {
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
          id: 'channel-123',
          type: 'EMAIL',
          targetEnc: 'v1.encrypted',
          signingSecret: 'test-secret',
          verifiedAt: new Date(),
        },
      } as any,
      check: {
        id: 'check-123',
        name: 'Production API',
        pingUuid: 'ping-uuid-123',
        periodSeconds: 300,
        user: {
          id: 'user-123',
          email: 'user@example.com',
        },
      } as any,
      destination: 'test@example.com',
      channel: 'EMAIL',
      attempts: 0,
    };

    vi.clearAllMocks();
    
    // Default: allow all URLs for SSRF validation
    (ssrf.validateSafeUrl as any).mockResolvedValue({ valid: true });
  });

  describe('Factory Registry', () => {
    beforeEach(() => {
      clearAdapterRegistry();
    });

    it('should register and retrieve EmailAdapter', () => {
      const adapter = new EmailAdapter('test-key', 'from@example.com');
      registerDeliveryAdapter('EMAIL', adapter);

      const retrieved = getDeliveryAdapter('EMAIL');
      expect(retrieved).toBe(adapter);
    });

    it('should register and retrieve TelegramAdapter', () => {
      const adapter = new TelegramAdapter('test-bot-token');
      registerDeliveryAdapter('TELEGRAM', adapter);

      const retrieved = getDeliveryAdapter('TELEGRAM');
      expect(retrieved).toBe(adapter);
    });

    it('should register and retrieve WebhookAdapter', () => {
      const adapter = new WebhookAdapter();
      registerDeliveryAdapter('WEBHOOK', adapter);

      const retrieved = getDeliveryAdapter('WEBHOOK');
      expect(retrieved).toBe(adapter);
    });

    it('should throw error when adapter channel mismatch', () => {
      const adapter = new EmailAdapter('test-key', 'from@example.com');

      expect(() => {
        registerDeliveryAdapter('TELEGRAM', adapter as any);
      }).toThrow('Adapter channel mismatch');
    });
  });

  describe('End-to-End Delivery Flows', () => {
    it('should deliver email alert end-to-end', async () => {
      const adapter = new EmailAdapter('re_test_key', 'OrbitPing <noreply@orbitping.com>');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.messageId).toBe('msg_123');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer re_test_key',
          }),
        })
      );
    });

    it('should deliver Telegram alert end-to-end', async () => {
      const adapter = new TelegramAdapter('123456:ABC-DEF');
      mockContext.destination = '987654321';
      mockContext.channel = 'TELEGRAM';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 42 } }),
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.messageId).toBe(42);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.telegram.org'),
        expect.any(Object)
      );
    });

    it('should deliver webhook alert end-to-end with HMAC signing', async () => {
      const adapter = new WebhookAdapter();
      mockContext.destination = 'https://example.com/webhook';
      mockContext.channel = 'WEBHOOK';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.status).toBe(200);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.headers['X-OrbitPing-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(callArgs.headers['X-OrbitPing-Timestamp']).toBeTruthy();
    });

    it('should deliver Slack alert end-to-end with attachment', async () => {
      const adapter = new SlackAdapter();
      mockContext.destination = 'https://hooks.slack.com/services/T/B/X';
      mockContext.channel = 'SLACK';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.status).toBe(200);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.attachments).toBeDefined();
      expect(payload.attachments[0].color).toBe('danger');
    });

    it('should deliver Discord alert end-to-end with embed', async () => {
      const adapter = new DiscordAdapter();
      mockContext.destination = 'https://discord.com/api/webhooks/123/ABC';
      mockContext.channel = 'DISCORD';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.status).toBe(204);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.embeds).toBeDefined();
      expect(payload.embeds[0].color).toBe(0xff0000); // Red for DOWN
    });
  });

  describe('Error Handling Integration', () => {
    it('should propagate errors for retry logic', async () => {
      const adapter = new EmailAdapter('re_test_key', 'OrbitPing <noreply@orbitping.com>');

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow('Resend API error 500');
    });

    it('should handle network failures', async () => {
      const adapter = new TelegramAdapter('123456:ABC-DEF');
      mockContext.destination = '987654321';
      mockContext.channel = 'TELEGRAM';

      (global.fetch as any).mockRejectedValueOnce(new Error('Network timeout'));

      await expect(adapter.deliver(mockContext)).rejects.toThrow('Network timeout');
    });
  });

  describe('SSRF Protection Integration', () => {
    it('should block private IP addresses in webhooks', async () => {
      const adapter = new WebhookAdapter();
      mockContext.destination = 'http://192.168.1.1/webhook';
      mockContext.channel = 'WEBHOOK';

      // Override SSRF validation to block private IPs
      (ssrf.validateSafeUrl as any).mockResolvedValueOnce({
        valid: false,
        reason: 'Blocked destination IP address: 192.168.1.1',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow('SSRF protection');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should block localhost in Slack webhooks', async () => {
      const adapter = new SlackAdapter();
      mockContext.destination = 'http://localhost:3000/webhook';
      mockContext.channel = 'SLACK';

      // Override SSRF validation to block localhost
      (ssrf.validateSafeUrl as any).mockResolvedValueOnce({
        valid: false,
        reason: 'Blocked target: localhost',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow('SSRF protection');

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Multi-Adapter Scenarios', () => {
    it('should deliver to multiple channel types sequentially', async () => {
      const emailAdapter = new EmailAdapter('re_test_key', 'OrbitPing <noreply@orbitping.com>');
      const telegramAdapter = new TelegramAdapter('123456:ABC-DEF');

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'msg_email' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, result: { message_id: 99 } }),
        });

      // Email delivery
      const emailResult = await emailAdapter.deliver(mockContext);
      expect(emailResult.success).toBe(true);

      // Telegram delivery
      const telegramContext = { ...mockContext, destination: '123456', channel: 'TELEGRAM' as const };
      const telegramResult = await telegramAdapter.deliver(telegramContext);
      expect(telegramResult.success).toBe(true);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Retry Scenario Testing', () => {
    it('should include attempt count in webhook retry header', async () => {
      const adapter = new WebhookAdapter();
      mockContext.destination = 'https://example.com/webhook';
      mockContext.channel = 'WEBHOOK';
      mockContext.attempts = 5;

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.headers['X-OrbitPing-Retry']).toBe('5');
    });
  });
});
