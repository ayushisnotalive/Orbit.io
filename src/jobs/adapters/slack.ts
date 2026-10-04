import type { ChannelType } from '@prisma/client';
import type {
  AlertDeliveryAdapter,
  DeliveryContext,
  DeliveryResult,
} from './base.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../env.js';
import { validateSafeUrl } from '../../alerts/ssrf.js';

interface SlackAttachment {
  color: 'danger' | 'good';
  fields: Array<{
    title: string;
    value: string;
    short: boolean;
  }>;
  footer?: string;
  footer_icon?: string;
  ts?: number;
}

interface SlackPayload {
  text: string;
  attachments: SlackAttachment[];
}

/**
 * Slack webhook delivery adapter with attachment formatting
 */
export class SlackAdapter implements AlertDeliveryAdapter {
  public readonly name = 'slack';
  public readonly channel: ChannelType = 'SLACK';

  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    const { alert, check, destination, attempts } = context;
    const incident = alert.incident || {
      id: 'test-incident-id',
      startedAt: new Date(),
      resolvedAt: null,
      reason: 'MISSED',
    };

    // SSRF protection check
    const validation = await validateSafeUrl(destination);
    if (!validation.valid) {
      logger.warn({
        event: 'slack.ssrf_blocked',
        alertId: alert.id,
        checkId: check.id,
        reason: validation.reason,
      });
      throw new Error(`SSRF protection: ${validation.reason}`);
    }

    const isDown = alert.kind === 'DOWN';
    const color: 'danger' | 'good' = isDown ? 'danger' : 'good';

    // Build Slack attachment payload
    const fields: SlackAttachment['fields'] = [
      {
        title: 'Check',
        value: check.name,
        short: true,
      },
      {
        title: 'Status',
        value: isDown ? 'DOWN' : 'RECOVERED',
        short: true,
      },
      {
        title: 'Started',
        value: this.formatTimestamp(incident.startedAt),
        short: true,
      },
    ];

    if (!isDown && incident.resolvedAt) {
      const duration = this.formatDuration(
        Math.floor((incident.resolvedAt.getTime() - incident.startedAt.getTime()) / 1000)
      );
      fields.push({
        title: 'Duration',
        value: duration,
        short: true,
      });
    }

    const payload: SlackPayload = {
      text: isDown
        ? `🔴 *${check.name}* is DOWN`
        : `🟢 *${check.name}* RECOVERED`,
      attachments: [
        {
          color,
          fields,
          footer: 'OrbitPing',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    // Add incident link as a field
    fields.push({
      title: 'Incident',
      value: `<${env.APP_URL}/app/incidents/${incident.id}|View Details>`,
      short: false,
    });

    // Send to Slack webhook
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(destination, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        redirect: 'error', // D-11: block redirect-based SSRF bypass
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Slack webhook returned ${response.status}: ${errorText}`);
      }

      logger.info({
        event: 'slack.sent',
        alertId: alert.id,
        checkId: check.id,
        destination: this.maskUrl(destination),
        status: response.status,
        attempts,
      });

      return {
        success: true,
        metadata: {
          provider: 'slack',
          status: response.status,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn({
        event: 'slack.failed',
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
   * Format timestamp in human-readable form
   */
  private formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', ' ').split('.')[0] + ' UTC';
  }

  /**
   * Format duration in human-readable form
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
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
