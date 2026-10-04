import type { ChannelType } from '@prisma/client';
import type {
  AlertDeliveryAdapter,
  DeliveryContext,
  DeliveryResult,
} from './base.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../env.js';
import { validateSafeUrl } from '../../alerts/ssrf.js';

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: DiscordEmbedField[];
  footer?: {
    text: string;
  };
  timestamp: string;
}

interface DiscordPayload {
  embeds: DiscordEmbed[];
}

/**
 * Discord webhook delivery adapter with embed formatting
 */
export class DiscordAdapter implements AlertDeliveryAdapter {
  public readonly name = 'discord';
  public readonly channel: ChannelType = 'DISCORD';

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
        event: 'discord.ssrf_blocked',
        alertId: alert.id,
        checkId: check.id,
        reason: validation.reason,
      });
      throw new Error(`SSRF protection: ${validation.reason}`);
    }

    const isDown = alert.kind === 'DOWN';
    const color = isDown ? 0xff0000 : 0x00ff00; // Red or green

    // Build embed fields
    const fields: DiscordEmbedField[] = [
      {
        name: 'Check',
        value: check.name,
        inline: true,
      },
      {
        name: 'Status',
        value: isDown ? 'DOWN' : 'RECOVERED',
        inline: true,
      },
      {
        name: 'Started',
        value: this.formatTimestamp(incident.startedAt),
        inline: true,
      },
    ];

    if (!isDown && incident.resolvedAt) {
      const duration = this.formatDuration(
        Math.floor((incident.resolvedAt.getTime() - incident.startedAt.getTime()) / 1000)
      );
      fields.push({
        name: 'Duration',
        value: duration,
        inline: true,
      });
    }

    // Add incident link
    fields.push({
      name: 'Incident',
      value: `[View Details](${env.APP_URL}/app/incidents/${incident.id})`,
      inline: false,
    });

    const payload: DiscordPayload = {
      embeds: [
        {
          title: `${isDown ? '🔴' : '🟢'} ${check.name}`,
          description: isDown ? 'Check is DOWN' : 'Check RECOVERED',
          color,
          fields,
          footer: {
            text: 'OrbitPing',
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    // Send to Discord webhook
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
        throw new Error(`Discord webhook returned ${response.status}: ${errorText}`);
      }

      logger.info({
        event: 'discord.sent',
        alertId: alert.id,
        checkId: check.id,
        destination: this.maskUrl(destination),
        status: response.status,
        attempts,
      });

      return {
        success: true,
        metadata: {
          provider: 'discord',
          status: response.status,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn({
        event: 'discord.failed',
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
