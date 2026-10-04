import type { FC } from 'hono/jsx';
import { Layout } from '../layout.js';
import type { PlanName } from '../../config/plans.js';

interface TelegramPairingProps {
  user: {
    email: string;
    plan: PlanName;
    isAdmin?: boolean;
  };
  channel: {
    id: string;
    label: string;
    verifiedAt: Date | null;
  };
  token: string;
  botUsername: string;
}

export const TelegramPairingView: FC<TelegramPairingProps> = ({
  user,
  channel,
  token,
  botUsername,
}) => {
  const telegramDeepLink = `https://t.me/${botUsername}?start=${token}`;
  const startCommand = `/start ${token}`;

  return (
    <Layout
      title={`Pair Telegram - ${channel.label} - OrbitPing`}
      user={user}
      activePath="/app/channels"
    >
      <div style="max-width: 580px; margin: 2rem auto 4rem;">
        <div style="margin-bottom: 1.5rem; text-align: center;">
          <div
            style="width: 56px; height: 56px; background: rgba(56, 189, 248, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; color: #38bdf8;"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </div>
          <h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em;">
            Pair Telegram Bot
          </h1>
          <p style="color: var(--text-secondary); font-size: 0.9375rem; margin-top: 0.25rem;">
            Link channel <strong>{channel.label}</strong> with your personal Telegram or group chat.
          </p>
        </div>

        <div class="card" style="box-shadow: var(--shadow-lg);">
          {channel.verifiedAt ? (
            <div style="text-align: center; padding: 2rem 0;">
              <span class="badge badge-up" style="font-size: 0.875rem; padding: 0.375rem 0.875rem;">
                <span class="badge-dot" />
                <span>Successfully Verified!</span>
              </span>
              <p style="margin-top: 1rem; color: var(--text-secondary); font-size: 0.9375rem;">
                This Telegram channel is active and receiving alerts.
              </p>
              <div style="margin-top: 1.5rem;">
                <a href="/app/channels" class="btn btn-primary">
                  Go to Channels
                </a>
              </div>
            </div>
          ) : (
            <div>
              <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                {/* Method 1: Instant Link */}
                <div style="padding: 1.25rem; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
                  <div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.375rem;">
                    Option 1: One-Click Link (Fastest)
                  </div>
                  <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1rem;">
                    Click the button below to launch Telegram and automatically send the verification command to <strong>@{botUsername}</strong>.
                  </p>
                  <a
                    href={telegramDeepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn btn-primary"
                    style="width: 100%;"
                  >
                    <span>Open in Telegram</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>

                {/* Method 2: Manual Start Command */}
                <div style="padding: 1.25rem; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
                  <div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.375rem;">
                    Option 2: Manual Pairing Code
                  </div>
                  <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.75rem;">
                    If adding to a group chat or channel, add <strong>@{botUsername}</strong> as administrator and send this command:
                  </p>
                  <div class="ping-box">
                    <input type="text" readOnly value={startCommand} />
                    <button
                      type="button"
                      class="copy-btn"
                      onclick={`copyToClipboard('${startCommand}', this)`}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--border-subtle);">
                <a href="/app/channels" class="btn btn-secondary">
                  Back to Channels
                </a>
                <a href={`/app/channels/${channel.id}/pair`} class="btn btn-secondary">
                  Check Status
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};
