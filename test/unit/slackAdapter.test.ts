import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlackAdapter } from '../../src/jobs/adapters/slack.js';
import type { DeliveryContext } from '../../src/jobs/adapters/base.js';
import * as ssrf from '../../src/alerts/ssrf.js';

// Mock global fetch
global.fetch = vi.fn();

// Mock SSRF validation
vi.mock('../../src/alerts/ssrf.js', () => ({
  validateSafeUrl: vi.fn(),
}));

describe('SlackAdapter', () => {
  let adapter: SlackAdapter;
  let mockContext: DeliveryContext;

  beforeEach(() => {
    adapter = new SlackAdapter();

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
      destination: 'https://hooks.slack.com/services/T00/B00/XXXX',
      channel: 'SLACK',
      attempts: 0,
    };

    vi.clearAllMocks();
    
    // Default: allow all URLs
    (ssrf.validateSafeUrl as any).mockResolvedValue({ valid: true });
  });

  describe('Adapter Properties', () => {
    it('should have correct name and channel', () => {
      expect(adapter.name).toBe('slack');
      expect(adapter.channel).toBe('SLACK');
    });
  });

  describe('Successful Delivery', () => {
    it('should send DOWN alert to Slack successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.provider).toBe('slack');
      expect(result.metadata?.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/T00/B00/XXXX',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should send RECOVERED alert to Slack successfully', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:30:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      const result = await adapter.deliver(mockContext);

      expect(result.success).toBe(true);
    });
  });

  describe('Payload Structure', () => {
    it('should include DOWN status text with emoji', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.text).toContain('🔴');
      expect(payload.text).toContain('Production API');
      expect(payload.text).toContain('is DOWN');
    });

    it('should include RECOVERED status text with emoji', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:30:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.text).toContain('🟢');
      expect(payload.text).toContain('RECOVERED');
    });

    it('should include danger color for DOWN alerts', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.attachments[0].color).toBe('danger');
    });

    it('should include good color for RECOVERED alerts', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:30:00Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.attachments[0].color).toBe('good');
    });

    it('should include check name field', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      const checkField = payload.attachments[0].fields.find((f: any) => f.title === 'Check');
      expect(checkField).toBeDefined();
      expect(checkField.value).toBe('Production API');
    });

    it('should include status field', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      const statusField = payload.attachments[0].fields.find((f: any) => f.title === 'Status');
      expect(statusField).toBeDefined();
      expect(statusField.value).toBe('DOWN');
    });

    it('should include started timestamp field', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      const startedField = payload.attachments[0].fields.find((f: any) => f.title === 'Started');
      expect(startedField).toBeDefined();
      expect(startedField.value).toContain('2026-09-29');
    });

    it('should include duration field for RECOVERED alerts', async () => {
      mockContext.alert.kind = 'RECOVERED';
      mockContext.alert.incident.startedAt = new Date('2026-09-29T10:00:00Z');
      mockContext.alert.incident.resolvedAt = new Date('2026-09-29T10:05:30Z');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      const durationField = payload.attachments[0].fields.find((f: any) => f.title === 'Duration');
      expect(durationField).toBeDefined();
      expect(durationField.value).toContain('5m 30s');
    });

    it('should include incident link field', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      const incidentField = payload.attachments[0].fields.find((f: any) => f.title === 'Incident');
      expect(incidentField).toBeDefined();
      expect(incidentField.value).toContain('incident-123');
      expect(incidentField.value).toMatch(/<.*\|View Details>/);
    });

    it('should include footer', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.attachments[0].footer).toBe('OrbitPing');
    });

    it('should include timestamp', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.attachments[0].ts).toBeGreaterThan(0);
    });
  });

  describe('SSRF Protection', () => {
    it('should call validateSafeUrl before sending', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      expect(ssrf.validateSafeUrl).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/T00/B00/XXXX'
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
        text: async () => 'Not found',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Slack webhook returned 404'
      );
    });

    it('should throw on 500 Server Error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      await expect(adapter.deliver(mockContext)).rejects.toThrow(
        'Slack webhook returned 500'
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
        'Slack webhook returned 503: Unknown error'
      );
    });
  });

  describe('HTTP Request Configuration', () => {
    it('should use POST method', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.method).toBe('POST');
    });

    it('should set Content-Type to application/json', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
    });

    it('should include abort signal for timeout', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      });

      await adapter.deliver(mockContext);

      const callArgs = (global.fetch as any).mock.calls[0][1];
      expect(callArgs.signal).toBeDefined();
    });
  });
});
