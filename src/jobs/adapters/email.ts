import type { ChannelType } from '@prisma/client';
import type {
  AlertDeliveryAdapter,
  DeliveryContext,
  DeliveryResult,
} from './base.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../env.js';

interface ResendEmailRequest {
  from: string;
  to: string;
  subject: string;
  text: string;
}

interface ResendEmailResponse {
  id: string;
}

/**
 * Email delivery adapter using Resend transactional email API
 */
export class EmailAdapter implements AlertDeliveryAdapter {
  public readonly name = 'email';
  public readonly channel: ChannelType = 'EMAIL';

  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
  ) {}

  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    const { alert, check, destination, attempts } = context;
    const incident = alert.incident || {
      id: 'test-incident-id',
      startedAt: new Date(),
      resolvedAt: null,
      reason: 'MISSED',
    };

    // Determine alert type
    const isDown = alert.kind === 'DOWN';

    // Format email
    const subject = isDown
      ? `[OrbitPing] ${check.name} is DOWN`
      : `[OrbitPing] ${check.name} RECOVERED`;

    const body = isDown
      ? this.formatDownEmail(check, incident, alert)
      : this.formatRecoveredEmail(check, incident, alert);

    // Prepare request
    const payload: ResendEmailRequest = {
      from: this.fromAddress,
      to: destination,
      subject,
      text: body,
    };

    // Send email via Resend API
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Resend API error ${response.status}: ${errorText}`);
      }

      const result = (await response.json()) as ResendEmailResponse;

      logger.info({
        event: 'email.sent',
        alertId: alert.id,
        checkId: check.id,
        destination: this.maskEmail(destination),
        messageId: result.id,
        attempts,
      });

      return {
        success: true,
        metadata: {
          provider: 'resend',
          messageId: result.id,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn({
        event: 'email.failed',
        alertId: alert.id,
        checkId: check.id,
        destination: this.maskEmail(destination),
        error: errorMessage,
        attempts,
      });

      throw error; // Re-throw for Phase 5 retry logic
    }
  }

  /**
   * Format DOWN alert email body
   */
  private formatDownEmail(
    check: any,
    incident: any,
    _alert: any,
  ): string {
    const startedAt = incident.startedAt.toISOString().replace('T', ' ').split('.')[0];
    const period = this.formatPeriod(check.periodSeconds);
    const incidentUrl = `${env.APP_URL}/app/incidents/${incident.id}`;
    const checkUrl = `${env.APP_URL}/app/checks/${check.id}`;

    return `Your check "${check.name}" has not received a ping as expected and is now DOWN.

Started: ${startedAt} UTC
Expected: Every ${period}

View incident: ${incidentUrl}
Manage check: ${checkUrl}

-- 
OrbitPing - Dead-man's switch monitoring
https://orbitping.com`;
  }

  /**
   * Format RECOVERED alert email body
   */
  private formatRecoveredEmail(
    check: any,
    incident: any,
    _alert: any,
  ): string {
    const startedAt = incident.startedAt.toISOString().replace('T', ' ').split('.')[0];
    const resolvedAt = incident.resolvedAt
      ? incident.resolvedAt.toISOString().replace('T', ' ').split('.')[0]
      : 'Unknown';
    
    const duration = incident.resolvedAt && incident.startedAt
      ? this.formatDuration(
          Math.floor((incident.resolvedAt.getTime() - incident.startedAt.getTime()) / 1000)
        )
      : 'Unknown';

    const incidentUrl = `${env.APP_URL}/app/incidents/${incident.id}`;
    const checkUrl = `${env.APP_URL}/app/checks/${check.id}`;

    return `Your check "${check.name}" has recovered after ${duration}.

Down since: ${startedAt} UTC
Recovered: ${resolvedAt} UTC
Duration: ${duration}

View incident: ${incidentUrl}
Manage check: ${checkUrl}

-- 
OrbitPing - Dead-man's switch monitoring
https://orbitping.com`;
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
   * Mask email for logging (show first 3 chars + domain)
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const maskedLocal = local.length > 3 ? `${local.slice(0, 3)}***` : '***';
    return `${maskedLocal}@${domain}`;
  }
}
