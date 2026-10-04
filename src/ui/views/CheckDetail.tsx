import type { FC } from 'hono/jsx';
import { Layout } from '../layout.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { SnippetGenerator } from '../components/SnippetGenerator.js';
import { IncidentTimeline, type IncidentRecord, type PingRecord } from '../components/IncidentTimeline.js';
import type { PlanName } from '../../config/plans.js';

export interface CheckDetailData {
  id: string;
  name: string;
  pingUuid: string;
  status: string;
  scheduleType: string;
  periodSeconds: number | null;
  cronExpr: string | null;
  timezone: string;
  graceSeconds: number;
  tags: string[];
  lastPingAt: Date | null;
  lastStartAt: Date | null;
  nextExpectedAt: Date | null;
  alertAfter: Date | null;
  lastDurationMs: number | null;
  consecutiveFails: number;
  pingCount: number;
  createdAt: Date;
  incidents: IncidentRecord[];
  pings: PingRecord[];
  channels?: Array<{
    channel: {
      id: string;
      type: string;
      label: string;
    };
  }>;
}

interface CheckDetailProps {
  user: {
    email: string;
    plan: PlanName;
    isAdmin?: boolean;
  };
  check: CheckDetailData;
  appUrl: string;
  flash?: {
    type: 'error' | 'success' | 'info';
    message: string;
  } | null;
}

export const CheckDetailView: FC<CheckDetailProps> = ({
  user,
  check,
  appUrl,
  flash,
}) => {
  const pingUrl = `${appUrl}/ping/${check.pingUuid}`;

  const scheduleHuman =
    check.scheduleType === 'CRON'
      ? `Cron expression: ${check.cronExpr} (${check.timezone})`
      : `Interval: Every ${
          check.periodSeconds
            ? check.periodSeconds < 3600
              ? `${Math.round(check.periodSeconds / 60)} minutes`
              : `${Math.round(check.periodSeconds / 3600)} hours`
            : '60 seconds'
        }`;

  return (
    <Layout
      title={`${check.name} - OrbitPing`}
      user={user}
      flash={flash}
      activePath="/dashboard"
    >
      <div style="margin-bottom: 2rem;">
        <a
          href="/dashboard"
          style="font-size: 0.875rem; display: inline-flex; align-items: center; gap: 0.375rem; color: var(--text-muted); margin-bottom: 0.75rem;"
        >
          &larr; Back to Dashboard
        </a>

        {/* Header with Title and Control Buttons */}
        <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
              <h1 style="font-size: 2rem; font-weight: 700; letter-spacing: -0.025em;">
                {check.name}
              </h1>
              <StatusBadge status={check.status} />
            </div>
            <div style="display: flex; align-items: center; gap: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
              <span>{scheduleHuman}</span>
              <span>&bull;</span>
              <span>Grace period: {Math.round(check.graceSeconds / 60)}m</span>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <a href={`/checks/${check.id}/edit`} class="btn btn-secondary btn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>Edit</span>
            </a>

            <form action={`/checks/${check.id}/pause`} method="POST" style="margin: 0;">
              <button type="submit" class="btn btn-secondary btn-sm">
                {check.status === 'PAUSED' ? 'Resume Monitoring' : 'Pause Alerts'}
              </button>
            </form>

            <form
              action={`/checks/${check.id}/delete`}
              method="POST"
              style="margin: 0;"
              onsubmit="return confirm('Are you sure you want to permanently delete this check and all its ping/incident history?');"
            >
              <button type="submit" class="btn btn-danger btn-sm">
                Delete
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Ping Ingestion URL Bar */}
      <div class="card" style="margin-bottom: 1.5rem; padding: 1.25rem;">
        <span style="display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem; letter-spacing: 0.05em;">
          Unique Ping URL (Secret Ingestion Endpoint)
        </span>
        <div class="ping-box">
          <input type="text" readOnly value={pingUrl} id="ping-url-input" />
          <button
            type="button"
            class="copy-btn"
            onclick={`copyToClipboard('${pingUrl}', this)`}
          >
            Copy URL
          </button>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
          Send HTTP GET, POST, or HEAD requests to this endpoint when your job completes. No authentication tokens needed.
        </div>
      </div>

      {/* Connected Alert Channels */}
      <div class="card" style="margin-bottom: 1.5rem; padding: 1.25rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
          <span style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">
            Connected Alert Channels ({check.channels?.length ?? 0})
          </span>
          <a href={`/checks/${check.id}/edit`} style="font-size: 0.8125rem; color: var(--brand-primary); text-decoration: none; font-weight: 500;">
            Manage Channels &rarr;
          </a>
        </div>
        {(!check.channels || check.channels.length === 0) ? (
          <div style="color: var(--text-secondary); font-size: 0.875rem;">
            No alert channels connected. <a href={`/checks/${check.id}/edit`} style="color: var(--brand-primary); font-weight: 500;">Attach channels</a> to receive alerts when this check fails.
          </div>
        ) : (
          <div style="display: flex; flex-wrap: wrap; gap: 0.625rem;">
            {check.channels.map(({ channel }) => (
              <div
                style="display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.75rem; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); font-size: 0.875rem;"
              >
                <span style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--brand-primary); background: rgba(56, 189, 248, 0.1); padding: 0.15rem 0.45rem; border-radius: 4px;">
                  {channel.type}
                </span>
                <span style="font-weight: 500;">{channel.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Telemetry Metrics Grid */}
      <div class="stats-grid">
        <div class="stat-card" style="--stat-color: var(--brand-primary);">
          <span class="stat-label">Total Pings</span>
          <span class="stat-value">{check.pingCount}</span>
          <span class="stat-sub">Lifetime heartbeats</span>
        </div>

        <div class="stat-card" style="--stat-color: var(--status-up);">
          <span class="stat-label">Last Ping</span>
          <span class="stat-value" style="font-size: 1.35rem; margin-top: 0.25rem;">
            {check.lastPingAt ? new Date(check.lastPingAt).toLocaleTimeString() : 'Never'}
          </span>
          <span class="stat-sub">
            {check.lastPingAt ? new Date(check.lastPingAt).toLocaleDateString() : 'Awaiting first run'}
          </span>
        </div>

        <div class="stat-card" style="--stat-color: var(--status-new);">
          <span class="stat-label">Next Deadline</span>
          <span class="stat-value" style="font-size: 1.35rem; margin-top: 0.25rem;">
            {check.alertAfter ? new Date(check.alertAfter).toLocaleTimeString() : '—'}
          </span>
          <span class="stat-sub">
            {check.alertAfter ? new Date(check.alertAfter).toLocaleDateString() : 'No active deadline'}
          </span>
        </div>

        <div class="stat-card" style="--stat-color: var(--status-paused);">
          <span class="stat-label">Last Runtime</span>
          <span class="stat-value" style="font-size: 1.35rem; margin-top: 0.25rem;">
            {check.lastDurationMs != null ? `${check.lastDurationMs}ms` : '—'}
          </span>
          <span class="stat-sub">Recorded execution duration</span>
        </div>
      </div>

      {/* Snippet Generator Component */}
      <SnippetGenerator pingUrl={pingUrl} uuid={check.pingUuid} />

      {/* Incidents & Pings Timeline */}
      <IncidentTimeline incidents={check.incidents} recentPings={check.pings} />
    </Layout>
  );
};
