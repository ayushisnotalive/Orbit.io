import type { ChannelType } from '@prisma/client';
import type {
  AlertDeliveryAdapter,
  DeliveryContext,
  DeliveryResult,
} from './base.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../env.js';

interface TelegramSendMessageRequest {
  chat_id: string;
  text: string;
  parse_mode: 'MarkdownV2';
  disable_web_page_preview: boolean;
}

interface TelegramResponse {
  ok: boolean;
  result?: {
    message_id: number;
  };
  description?: string;
}

/**
 * Telegram delivery adapter using Bot API
 */
export class TelegramAdapter implements AlertDeliveryAdapter {
  public readonly name = 'telegram';
  public readonly channel: ChannelType = 'TELEGRAM';

  constructor(private readonly botToken: string) {}

  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    const { alert, check, destination, attempts } = context;
    const incident = alert.incident || {
      id: 'test-incident-id',
      startedAt: new Date(),
      resolvedAt: null,
      reason: 'MISSED',
    };

    // Format message
    const message = this.formatMessage(alert, check, incident);

    // Prepare request
    const payload: TelegramSendMessageRequest = {
      chat_id: destination,
      text: message,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    };

    // Send message via Telegram Bot API
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      const result = (await response.json()) as TelegramResponse;

      if (!result.ok) {
        throw new Error(
          `Telegram API error: ${result.description || 'Unknown error'}`
        );
      }

      logger.info({
        event: 'telegram.sent',
        alertId: alert.id,
        checkId: check.id,
        destination: this.maskChatId(destination),
        messageId: result.result?.message_id,
        attempts,
      });

      return {
        success: true,
        metadata: {
          provider: 'telegram',
          messageId: result.result?.message_id,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn({
        event: 'telegram.failed',
        alertId: alert.id,
        checkId: check.id,
        destination: this.maskChatId(destination),
        error: errorMessage,
        attempts,
      });

      throw error; // Re-throw for Phase 5 retry logic
    }
  }

  /**
   * Format alert message for Telegram with MarkdownV2 formatting
   */
  private formatMessage(alert: any, check: any, incident: any): string {
    const isDown = alert.kind === 'DOWN';
    const emoji = isDown ? '🔴' : '🟢';
    const status = isDown ? 'is DOWN' : 'RECOVERED';

    // Format timestamp
    const timestamp = this.formatTimestamp(incident.startedAt);

    // Build incident URL
    const incidentUrl = `${env.APP_URL}/app/incidents/${incident.id}`;
    const checkUrl = `${env.APP_URL}/app/checks/${check.id}`;

    let message = `${emoji} *${this.escapeMd(check.name)}* ${status}\n\n`;
    
    if (isDown) {
      message += `⏰ Started: ${this.escapeMd(timestamp)}\n`;
      message += `🔗 Expected every ${this.escapeMd(this.formatPeriod(check.periodSeconds))}\n\n`;
    } else {
      const duration = incident.resolvedAt && incident.startedAt
        ? this.formatDuration(
            Math.floor((incident.resolvedAt.getTime() - incident.startedAt.getTime()) / 1000)
          )
        : 'Unknown';
      message += `⏰ Down since: ${this.escapeMd(timestamp)}\n`;
      message += `⏱️ Duration: ${this.escapeMd(duration)}\n\n`;
    }

    message += `[View Incident](${this.escapeMd(incidentUrl)}) • [View Check](${this.escapeMd(checkUrl)})`;

    return message;
  }

  /**
   * Escape MarkdownV2 special characters
   * https://core.telegram.org/bots/api#markdownv2-style
   */
  private escapeMd(text: string): string {
    // Escape MarkdownV2 special characters: \_*[]()~`>#+-=|{}.!
    return text.replace(/[\\_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  /**
   * Format timestamp in human-readable form
   */
  private formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', ' ').split('.')[0] + ' UTC';
  }

  /**
   * Format period in human-readable form
   */
  private formatPeriod(seconds: number): string {
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    return `${Math.floor(seconds / 86400)} days`;
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
   * Mask chat ID for logging (show first 3 chars)
   */
  private maskChatId(chatId: string): string {
    if (chatId.length <= 3) return '***';
    return `${chatId.slice(0, 3)}***`;
  }
}
