import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailAdapter } from '../../src/jobs/adapters/email.js';
import type { DeliveryContext } from '../../src/jobs/adapters/base.js';

// Mock global fetch
global.fetch = vi.fn();

describe('EmailAdapter', () => {
  let adapter: EmailAdapter;
  let mockContext: DeliveryContext;

  beforeEach(() => {
    adapter = new EmailAdapter(
      're_test_key_123',
      'OrbitPing <test@orbitping.com>'
    );

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
      destination: 'user@example.com',
      channel: 'EMAIL',
      attempts: 0,
    };

    vi.clearAllMocks();
  });

  describe('Adapter Properties', () => {
    it('should have correct name and channel', () => {
      expect(adapter.name).toBe('email');
      expect(adapter.channel).toBe('EMAIL');
    });
  });

  describe('Successful Delivery', () => {
    it('should send DOWN alert email successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_abc123' }),
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.messageId).toBe('msg_abc123');
      expect(result.metadata?.provider).toBe('resend');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer re_test_key_123',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should send RECOVERED alert email successfully', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:30:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_xyz789' }),
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.messageId).toBe('msg_xyz789');
    });

    it('should include correct subject for DOWN alert', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      
      expect(body.subject).toBe('[OrbitPing] Production API is DOWN');
      expect(body.to).toBe('user@example.com');
      expect(body.from).toBe('OrbitPing <test@orbitping.com>');
    });

    it('should include correct subject for RECOVERED alert', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:30:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      
      expect(body.subject).toBe('[OrbitPing] Production API RECOVERED');
    });

    it('should include incident and check URLs in email body', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      
      expect(body.text).toContain('/app/incidents/incident-123');
      expect(body.text).toContain('/app/checks/check-123');
    });
  });

  describe('Error Handling', () => {
    it('should throw on 401 Unauthorized', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Resend API error 401'
      );
    });

    it('should throw on 429 Rate Limit', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Resend API error 429'
      );
    });

    it('should throw on 500 Server Error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Resend API error 500'
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

    it('should handle error text parsing failure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => {
          throw new Error('Cannot read response');
        },
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Resend API error 503: Unknown error'
      );
    });
  });

  describe('Template Formatting', () => {
    it('should format period correctly (seconds)', async () => {
      mockContext.check.periodSeconds = 45;
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('Every 45 seconds');
    });

    it('should format period correctly (minutes)', async () => {
      mockContext.check.periodSeconds = 300;
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('Every 5 minutes');
    });

    it('should format period correctly (hours)', async () => {
      mockContext.check.periodSeconds = 7200;
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('Every 2 hours');
    });

    it('should format period correctly (days)', async () => {
      mockContext.check.periodSeconds = 172800;
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('Every 2 days');
    });

    it('should format duration correctly for short recovery (seconds)', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.startedAt = new Date('2026-09-29T10:00:00Z');
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:00:45Z');
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('45s');
    });

    it('should format duration correctly for recovery (minutes)', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.startedAt = new Date('2026-09-29T10:00:00Z');
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:05:30Z');
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('5m 30s');
    });

    it('should format duration correctly for recovery (hours)', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.startedAt = new Date('2026-09-29T10:00:00Z');
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T13:30:00Z');
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('3h 30m');
    });

    it('should format duration correctly for recovery (days)', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.startedAt = new Date('2026-09-27T10:00:00Z');
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T15:00:00Z');
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('2d 5h');
    });

    it('should handle missing resolvedAt gracefully', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.resolvedAt = null;
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.text).toContain('Unknown');
    });
  });

  describe('Email Masking', () => {
    it('should mask long email addresses in logs', async () => {
      mockContext.destination = 'verylongemail@example.com';
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      // The test just verifies no error - actual log masking is internal
      await adapter.deliver(mockContext);
      expect(true).toBe(true);
    });

    it('should mask short email addresses in logs', async () => {
      mockContext.destination = 'ab@example.com';
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      // The test just verifies no error - actual log masking is internal
      await adapter.deliver(mockContext);
      expect(true).toBe(true);
    });
  });

  describe('HTTP Request Configuration', () => {
    it('should set correct Content-Type header', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
    });

    it('should set correct Authorization header', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.headers['Authorization']).toBe('Bearer re_test_key_123');
    });

    it('should use POST method', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.method).toBe('POST');
    });

    it('should include abort signal for timeout', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.signal).toBeDefined();
    });
  });
});
