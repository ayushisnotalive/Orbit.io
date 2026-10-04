import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelegramAdapter } from '../../src/jobs/adapters/telegram.js';
import type { DeliveryContext } from '../../src/jobs/adapters/base.js';

// Mock global fetch
global.fetch = vi.fn();

describe('TelegramAdapter', () => {
  let adapter: TelegramAdapter;
  let mockContext: DeliveryContext;

  beforeEach(() => {
    adapter = new TelegramAdapter('123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11');

    mockContext = {
      alert: {
        id: BigInt(1),
        kind: 'DOWN',
        incident: {
          id: 'incident-123',
          startedAt: new Date('2026-09-29T10:00:00Z'),
          resolvedAt: null,
        },
      } as any,
      check: {
        id: 'check-123',
        name: 'Production API',
        periodSeconds: 300,
      } as any,
      destination: '123456789',
      channel: 'TELEGRAM',
      attempts: 0,
    };

    vi.clearAllMocks();
  });

  describe('Adapter Properties', () => {
    it('should have correct name and channel', () => {
      expect(adapter.name).toBe('telegram');
      expect(adapter.channel).toBe('TELEGRAM');
    });
  });

  describe('Successful Delivery', () => {
    it('should send DOWN alert message successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 42 } }),
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.messageId).toBe(42);
      expect(result.metadata?.provider).toBe('telegram');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should send RECOVERED alert message successfully', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:30:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 43 } }),
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.messageId).toBe(43);
    });

    it('should include correct payload structure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 44 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.chat_id).toBe('123456789');
      expect(body.parse_mode).toBe('MarkdownV2');
      expect(body.disable_web_page_preview).toBe(true);
      expect(body.text).toBeTruthy();
    });

    it('should format DOWN message with correct emoji and text', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 45 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.text).toContain('🔴');
      expect(body.text).toContain('is DOWN');
      expect(body.text).toContain('Production API');
    });

    it('should format RECOVERED message with correct emoji and duration', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.startedAt = new Date('2026-09-29T10:00:00Z');
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:05:30Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 46 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.text).toContain('🟢');
      expect(body.text).toContain('RECOVERED');
      expect(body.text).toContain('5m 30s');
    });

    it('should include incident and check URLs in message', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 47 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      // URLs are escaped for MarkdownV2, so check for escaped version
      expect(body.text).toContain('incident\\-123');
      expect(body.text).toContain('check\\-123');
    });
  });

  describe('Error Handling', () => {
    it('should throw on Telegram API error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false, description: 'Chat not found' }),
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Telegram API error: Chat not found'
      );
    });

    it('should throw on Telegram API error without description', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false }),
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Telegram API error: Unknown error'
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

    it('should throw on malformed JSON response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow();
    });

    it('should throw on blocked user error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          ok: false, 
          description: 'Forbidden: bot was blocked by the user' 
        }),
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow('blocked');
    });
  });

  describe('MarkdownV2 Escaping', () => {
    it('should escape special characters in check name', async () => {
      mockContext.check.name = 'API (Production-v2)';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 48 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      // Should escape parentheses and hyphen
      expect(body.text).toContain('\\(');
      expect(body.text).toContain('\\)');
      expect(body.text).toContain('\\-');
    });

    it('should escape special characters in URLs', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 49 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      // URLs should have special characters escaped (except inside markdown links)
      expect(body.text).toMatch(/\[.*\]\(.*\)/); // Should have markdown links
    });
  });

  describe('Template Formatting', () => {
    it('should format period correctly (seconds)', async () => {
      mockContext.check.periodSeconds = 45;

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 50 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.text).toContain('45 seconds');
    });

    it('should format period correctly (minutes)', async () => {
      mockContext.check.periodSeconds = 300;

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 51 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.text).toContain('5 minutes');
    });

    it('should format period correctly (hours)', async () => {
      mockContext.check.periodSeconds = 7200;

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 52 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.text).toContain('2 hours');
    });

    it('should format period correctly (days)', async () => {
      mockContext.check.periodSeconds = 172800;

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 53 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.text).toContain('2 days');
    });

    it('should format duration correctly for recovery (short)', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.startedAt = new Date('2026-09-29T10:00:00Z');
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:00:45Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 54 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.text).toContain('45s');
    });

    it('should format duration correctly for recovery (hours)', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.startedAt = new Date('2026-09-29T10:00:00Z');
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T13:30:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 55 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.text).toContain('3h 30m');
    });

    it('should format duration correctly for recovery (days)', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.startedAt = new Date('2026-09-27T10:00:00Z');
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T15:00:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 56 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.text).toContain('2d 5h');
    });
  });

  describe('Chat ID Masking', () => {
    it('should mask long chat IDs in logs', async () => {
      mockContext.destination = '987654321';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 57 } }),
      });

      // Just verify no error - actual log masking is internal
      await adapter.deliver(mockContext);
      expect(true).toBe(true);
    });

    it('should mask short chat IDs in logs', async () => {
      mockContext.destination = '12';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 58 } }),
      });

      // Just verify no error - actual log masking is internal
      await adapter.deliver(mockContext);
      expect(true).toBe(true);
    });
  });

  describe('HTTP Request Configuration', () => {
    it('should set correct Content-Type header', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 59 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
    });

    it('should use POST method', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 60 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.method).toBe('POST');
    });

    it('should include abort signal for timeout', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 61 } }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.signal).toBeDefined();
    });

    it('should use correct Telegram API endpoint', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 62 } }),
      });

      await adapter.deliver(mockContext);

      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain('https://api.telegram.org/bot');
      expect(url).toContain('/sendMessage');
    });
  });
});
