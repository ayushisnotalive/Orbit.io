import { env } from '../env.js';
import type { BillingProvider } from './types.js';
import { PolarBillingProvider } from './polar.js';
import { LemonSqueezyBillingProvider } from './lemonsqueezy.js';
import { PaddleBillingProvider } from './paddle.js';

export * from './types.js';
export { PolarBillingProvider } from './polar.js';
export { LemonSqueezyBillingProvider } from './lemonsqueezy.js';
export { PaddleBillingProvider } from './paddle.js';

const providers: Record<string, BillingProvider> = {
  polar: new PolarBillingProvider(),
  lemonsqueezy: new LemonSqueezyBillingProvider(),
  paddle: new PaddleBillingProvider(),
};

/**
 * Returns the active billing provider based on config or explicit override.
 */
export function getBillingProvider(providerName?: string): BillingProvider {
  const target = (providerName || env.BILLING_PROVIDER || 'polar').toLowerCase();
  const provider = providers[target];
  if (!provider) {
    // Default to polar
    return providers.polar;
  }
  return provider;
}
