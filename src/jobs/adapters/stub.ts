import type { ChannelType } from '@prisma/client';
import type {
  AlertDeliveryAdapter,
  DeliveryContext,
  DeliveryResult,
} from './base.js';

/**
 * Stub adapter that throws "not implemented" error
 * Used for channels that don't have real implementations yet
 */
export class StubDeliveryAdapter implements AlertDeliveryAdapter {
  constructor(
    public readonly channel: ChannelType,
    public readonly name: string = `stub-${channel}`,
  ) {}

  async deliver(_context: DeliveryContext): Promise<DeliveryResult> {
    throw new Error(
      `Delivery adapter for channel '${this.channel}' is not implemented yet`,
    );
  }
}
