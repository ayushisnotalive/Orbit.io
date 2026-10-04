import type { FC } from 'hono/jsx';
import { Layout } from '../layout.js';
import { PLANS, type PlanName } from '../../config/plans.js';

export interface BillingViewProps {
  user: {
    email: string;
    plan: PlanName;
    effectivePlan: PlanName;
    planStatus: string;
    planRenewsAt: Date | null;
    billingInterval: string | null;
    billingCustomerId: string | null;
    pastDueSince: Date | null;
    cancelAtPeriodEnd: boolean;
    isAdmin?: boolean;
  };
  checkCount: number;
  channelCount: number;
  flash?: {
    type: 'success' | 'error' | 'warning';
    message: string;
  };
}

export const BillingView: FC<BillingViewProps> = ({
  user,
  checkCount,
  channelCount,
  flash,
}) => {
  const currentLimits = PLANS[user.effectivePlan];
  const isPastDue = user.planStatus === 'PAST_DUE';

  return (
    <Layout
      title="Billing & Plans - OrbitPing"
      user={{ email: user.email, plan: user.effectivePlan, isAdmin: user.isAdmin }}
      flash={flash}
      activePath="/app/billing"
    >
      <div style="padding-bottom: 3rem;">
        {/* Flash banner */}
        {flash && (
          <div
            style={`padding: 0.875rem 1.25rem; border-radius: var(--radius-md); margin-bottom: 1.5rem; font-size: 0.875rem; ${
              flash.type === 'error'
                ? 'background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;'
                : flash.type === 'warning'
                ? 'background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #fde68a;'
                : 'background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #6ee7b7;'
            }`}
          >
            {flash.message}
          </div>
        )}

        {/* Past due warning notice */}
        {isPastDue && (
          <div
            style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 2rem; display: flex; gap: 1rem; align-items: flex-start;"
          >
            <span style="font-size: 1.5rem;">⚠️</span>
            <div>
              <div style="font-weight: 600; color: #fde68a; margin-bottom: 0.25rem;">
                Payment Past Due - 7-Day Grace Window Active
              </div>
              <div style="font-size: 0.875rem; color: #fef3c7;">
                Your latest subscription payment failed. Your Pro monitoring and alerts remain fully active under your 7-day grace period. Please update your payment method in the customer portal to keep your high-frequency checks running.
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div style="margin-bottom: 2rem;">
          <h1 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem;">
            Subscription & Plans
          </h1>
          <p style="color: var(--text-secondary); font-size: 0.9375rem;">
            Scale your monitoring checks, alerting channels, and delivery frequency.
          </p>
        </div>

        {/* Current Plan Overview Card */}
        <div class="card" style="margin-bottom: 2.5rem; background: var(--surface-card);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 1.5rem;">
            <div>
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">
                Current Plan
              </div>
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 1.5rem; font-weight: 700;">{currentLimits.name}</span>
                <span class="badge badge-plan">{user.planStatus}</span>
                {user.cancelAtPeriodEnd && (
                  <span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5;">
                    Cancels at period end
                  </span>
                )}
              </div>
            </div>

            {user.billingCustomerId && (
              <form action="/billing/portal" method="POST" style="margin: 0;">
                <button type="submit" class="btn btn-secondary">
                  Manage Billing & Invoices
                </button>
              </form>
            )}
          </div>

          <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
            <div class="card" style="padding: 1rem; background: var(--surface-bg);">
              <div class="card-label">Checks Quota</div>
              <div style="font-size: 1.25rem; font-weight: 600; margin-top: 0.25rem;">
                {checkCount} <span style="font-size: 0.875rem; color: var(--text-muted);">/ {currentLimits.checks}</span>
              </div>
            </div>
            <div class="card" style="padding: 1rem; background: var(--surface-bg);">
              <div class="card-label">Channels Quota</div>
              <div style="font-size: 1.25rem; font-weight: 600; margin-top: 0.25rem;">
                {channelCount} <span style="font-size: 0.875rem; color: var(--text-muted);">/ {currentLimits.channels}</span>
              </div>
            </div>
            <div class="card" style="padding: 1rem; background: var(--surface-bg);">
              <div class="card-label">Min Ping Interval</div>
              <div style="font-size: 1.25rem; font-weight: 600; margin-top: 0.25rem;">
                {currentLimits.minPeriodSec >= 60 ? `${currentLimits.minPeriodSec / 60}m` : `${currentLimits.minPeriodSec}s`}
              </div>
            </div>
            <div class="card" style="padding: 1rem; background: var(--surface-bg);">
              <div class="card-label">Renews On</div>
              <div style="font-size: 1rem; font-weight: 500; margin-top: 0.25rem;">
                {user.planRenewsAt ? user.planRenewsAt.toLocaleDateString() : 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* Pricing Cards */}
        <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1.25rem;">
          Available Plans
        </h2>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
          {/* FREE PLAN */}
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--border-color);">
            <div>
              <div style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">Free</div>
              <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem;">
                Essential heartbeat monitoring for side projects and individual crons.
              </p>
              <div style="font-size: 2rem; font-weight: 800; margin-bottom: 1.5rem;">
                $0 <span style="font-size: 0.875rem; font-weight: normal; color: var(--text-muted);">/ forever</span>
              </div>

              <ul style="list-style: none; padding: 0; margin: 0 0 1.5rem 0; font-size: 0.875rem; display: flex; flex-direction: column; gap: 0.625rem;">
                <li>✓ <strong>5</strong> active checks</li>
                <li>✓ <strong>2</strong> alert channels</li>
                <li>✓ <strong>15 minute</strong> minimum interval</li>
                <li>✓ <strong>14 days</strong> incident history</li>
                <li>✓ 10 alert emails per day</li>
              </ul>
            </div>

            <div>
              {user.effectivePlan === 'FREE' ? (
                <button class="btn btn-secondary" style="width: 100%;" disabled>
                  Current Plan
                </button>
              ) : (
                <div style="font-size: 0.8125rem; color: var(--text-muted); text-align: center;">
                  Cancel in customer portal to downgrade to Free
                </div>
              )}
            </div>
          </div>

          {/* PRO PLAN */}
          <div
            class="card"
            style={`display: flex; flex-direction: column; justify-content: space-between; border: 1px solid ${
              user.effectivePlan === 'PRO' ? 'var(--primary-color, #38bdf8)' : 'var(--border-color)'
            }; background: rgba(56, 189, 248, 0.03);`}
          >
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                <div style="font-size: 1.25rem; font-weight: 700;">Pro</div>
                <span class="badge badge-plan">Popular</span>
              </div>
              <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem;">
                For production workers, scheduled pipelines, and engineering teams.
              </p>
              <div style="font-size: 2rem; font-weight: 800; margin-bottom: 1.5rem;">
                $5 <span style="font-size: 0.875rem; font-weight: normal; color: var(--text-muted);">/ month</span>
                <span style="font-size: 0.8125rem; color: #38bdf8; display: block; font-weight: normal;">
                  or $50 / year (save 17%)
                </span>
              </div>

              <ul style="list-style: none; padding: 0; margin: 0 0 1.5rem 0; font-size: 0.875rem; display: flex; flex-direction: column; gap: 0.625rem;">
                <li>✓ <strong>50</strong> active checks</li>
                <li>✓ <strong>10</strong> alert channels</li>
                <li>✓ <strong>1 minute</strong> minimum interval</li>
                <li>✓ <strong>90 days</strong> incident history</li>
                <li>✓ 200 alert emails per day</li>
                <li>✓ Signed Webhooks & Telegram Bot</li>
              </ul>
            </div>

            <div>
              {user.effectivePlan === 'PRO' ? (
                <button class="btn btn-secondary" style="width: 100%;" disabled>
                  Current Plan
                </button>
              ) : (
                <div style="display: flex; gap: 0.5rem; flex-direction: column;">
                  <form action="/billing/checkout" method="POST" style="margin: 0;">
                    <input type="hidden" name="plan" value="PRO" />
                    <input type="hidden" name="interval" value="MONTHLY" />
                    <button type="submit" class="btn btn-primary" style="width: 100%;">
                      Upgrade to Pro (Monthly)
                    </button>
                  </form>
                  <form action="/billing/checkout" method="POST" style="margin: 0;">
                    <input type="hidden" name="plan" value="PRO" />
                    <input type="hidden" name="interval" value="YEARLY" />
                    <button type="submit" class="btn btn-secondary" style="width: 100%;">
                      Upgrade to Pro (Yearly - $50)
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>

          {/* PLUS PLAN */}
          <div
            class="card"
            style={`display: flex; flex-direction: column; justify-content: space-between; border: 1px solid ${
              user.effectivePlan === 'PLUS' ? 'var(--primary-color, #38bdf8)' : 'var(--border-color)'
            };`}
          >
            <div>
              <div style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">Plus</div>
              <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem;">
                High-scale infrastructure and critical enterprise cron monitoring.
              </p>
              <div style="font-size: 2rem; font-weight: 800; margin-bottom: 1.5rem;">
                $12 <span style="font-size: 0.875rem; font-weight: normal; color: var(--text-muted);">/ month</span>
                <span style="font-size: 0.8125rem; color: #38bdf8; display: block; font-weight: normal;">
                  or $120 / year (save 17%)
                </span>
              </div>

              <ul style="list-style: none; padding: 0; margin: 0 0 1.5rem 0; font-size: 0.875rem; display: flex; flex-direction: column; gap: 0.625rem;">
                <li>✓ <strong>200</strong> active checks</li>
                <li>✓ <strong>25</strong> alert channels</li>
                <li>✓ <strong>1 minute</strong> minimum interval</li>
                <li>✓ <strong>180 days</strong> incident history</li>
                <li>✓ 500 alert emails per day</li>
                <li>✓ Priority support</li>
              </ul>
            </div>

            <div>
              {user.effectivePlan === 'PLUS' ? (
                <button class="btn btn-secondary" style="width: 100%;" disabled>
                  Current Plan
                </button>
              ) : (
                <div style="display: flex; gap: 0.5rem; flex-direction: column;">
                  <form action="/billing/checkout" method="POST" style="margin: 0;">
                    <input type="hidden" name="plan" value="PLUS" />
                    <input type="hidden" name="interval" value="MONTHLY" />
                    <button type="submit" class="btn btn-primary" style="width: 100%;">
                      Upgrade to Plus (Monthly)
                    </button>
                  </form>
                  <form action="/billing/checkout" method="POST" style="margin: 0;">
                    <input type="hidden" name="plan" value="PLUS" />
                    <input type="hidden" name="interval" value="YEARLY" />
                    <button type="submit" class="btn btn-secondary" style="width: 100%;">
                      Upgrade to Plus (Yearly - $120)
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
