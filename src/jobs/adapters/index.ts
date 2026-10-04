// Base types and interfaces
export type {
  AlertDeliveryAdapter,
  DeliveryContext,
  DeliveryResult,
} from './base.js';

// Adapter implementations
export { StubDeliveryAdapter } from './stub.js';
export { MockDeliveryAdapter, type MockDeliveryConfig } from './mock.js';
export { EmailAdapter } from './email.js';
export { TelegramAdapter } from './telegram.js';
export { WebhookAdapter } from './webhook.js';
export { SlackAdapter } from './slack.js';
export { DiscordAdapter } from './discord.js';

// Factory and registry
export {
  getDeliveryAdapter,
  registerDeliveryAdapter,
  createDeliveryAdapter,
  clearAdapterRegistry,
  getRegisteredChannels,
} from './factory.js';
