import type { Alert, Channel, ChannelType, Check, Incident, User } from '@prisma/client';

/**
 * Context passed to delivery adapters containing all necessary alert information
 */
export interface DeliveryContext {
  alert: Alert & { incident: Incident; channel: Channel };
  check: Check & { user: User };
  destination: string;
  channel: ChannelType;
  attempts: number;
}

/**
 * Result of a delivery attempt
 */
export interface DeliveryResult {
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Base interface for alert delivery adapters
 * Each channel type (email, webhook, telegram, etc.) implements this interface
 */
export interface AlertDeliveryAdapter {
  /**
   * Unique identifier for this adapter (e.g., 'email', 'webhook', 'telegram')
   */
  readonly name: string;

  /**
   * Channel type this adapter handles
   */
  readonly channel: ChannelType;

  /**
   * Attempt to deliver an alert
   * @throws Error if delivery fails (will trigger retry logic)
   */
  deliver(context: DeliveryContext): Promise<DeliveryResult>;
}
