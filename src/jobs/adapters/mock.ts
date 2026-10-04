import type { ChannelType } from '@prisma/client';
import type {
  AlertDeliveryAdapter,
  DeliveryContext,
  DeliveryResult,
} from './base.js';

/**
 * Configuration for mock delivery behavior
 */
export interface MockDeliveryConfig {
  /** If true, deliver() will succeed; if false, it will fail */
  shouldSucceed?: boolean;
  /** Error message to return on failure */
  errorMessage?: string;
  /** Artificial delay in ms */
  delayMs?: number;
  /** Callback invoked on each delivery attempt */
  onDeliver?: (context: DeliveryContext) => void;
}

/**
 * Mock adapter for testing
 * Configurable to succeed or fail with custom behavior
 */
export class MockDeliveryAdapter implements AlertDeliveryAdapter {
  public readonly name: string;
  public deliveryCalls: DeliveryContext[] = [];

  constructor(
    public readonly channel: ChannelType,
    private config: MockDeliveryConfig = {},
  ) {
    this.name = `mock-${channel}`;
  }

  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    // Track the call
    this.deliveryCalls.push(context);

    // Invoke callback if provided
    if (this.config.onDeliver) {
      this.config.onDeliver(context);
    }

    // Artificial delay
    if (this.config.delayMs && this.config.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.delayMs));
    }

    // Return success or failure based on config
    const shouldSucceed = this.config.shouldSucceed ?? true;

    if (shouldSucceed) {
      return {
        success: true,
        metadata: { mock: true, timestamp: new Date().toISOString() },
      };
    } else {
      return {
        success: false,
        error: this.config.errorMessage || 'Mock delivery failure',
      };
    }
  }

  /**
   * Update mock configuration
   */
  setConfig(config: Partial<MockDeliveryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset delivery history
   */
  reset(): void {
    this.deliveryCalls = [];
  }
}
