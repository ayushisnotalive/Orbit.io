import type { FC } from 'hono/jsx';
import { Layout } from '../layout.js';
import type { PlanName } from '../../config/plans.js';

interface ChannelFormProps {
  user: {
    email: string;
    plan: PlanName;
    isAdmin?: boolean;
  };
  flash?: {
    type: 'error' | 'success' | 'info';
    message: string;
  } | null;
  botUsername?: string;
}

export const ChannelFormView: FC<ChannelFormProps> = ({
  user,
  flash,
  botUsername = 'OrbitPingBot',
}) => {
  return (
    <Layout title="Add Alert Channel - OrbitPing" user={user} flash={flash} activePath="/app/channels">
      <div style="max-width: 640px; margin: 1rem auto 3rem;">
        <div style="margin-bottom: 1.5rem;">
          <a
            href="/app/channels"
            style="font-size: 0.875rem; display: inline-flex; align-items: center; gap: 0.375rem; color: var(--text-muted); margin-bottom: 0.5rem;"
          >
            &larr; Back to Channels
          </a>
          <h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em;">Add Alert Channel</h1>
          <p style="color: var(--text-secondary); font-size: 0.9375rem;">
            Receive instantaneous notifications whenever monitored background jobs fail or go silent.
          </p>
        </div>

        <div class="card" style="box-shadow: var(--shadow-lg);">
          <form action="/app/channels" method="POST" id="channel-form">
            {/* Channel Type Selector */}
            <div class="form-group">
              <label for="type" class="form-label">
                Channel Type <span style="color: #f87171;">*</span>
              </label>
              <select
                id="type"
                name="type"
                class="select"
                onchange="toggleChannelInputs(this.value)"
              >
                <option value="EMAIL">Email Address</option>
                <option value="TELEGRAM">Telegram Bot</option>
                <option value="SLACK">Slack Incoming Webhook</option>
                <option value="DISCORD">Discord Webhook</option>
                <option value="WEBHOOK">Custom HTTP Webhook (HMAC signed)</option>
              </select>
            </div>

            {/* Label */}
            <div class="form-group">
              <label for="label" class="form-label">
                Channel Label <span style="color: #f87171;">*</span>
              </label>
              <input
                type="text"
                id="label"
                name="label"
                class="input"
                placeholder="e.g. Primary Engineering Alert, #infra-alerts, PagerDuty"
                required
                maxlength={60}
              />
              <div class="form-hint">Descriptive identifier shown in notifications and dashboard.</div>
            </div>

            {/* Email Input */}
            <div id="field-email" class="channel-type-field">
              <div class="form-group">
                <label for="targetEmail" class="form-label">
                  Recipient Email Address
                </label>
                <input
                  type="email"
                  id="targetEmail"
                  name="targetEmail"
                  class="input"
                  placeholder="alerts@company.com"
                  value={user.email}
                />
                <div class="form-hint">
                  If this matches your account email, it will be verified automatically. Otherwise a verification email will be sent.
                </div>
              </div>
            </div>

            {/* Telegram Instructions */}
            <div id="field-telegram" class="channel-type-field" style="display: none;">
              <div
                style="padding: 1rem; background: var(--bg-surface-elevated); border: 1px solid var(--border-medium); border-radius: var(--radius-md); margin-bottom: 1.25rem;"
              >
                <div style="font-weight: 600; margin-bottom: 0.5rem; color: #38bdf8;">
                  Telegram Pairing Workflow
                </div>
                <p style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5;">
                  Submitting this form will generate a secure one-time pairing code. You will then click to open <strong>@{botUsername}</strong> in Telegram and send <code>/start &lt;code&gt;</code> to activate alerts.
                </p>
              </div>
            </div>

            {/* Slack Webhook Input */}
            <div id="field-slack" class="channel-type-field" style="display: none;">
              <div class="form-group">
                <label for="targetSlack" class="form-label">
                  Slack Incoming Webhook URL
                </label>
                <input
                  type="url"
                  id="targetSlack"
                  name="targetSlack"
                  class="input"
                  placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
                />
                <div class="form-hint">Create an Incoming Webhook in your Slack workspace settings.</div>
              </div>
            </div>

            {/* Discord Webhook Input */}
            <div id="field-discord" class="channel-type-field" style="display: none;">
              <div class="form-group">
                <label for="targetDiscord" class="form-label">
                  Discord Webhook URL
                </label>
                <input
                  type="url"
                  id="targetDiscord"
                  name="targetDiscord"
                  class="input"
                  placeholder="https://discord.com/api/webhooks/123/XXXX"
                />
                <div class="form-hint">Create a Webhook in your Discord Channel Integrations.</div>
              </div>
            </div>

            {/* Generic Webhook Input */}
            <div id="field-webhook" class="channel-type-field" style="display: none;">
              <div class="form-group">
                <label for="targetWebhook" class="form-label">
                  Webhook Endpoint URL
                </label>
                <input
                  type="url"
                  id="targetWebhook"
                  name="targetWebhook"
                  class="input"
                  placeholder="https://api.yourdomain.com/alerts"
                />
                <div class="form-hint">HTTPS endpoint that will receive POST incident payloads.</div>
              </div>

              <div class="form-group">
                <label for="signingSecret" class="form-label">
                  Signing Secret (Optional)
                </label>
                <input
                  type="text"
                  id="signingSecret"
                  name="signingSecret"
                  class="input"
                  placeholder="Leave empty to auto-generate random HMAC secret"
                />
                <div class="form-hint">Used to compute the HMAC-SHA256 signature header for payload verification.</div>
              </div>
            </div>

            {/* Form Actions */}
            <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--border-subtle);">
              <a href="/app/channels" class="btn btn-secondary">
                Cancel
              </a>
              <button type="submit" class="btn btn-primary">
                Add Channel
              </button>
            </div>
          </form>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            function toggleChannelInputs(type) {
              const types = ['email', 'telegram', 'slack', 'discord', 'webhook'];
              types.forEach(t => {
                const el = document.getElementById('field-' + t);
                if (el) el.style.display = (t.toUpperCase() === type) ? 'block' : 'none';
              });
            }
          `,
        }}
      />
    </Layout>
  );
};
