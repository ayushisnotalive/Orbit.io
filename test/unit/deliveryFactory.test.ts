import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDeliveryAdapter,
  registerDeliveryAdapter,
  createDeliveryAdapter,
  clearAdapterRegistry,
  getRegisteredChannels,
  MockDeliveryAdapter,
  StubDeliveryAdapter,
} from '../../src/jobs/adapters/index.js';
import type { AlertChannel } from '@prisma/client';
import { WebhookAdapter } from '../../src/jobs/adapters/webhook.js';
import { SlackAdapter } from '../../src/jobs/adapters/slack.js';
import { DiscordAdapter } from '../../src/jobs/adapters/discord.js';

describe('Delivery Adapter Factory', () => {
  beforeEach(() => {
    // Clear registry before each test
    clearAdapterRegistry();
  });

  describe('getDeliveryAdapter', () => {
    it('returns stub adapter for EMAIL by default', () => {
      const adapter = getDeliveryAdapter('EMAIL');
      expect(adapter).toBeInstanceOf(StubDeliveryAdapter);
      expect(adapter.channel).toBe('EMAIL');
    });

    it('returns real URL-based adapters (no API key required)', () => {
      expect(getDeliveryAdapter('WEBHOOK')).toBeInstanceOf(WebhookAdapter);
      expect(getDeliveryAdapter('SLACK')).toBeInstanceOf(SlackAdapter);
      expect(getDeliveryAdapter('DISCORD')).toBeInstanceOf(DiscordAdapter);
    });

    it('returns stub adapter for TELEGRAM by default', () => {
      const adapter = getDeliveryAdapter('TELEGRAM');
      expect(adapter).toBeInstanceOf(StubDeliveryAdapter);
      expect(adapter.channel).toBe('TELEGRAM');
    });

    it('returns registered adapter when overridden', () => {
      const mockAdapter = new MockDeliveryAdapter('EMAIL');
      registerDeliveryAdapter('EMAIL', mockAdapter);

      const adapter = getDeliveryAdapter('EMAIL');
      expect(adapter).toBe(mockAdapter);
      expect(adapter).toBeInstanceOf(MockDeliveryAdapter);
    });
  });

  describe('registerDeliveryAdapter', () => {
    it('successfully registers a custom adapter', () => {
      const mockAdapter = new MockDeliveryAdapter('WEBHOOK');
      registerDeliveryAdapter('WEBHOOK', mockAdapter);

      const adapter = getDeliveryAdapter('WEBHOOK');
      expect(adapter).toBe(mockAdapter);
    });

    it('throws error when adapter channel does not match', () => {
      const mockAdapter = new MockDeliveryAdapter('EMAIL');

      expect(() => {
        registerDeliveryAdapter('WEBHOOK', mockAdapter as any);
      }).toThrow('Adapter channel mismatch');
    });

    it('allows overriding an existing adapter', () => {
      const mockAdapter1 = new MockDeliveryAdapter('EMAIL');
      const mockAdapter2 = new MockDeliveryAdapter('EMAIL');

      registerDeliveryAdapter('EMAIL', mockAdapter1);
      let adapter = getDeliveryAdapter('EMAIL');
      expect(adapter).toBe(mockAdapter1);

      registerDeliveryAdapter('EMAIL', mockAdapter2);
      adapter = getDeliveryAdapter('EMAIL');
      expect(adapter).toBe(mockAdapter2);
    });
  });

  describe('createDeliveryAdapter', () => {
    it('creates a stub adapter for any channel', () => {
      const adapter = createDeliveryAdapter('SMS');
      expect(adapter).toBeInstanceOf(StubDeliveryAdapter);
      expect(adapter.channel).toBe('SMS');
    });
  });

  describe('getRegisteredChannels', () => {
    it('returns all default channels after initialization', () => {
      // Force initialization by calling getDeliveryAdapter
      getDeliveryAdapter('EMAIL');

      const channels = getRegisteredChannels();
      expect(channels).toContain('EMAIL');
      expect(channels).toContain('WEBHOOK');
      expect(channels).toContain('TELEGRAM');
      expect(channels).toContain('SLACK');
      expect(channels).toContain('DISCORD');
    });

    it('reflects custom registered adapters', () => {
      clearAdapterRegistry();
      const mockAdapter = new MockDeliveryAdapter('EMAIL');
      registerDeliveryAdapter('EMAIL', mockAdapter);

      const channels = getRegisteredChannels();
      expect(channels).toContain('EMAIL');
    });
  });

  describe('clearAdapterRegistry', () => {
    it('clears all registered adapters', () => {
      // Register some adapters
      registerDeliveryAdapter('EMAIL', new MockDeliveryAdapter('EMAIL'));
      registerDeliveryAdapter('WEBHOOK', new MockDeliveryAdapter('WEBHOOK'));

      // Clear
      clearAdapterRegistry();

      // After clearing, getDeliveryAdapter should reinitialize with defaults
      const adapter = getDeliveryAdapter('EMAIL');
      expect(adapter).toBeInstanceOf(StubDeliveryAdapter);
    });
  });
});

describe('StubDeliveryAdapter', () => {
  it('throws "not implemented" error on deliver()', async () => {
    const adapter = new StubDeliveryAdapter('EMAIL');

    await expect(
      adapter.deliver({
        alert: {} as any,
        check: {} as any,
        destination: 'test@example.com',
        channel: 'EMAIL',
        attempts: 0,
      }),
    ).rejects.toThrow("Delivery adapter for channel 'EMAIL' is not implemented yet");
  });

  it('has correct name and channel', () => {
    const adapter = new StubDeliveryAdapter('WEBHOOK');
    expect(adapter.name).toBe('stub-WEBHOOK');
    expect(adapter.channel).toBe('WEBHOOK');
  });
});

describe('MockDeliveryAdapter', () => {
  it('succeeds by default', async () => {
    const adapter = new MockDeliveryAdapter('EMAIL');
    const result = await adapter.deliver({
      alert: {} as any,
      check: {} as any,
      destination: 'test@example.com',
      channel: 'EMAIL',
      attempts: 0,
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.mock).toBe(true);
  });

  it('fails when configured to fail', async () => {
    const adapter = new MockDeliveryAdapter('EMAIL', {
      shouldSucceed: false,
      errorMessage: 'Test error',
    });

    const result = await adapter.deliver({
      alert: {} as any,
      check: {} as any,
      destination: 'test@example.com',
      channel: 'EMAIL',
      attempts: 0,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Test error');
  });

  it('tracks delivery calls', async () => {
    const adapter = new MockDeliveryAdapter('EMAIL');
    const context1 = {
      alert: {} as any,
      check: {} as any,
      destination: 'test1@example.com',
      channel: 'EMAIL' as AlertChannel,
      attempts: 0,
    };
    const context2 = {
      alert: {} as any,
      check: {} as any,
      destination: 'test2@example.com',
      channel: 'EMAIL' as AlertChannel,
      attempts: 1,
    };

    await adapter.deliver(context1);
    await adapter.deliver(context2);

    expect(adapter.deliveryCalls).toHaveLength(2);
    expect(adapter.deliveryCalls[0].destination).toBe('test1@example.com');
    expect(adapter.deliveryCalls[1].destination).toBe('test2@example.com');
  });

  it('invokes onDeliver callback if provided', async () => {
    let callbackInvoked = false;
    const adapter = new MockDeliveryAdapter('EMAIL', {
      onDeliver: () => {
        callbackInvoked = true;
      },
    });

    await adapter.deliver({
      alert: {} as any,
      check: {} as any,
      destination: 'test@example.com',
      channel: 'EMAIL',
      attempts: 0,
    });

    expect(callbackInvoked).toBe(true);
  });

  it('respects artificial delay', async () => {
    const adapter = new MockDeliveryAdapter('EMAIL', {
      delayMs: 50,
    });

    const start = Date.now();
    await adapter.deliver({
      alert: {} as any,
      check: {} as any,
      destination: 'test@example.com',
      channel: 'EMAIL',
      attempts: 0,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some margin
  });

  it('can be reconfigured with setConfig()', async () => {
    const adapter = new MockDeliveryAdapter('EMAIL', {
      shouldSucceed: true,
    });

    let result = await adapter.deliver({
      alert: {} as any,
      check: {} as any,
      destination: 'test@example.com',
      channel: 'EMAIL',
      attempts: 0,
    });
    expect(result.success).toBe(true);

    // Reconfigure to fail
    adapter.setConfig({ shouldSucceed: false, errorMessage: 'Now failing' });

    result = await adapter.deliver({
      alert: {} as any,
      check: {} as any,
      destination: 'test@example.com',
      channel: 'EMAIL',
      attempts: 0,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Now failing');
  });

  it('can be reset to clear delivery history', async () => {
    const adapter = new MockDeliveryAdapter('EMAIL');

    await adapter.deliver({
      alert: {} as any,
      check: {} as any,
      destination: 'test@example.com',
      channel: 'EMAIL',
      attempts: 0,
    });

    expect(adapter.deliveryCalls).toHaveLength(1);

    adapter.reset();

    expect(adapter.deliveryCalls).toHaveLength(0);
  });
});
