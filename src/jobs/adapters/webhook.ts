import type { ChannelType } from '@prisma/client';
import type {
  AlertDeliveryAdapter,
  DeliveryContext,
  DeliveryResult,
} from './base.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../env.js';
import { validateSafeUrl } from '../../alerts/ssrf.js';
import { signWebhookPayload } from '../../security/crypto.js';

interface WebhookPayload {
  event: 'check.down' | 'check.recovered';
  check: {
    id: string;
    name: string;
    url: string;
  };
  incident: {
    id: string;
    reason: string;
    startedAt: string;
    resolvedAt: string | null;
    duration: number | null;
  };
  timestamp: string;
}

/**
 * Generic webhook delivery adapter with HMAC-SHA256 signing
 */
export class WebhookAdapter implements AlertDeliveryAdapter {
  public readonly name = 'webhook';
  public readonly channel: ChannelType = 'WEBHOOK';

  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    const { alert, check, destination, attempts } = context;
    const incident = alert.incident;

    // SSRF protection check
    const validation = await validateSafeUrl(destination);
    if (!validation.valid) {
      logger.warn({
        event: 'webhook.ssrf_blocked',
        alertId: alert.id,
        checkId: check.id,
        reason: validation.reason,
      });
      throw new Error(`SSRF protection: ${validation.reason}`);
    }

    // Get signing secret from channel
    const signingSecret = alert.channel?.signingSecret;
    if (!signingSecret) {
      throw new Error('Webhook channel missing signing secret');
    }

    // Build payload
    const payload: WebhookPayload = {
      event: alert.kind === 'DOWN' ? 'check.down' : 'check.recovered',
      check: {
        id: check.id,
        name: check.name,
        url: `${env.PING_HOST}/ping/${check.pingUuid}`,
      },
      incident: {
        id: incident.id,
        reason: incident.reason,
        startedAt: incident.startedAt.toISOString(),
        resolvedAt: incident.resolvedAt?.toISOString() || null,
        duration: this.calculateDuration(incident),
      },
      timestamp: new Date().toISOString(),
    };

    const body = JSON.stringify(payload);

    // Compute HMAC-SHA256 signature over `${timestamp}.${body}` (D-08) so
    // receivers can reject replayed requests by checking timestamp freshness.
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(signingSecret, body, timestamp);

    // Send webhook
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(destination, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OrbitPing/1.0 (https://orbitping.com)',
          'X-OrbitPing-Signature': `sha256=${signature}`,
          'X-OrbitPing-Timestamp': timestamp.toString(),
          'X-OrbitPing-Retry': attempts.toString(),
        },
        body,
        redirect: 'error', // D-11: block redirect-based SSRF bypass
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      logger.info({
        event: 'webhook.sent',
        alertId: alert.id,
        checkId: check.id,
        destination: this.maskUrl(destination),
        status: response.status,
        attempts,
      });

      return {
        success: true,
        metadata: {
          provider: 'webhook',
          status: response.status,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn({
        event: 'webhook.failed',
        alertId: alert.id,
        checkId: check.id,
        destination: this.maskUrl(destination),
        error: errorMessage,
        attempts,
      });

      throw error; // Re-throw for Phase 5 retry logic
    }
  }

  /**
   * Calculate incident duration in seconds
   */
  private calculateDuration(incident: any): number | null {
    if (!incident.resolvedAt || !incident.startedAt) {
      return null;
    }
    return Math.floor(
      (incident.resolvedAt.getTime() - incident.startedAt.getTime()) / 1000
    );
  }

  /**
   * Mask URL for logging (show protocol and domain only)
   */
  private maskUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.hostname}`;
    } catch {
      return '***';
    }
  }
}
