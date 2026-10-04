import { env } from '../env.js';
import { logger } from '../lib/logger.js';

export interface TurnstileVerificationResult {
  success: boolean;
  errorCodes?: string[];
}

/**
 * Validates a Cloudflare Turnstile token against Cloudflare's siteverify endpoint.
 * Gracefully passes when TURNSTILE_SECRET is not configured (dev/test environments).
 */
export async function verifyTurnstileToken(
  token?: string | null,
  remoteIp?: string,
): Promise<TurnstileVerificationResult> {
  // If no Turnstile secret is configured, bypass bot check
  if (!env.TURNSTILE_SECRET) {
    return { success: true };
  }

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return { success: false, errorCodes: ['missing-input-response'] };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', env.TURNSTILE_SECRET);
    formData.append('response', token.trim());
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn({
        event: 'turnstile.http_error',
        status: response.status,
      });
      return { success: false, errorCodes: [`http-${response.status}`] };
    }

    const data = (await response.json()) as {
      success: boolean;
      'error-codes'?: string[];
    };

    if (!data.success) {
      logger.warn({
        event: 'turnstile.verification_failed',
        errorCodes: data['error-codes'],
      });
    }

    return {
      success: Boolean(data.success),
      errorCodes: data['error-codes'],
    };
  } catch (error) {
    logger.error(error, 'Turnstile verification request failed');
    return { success: false, errorCodes: ['verification-exception'] };
  }
}
