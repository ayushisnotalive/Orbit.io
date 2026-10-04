import type { FC } from 'hono/jsx';
import { Layout } from '../../layout.js';

export const PricingView: FC = () => {
  return (
    <Layout title="Pricing - OrbitPing" activePath="/pricing">

      <div style="padding-top: 3.5rem; padding-bottom: 4rem;">
        <div style="text-align: center; max-width: 640px; margin: 0 auto 3.5rem auto;">
          <h1 style="font-size: 2.25rem; font-weight: 800; margin-bottom: 0.75rem;">
            Simple, Transparent Pricing
          </h1>
          <p style="color: var(--text-secondary); font-size: 1.0625rem; line-height: 1.6;">
            Start for free. Scale your cron monitoring as your production workers and scheduled pipelines expand.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 4rem;">
          {/* FREE */}
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; background: var(--surface-card);">
            <div>
              <div style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">Free</div>
              <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1.25rem;">
                For hobbyists, side projects, and single servers.
              </p>
              <div style="font-size: 2.25rem; font-weight: 800; margin-bottom: 1.5rem;">
                $0 <span style="font-size: 0.875rem; font-weight: normal; color: var(--text-muted);">/ forever</span>
              </div>

              <ul style="list-style: none; padding: 0; margin: 0 0 1.5rem 0; font-size: 0.875rem; display: flex; flex-direction: column; gap: 0.625rem;">
                <li>✓ <strong>5</strong> active checks</li>
                <li>✓ <strong>2</strong> alert channels</li>
                <li>✓ <strong>15 minute</strong> minimum interval</li>
                <li>✓ <strong>14 days</strong> incident history</li>
                <li>✓ 10 alert emails per day</li>
                <li>✓ Telegram, Discord, Slack</li>
              </ul>
            </div>

            <a href="/login" class="btn btn-secondary" style="width: 100%; text-align: center;">
              Get Started Free
            </a>
          </div>

          {/* PRO */}
          <div
            class="card"
            style="display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--primary-color, #38bdf8); background: rgba(56, 189, 248, 0.03);"
          >
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                <div style="font-size: 1.25rem; font-weight: 700;">Pro</div>
                <span class="badge badge-plan">Most Popular</span>
              </div>
              <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1.25rem;">
                For growing businesses and production scheduled pipelines.
              </p>
              <div style="font-size: 2.25rem; font-weight: 800; margin-bottom: 1.5rem;">
                $5 <span style="font-size: 0.875rem; font-weight: normal; color: var(--text-muted);">/ month</span>
                <span style="font-size: 0.8125rem; color: #38bdf8; display: block; font-weight: normal;">
                  $50 billed annually
                </span>
              </div>

              <ul style="list-style: none; padding: 0; margin: 0 0 1.5rem 0; font-size: 0.875rem; display: flex; flex-direction: column; gap: 0.625rem;">
                <li>✓ <strong>50</strong> active checks</li>
                <li>✓ <strong>10</strong> alert channels</li>
                <li>✓ <strong>1 minute</strong> minimum interval</li>
                <li>✓ <strong>90 days</strong> incident history</li>
                <li>✓ 200 alert emails per day</li>
                <li>✓ Signed Webhooks with HMAC</li>
              </ul>
            </div>

            <a href="/login" class="btn btn-primary" style="width: 100%; text-align: center;">
              Upgrade to Pro
            </a>
          </div>

          {/* PLUS */}
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; background: var(--surface-card);">
            <div>
              <div style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">Plus</div>
              <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1.25rem;">
                High-volume workloads and enterprise infrastructure.
              </p>
              <div style="font-size: 2.25rem; font-weight: 800; margin-bottom: 1.5rem;">
                $12 <span style="font-size: 0.875rem; font-weight: normal; color: var(--text-muted);">/ month</span>
                <span style="font-size: 0.8125rem; color: #38bdf8; display: block; font-weight: normal;">
                  $120 billed annually
                </span>
              </div>

              <ul style="list-style: none; padding: 0; margin: 0 0 1.5rem 0; font-size: 0.875rem; display: flex; flex-direction: column; gap: 0.625rem;">
                <li>✓ <strong>200</strong> active checks</li>
                <li>✓ <strong>25</strong> alert channels</li>
                <li>✓ <strong>1 minute</strong> minimum interval</li>
                <li>✓ <strong>180 days</strong> incident history</li>
                <li>✓ 500 alert emails per day</li>
                <li>✓ Priority support channel</li>
              </ul>
            </div>

            <a href="/login" class="btn btn-secondary" style="width: 100%; text-align: center;">
              Upgrade to Plus
            </a>
          </div>
        </div>

        {/* FAQ Section */}
        <section style="max-width: 760px; margin: 0 auto;">
          <h2 style="font-size: 1.5rem; font-weight: 700; text-align: center; margin-bottom: 2rem;">
            Frequently Asked Questions
          </h2>

          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <div class="card" style="background: var(--surface-card);">
              <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">
                What is an inverted dead-man's switch?
              </h3>
              <p style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6; margin: 0;">
                Traditional monitoring tools connect into your server from the outside. OrbitPing reverses this: your background jobs ping OrbitPing upon finishing. If a expected ping does not arrive before its deadline plus grace period, OrbitPing sounds the alarm.
              </p>
            </div>

            <div class="card" style="background: var(--surface-card);">
              <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">
                What happens if I downgrade to the Free plan?
              </h3>
              <p style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6; margin: 0;">
                All of your existing checks and channels remain active and keep monitoring. We never delete or pause your monitors upon downgrade. You simply cannot create additional checks until you are under the 5-check Free limit.
              </p>
            </div>

            <div class="card" style="background: var(--surface-card);">
              <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">
                Do I need to install an agent on my servers?
              </h3>
              <p style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6; margin: 0;">
                No! OrbitPing works with standard <code>curl</code> or any HTTP client. You can also use our single-file POSIX shell wrapper <code>orbitping.sh</code> which requires no dependencies.
              </p>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};
