import type { ChannelType } from '@prisma/client';
import type { AlertDeliveryAdapter } from './base.js';
import { StubDeliveryAdapter } from './stub.js';
import { EmailAdapter } from './email.js';
import { TelegramAdapter } from './telegram.js';
import { WebhookAdapter } from './webhook.js';
import { SlackAdapter } from './slack.js';
import { DiscordAdapter } from './discord.js';
import { env } from '../../env.js';

/**
 * Registry of delivery adapters by channel
 * Can be overridden for testing or custom implementations
 */
const adapterRegistry = new Map<ChannelType, AlertDeliveryAdapter>();

/**
 * Initialize default adapters
 * Real adapters are conditionally registered based on environment config
 */
function initializeDefaultAdapters(): void {
  if (adapterRegistry.size === 0) {
    // Email adapter (conditional on API key)
    if (env.RESEND_API_KEY) {
      adapterRegistry.set('EMAIL', new EmailAdapter(
        env.RESEND_API_KEY,
        env.MAIL_FROM
      ));
    } else {
      adapterRegistry.set('EMAIL', new StubDeliveryAdapter('EMAIL'));
    }
    
    // Telegram adapter (conditional on bot token)
    if (env.TELEGRAM_BOT_TOKEN) {
      adapterRegistry.set('TELEGRAM', new TelegramAdapter(env.TELEGRAM_BOT_TOKEN));
    } else {
      adapterRegistry.set('TELEGRAM', new StubDeliveryAdapter('TELEGRAM'));
    }
    
    // Webhook adapters (always available - SSRF protection built-in)
    adapterRegistry.set('WEBHOOK', new WebhookAdapter());
    adapterRegistry.set('SLACK', new SlackAdapter());
    adapterRegistry.set('DISCORD', new DiscordAdapter());
  }
}

/**
 * Get the delivery adapter for a given channel
 * Returns stub adapter if no implementation exists
 */
export function getDeliveryAdapter(channel: ChannelType): AlertDeliveryAdapter {
  initializeDefaultAdapters();

  const adapter = adapterRegistry.get(channel);
  if (!adapter) {
    // Fallback: create stub adapter on the fly
    return new StubDeliveryAdapter(channel);
  }

  return adapter;
}

/**
 * Register a custom delivery adapter for a channel
 * Used to override default stubs with real implementations or mock adapters for testing
 */
export function registerDeliveryAdapter(
  channel: ChannelType,
  adapter: AlertDeliveryAdapter,
): void {
  if (adapter.channel !== channel) {
    throw new Error(
      `Adapter channel mismatch: expected '${channel}', got '${adapter.channel}'`,
    );
  }
  adapterRegistry.set(channel, adapter);
}

/**
 * Create a new delivery adapter instance
 * Exported for testing purposes
 */
export function createDeliveryAdapter(
  channel: ChannelType,
): AlertDeliveryAdapter {
  return new StubDeliveryAdapter(channel);
}

/**
 * Clear all registered adapters (for testing)
 */
export function clearAdapterRegistry(): void {
  adapterRegistry.clear();
}

/**
 * Get all registered channels (for testing/debugging)
 */
export function getRegisteredChannels(): ChannelType[] {
  initializeDefaultAdapters();
  return Array.from(adapterRegistry.keys());
}
