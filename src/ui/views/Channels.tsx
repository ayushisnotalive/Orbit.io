import type { FC } from 'hono/jsx';
import { Layout } from '../layout.js';
import { PLANS, type PlanName } from '../../config/plans.js';

export interface ChannelItem {
  id: string;
  type: 'EMAIL' | 'TELEGRAM' | 'SLACK' | 'DISCORD' | 'WEBHOOK' | string;
  label: string;
  verifiedAt: Date | null;
  verifyExpiresAt: Date | null;
  consecutiveFailures: number;
  lastError: string | null;
  disabledAt: Date | null;
  disabledReason: string | null;
  createdAt: Date;
}

interface ChannelsViewProps {
  user: {
    email: string;
    plan: PlanName;
    isAdmin?: boolean;
  };
  channels: ChannelItem[];
  flash?: {
    type: 'error' | 'success' | 'info';
    message: string;
  } | null;
}

export const ChannelsView: FC<ChannelsViewProps> = ({ user, channels, flash }) => {
  const planConfig = PLANS[user.plan] || PLANS.FREE;
  const channelCount = channels.length;
  const verifiedCount = channels.filter((c) => c.verifiedAt).length;

  return (
    <Layout title="Alert Channels - OrbitPing" user={user} flash={flash} activePath="/app/channels">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em;">Alert Channels</h1>
          <p style="color: var(--text-secondary); font-size: 0.9375rem; margin-top: 0.25rem;">
            Configure and verify destinations for downtime, recovery, and reminder notifications.
          </p>
        </div>
        <div>
          <a href="/app/channels/new" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Add Alert Channel</span>
          </a>
        </div>
      </div>

      {/* Quota & Health Overview */}
      <div class="stats-grid">
        <div class="stat-card" style="--stat-color: var(--brand-primary);">
          <span class="stat-label">Channel Quota</span>
          <span class="stat-value">
            {channelCount} <span style="font-size: 1rem; color: var(--text-muted); font-weight: 400;">/ {planConfig.channels}</span>
          </span>
          <span class="stat-sub">{planConfig.name} Plan Allowed Channels</span>
        </div>

        <div class="stat-card" style="--stat-color: var(--status-up);">
          <span class="stat-label">Verified Channels</span>
          <span class="stat-value" style="color: #34d399;">
            {verifiedCount}
          </span>
          <span class="stat-sub">Ready to receive alerts</span>
        </div>

        <div class="stat-card" style="--stat-color: var(--status-paused);">
          <span class="stat-label">Unverified</span>
          <span class="stat-value" style="color: #fbbf24;">
            {channelCount - verifiedCount}
          </span>
          <span class="stat-sub">Pending verification code/link</span>
        </div>
      </div>

      {/* Channels List Table */}
      {channels.length === 0 ? (
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <h3 class="empty-title">No alert channels configured</h3>
          <p class="empty-desc">
            Add your email, Telegram bot, Slack, Discord webhook, or generic webhook to receive immediate notifications when background jobs fail.
          </p>
          <a href="/app/channels/new" class="btn btn-primary">
            Add Your First Channel
          </a>
        </div>
      ) : (
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Channel Type</th>
                <th>Label</th>
                <th>Status</th>
                <th>Health & Failures</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((ch) => {
                const isVerified = !!ch.verifiedAt;
                const isDisabled = !!ch.disabledAt;

                return (
                  <tr>
                    <td>
                      <span
                        class="badge"
                        style="background: var(--bg-surface-elevated); border: 1px solid var(--border-medium); color: var(--text-primary);"
                      >
                        {ch.type}
                      </span>
                    </td>
                    <td>
                      <div style="font-weight: 600; color: var(--text-primary);">
                        {ch.label}
                      </div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">
                        Created {new Date(ch.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      {isVerified ? (
                        <span class="badge badge-up">
                          <span class="badge-dot" />
                          <span>Verified</span>
                        </span>
                      ) : (
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                          <span class="badge badge-paused">
                            <span class="badge-dot" />
                            <span>Unverified</span>
                          </span>
                          {ch.type === 'TELEGRAM' && (
                            <a
                              href={`/app/channels/${ch.id}/pair`}
                              class="btn btn-secondary btn-sm"
                              style="font-size: 0.6875rem; padding: 0.125rem 0.375rem;"
                            >
                              Pair Bot
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      {isDisabled ? (
                        <div>
                          <span class="badge badge-down">Disabled</span>
                          <div style="font-size: 0.6875rem; color: #f87171; margin-top: 0.25rem;">
                            {ch.disabledReason === 'consecutive_delivery_failures'
                              ? 'Disabled: 10 consecutive delivery errors'
                              : 'Manually disabled'}
                          </div>
                        </div>
                      ) : ch.consecutiveFailures > 0 ? (
                        <div>
                          <span style="color: #fbbf24; font-size: 0.8125rem; font-weight: 500;">
                            {ch.consecutiveFailures} recent failure(s)
                          </span>
                          {ch.lastError && (
                            <div style="font-size: 0.6875rem; color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                              {ch.lastError}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style="color: #34d399; font-size: 0.8125rem;">Healthy</span>
                      )}
                    </td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 0.5rem; align-items: center;">
                        <form
                          action={`/app/channels/${ch.id}/test`}
                          method="POST"
                          style="margin: 0; display: inline;"
                        >
                          <button
                            type="submit"
                            class="btn btn-secondary btn-sm"
                            title="Send sample test alert (Rate limited: 5/hour)"
                          >
                            Send Test
                          </button>
                        </form>

                        <form
                          action={`/app/channels/${ch.id}/toggle`}
                          method="POST"
                          style="margin: 0; display: inline;"
                        >
                          <button type="submit" class="btn btn-secondary btn-sm">
                            {isDisabled ? 'Enable' : 'Disable'}
                          </button>
                        </form>

                        <form
                          action={`/app/channels/${ch.id}/delete`}
                          method="POST"
                          style="margin: 0; display: inline;"
                          onsubmit="return confirm('Permanently remove this notification channel?');"
                        >
                          <button type="submit" class="btn btn-danger btn-sm">
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
};
