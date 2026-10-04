import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscordAdapter } from '../../src/jobs/adapters/discord.js';
import type { DeliveryContext } from '../../src/jobs/adapters/base.js';
import * as ssrf from '../../src/alerts/ssrf.js';

// Mock global fetch
global.fetch = vi.fn();

// Mock SSRF validation
vi.mock('../../src/alerts/ssrf.js', () => ({
  validateSafeUrl: vi.fn(),
}));

describe('DiscordAdapter', () => {
  let adapter: DiscordAdapter;
  let mockContext: DeliveryContext;

  beforeEach(() => {
    adapter = new DiscordAdapter();

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
      destination: 'https://discord.com/api/webhooks/123456/ABCDEF',
      channel: 'DISCORD',
      attempts: 0,
    };

    vi.clearAllMocks();
    
    // Default: allow all URLs
    (ssrf.validateSafeUrl as any).mockResolvedValue({ valid: true });
  });

  describe('Adapter Properties', () => {
    it('should have correct name and channel', () => {
      expect(adapter.name).toBe('discord');
      expect(adapter.channel).toBe('DISCORD');
    });
  });

  describe('Successful Delivery', () => {
    it('should send DOWN alert to Discord successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.provider).toBe('discord');
      expect(result.metadata?.status).toBe(204);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/123456/ABCDEF',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should send RECOVERED alert to Discord successfully', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:30:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
    });
  });

  describe('Embed Structure', () => {
    it('should include DOWN status title with emoji', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.embeds[0].title).toContain('🔴');
      expect(payload.embeds[0].title).toContain('Production API');
    });

    it('should include RECOVERED status title with emoji', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:30:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.embeds[0].title).toContain('🟢');
    });

    it('should include DOWN description', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.embeds[0].description).toBe('Check is DOWN');
    });

    it('should include RECOVERED description', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:30:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.embeds[0].description).toBe('Check RECOVERED');
    });

    it('should include red color for DOWN alerts', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.embeds[0].color).toBe(0xff0000); // Red
    });

    it('should include green color for RECOVERED alerts', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:30:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.embeds[0].color).toBe(0x00ff00); // Green
    });

    it('should include check name field', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      const checkField = payload.embeds[0].fields.find((f: any) => f.name === 'Check');
      expect(checkField).toBeDefined();
      expect(checkField.value).toBe('Production API');
    });

    it('should include status field', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      const statusField = payload.embeds[0].fields.find((f: any) => f.name === 'Status');
      expect(statusField).toBeDefined();
      expect(statusField.value).toBe('DOWN');
    });

    it('should include started timestamp field', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      const startedField = payload.embeds[0].fields.find((f: any) => f.name === 'Started');
      expect(startedField).toBeDefined();
      expect(startedField.value).toContain('2026-09-29');
    });

    it('should include duration field for RECOVERED alerts', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.startedAt = new Date('2026-09-29T10:00:00Z');
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:05:30Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      const durationField = payload.embeds[0].fields.find((f: any) => f.name === 'Duration');
      expect(durationField).toBeDefined();
      expect(durationField.value).toContain('5m 30s');
    });

    it('should include incident link field', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      const incidentField = payload.embeds[0].fields.find((f: any) => f.name === 'Incident');
      expect(incidentField).toBeDefined();
      expect(incidentField.value).toContain('incident-123');
      expect(incidentField.value).toMatch(/\[View Details\]\(.*\)/);
    });

    it('should include footer', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.embeds[0].footer.text).toBe('OrbitPing');
    });

    it('should include timestamp', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.embeds[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('SSRF Protection', () => {
    it('should call validateSafeUrl before sending', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      expect(ssrf.validateSafeUrl).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/123456/ABCDEF'
      );
    });

    it('should throw error when SSRF validation fails', async () => {
      (ssrf.validateSafeUrl as any).mockResolvedValueOnce({
        valid: false,
        reason: 'Blocked destination IP address: 192.168.1.1',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'SSRF protection'
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw on 404 Not Found', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Webhook not found',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Discord webhook returned 404'
      );
    });

    it('should throw on 429 Rate Limit', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Discord webhook returned 429'
      );
    });

    it('should throw on 500 Server Error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Discord webhook returned 500'
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

    it('should handle error text parsing failure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => {
          throw new Error('Cannot read response');
        },
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Discord webhook returned 503: Unknown error'
      );
    });
  });

  describe('HTTP Request Configuration', () => {
    it('should use POST method', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.method).toBe('POST');
    });

    it('should set Content-Type to application/json', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
    });

    it('should include abort signal for timeout', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.signal).toBeDefined();
    });
  });
});
