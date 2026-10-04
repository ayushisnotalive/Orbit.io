import type { FC } from 'hono/jsx';
import { Layout } from '../layout.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { PLANS, type PlanName } from '../../config/plans.js';

export interface CheckSummaryItem {
  id: string;
  name: string;
  pingUuid: string;
  status: string;
  scheduleType: string;
  periodSeconds: number | null;
  cronExpr: string | null;
  timezone: string;
  lastPingAt: Date | null;
  lastDurationMs: number | null;
  consecutiveFails: number;
  tags: string[];
}

interface DashboardProps {
  user: {
    email: string;
    plan: PlanName;
    isAdmin?: boolean;
  };
  checks: CheckSummaryItem[];
  appUrl: string;
  flash?: {
    type: 'error' | 'success' | 'info';
    message: string;
  } | null;
  filter?: string;
  search?: string;
}

export const DashboardView: FC<DashboardProps> = ({
  user,
  checks,
  appUrl,
  flash,
  filter = 'all',
  search = '',
}) => {
  const planConfig = PLANS[user.plan] || PLANS.FREE;
  const totalChecks = checks.length;
  const upChecks = checks.filter((c) => c.status === 'UP').length;
  const downChecks = checks.filter((c) => c.status === 'DOWN').length;
  const pausedChecks = checks.filter((c) => c.status === 'PAUSED').length;

  const filteredChecks = checks.filter((c) => {
    if (filter === 'up' && c.status !== 'UP') return false;
    if (filter === 'down' && c.status !== 'DOWN') return false;
    if (filter === 'paused' && c.status !== 'PAUSED') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q);
      const matchTags = c.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchName && !matchTags) return false;
    }
    return true;
  });

  return (
    <Layout title="Dashboard - OrbitPing" user={user} flash={flash} activePath="/dashboard">
      {/* Top Header */}
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em;">Monitored Checks</h1>
          <p style="color: var(--text-secondary); font-size: 0.9375rem; margin-top: 0.25rem;">
            Real-time status of your cron jobs, scheduled tasks, and daemon heartbeats.
          </p>
        </div>
        <div>
          <a href="/checks/new" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Create New Check</span>
          </a>
        </div>
      </div>

      {/* Summary Metrics */}
      <div class="stats-grid">
        <div class="stat-card" style="--stat-color: var(--brand-primary);">
          <span class="stat-label">Checks Quota</span>
          <span class="stat-value">
            {totalChecks} <span style="font-size: 1rem; color: var(--text-muted); font-weight: 400;">/ {planConfig.checks}</span>
          </span>
          <span class="stat-sub">{planConfig.name} Plan Quota</span>
        </div>

        <div class="stat-card" style="--stat-color: var(--status-up);">
          <span class="stat-label">Healthy (Up)</span>
          <span class="stat-value" style="color: #34d399;">
            {upChecks}
          </span>
          <span class="stat-sub">Reporting normally</span>
        </div>

        <div class="stat-card" style="--stat-color: var(--status-down);">
          <span class="stat-label">Incidents (Down)</span>
          <span class="stat-value" style="color: #f87171;">
            {downChecks}
          </span>
          <span class="stat-sub">Missed or failed pings</span>
        </div>

        <div class="stat-card" style="--stat-color: var(--status-paused);">
          <span class="stat-label">Paused</span>
          <span class="stat-value" style="color: #fbbf24;">
            {pausedChecks}
          </span>
          <span class="stat-sub">Alerts disabled</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        class="card"
        style="margin-bottom: 1.5rem; padding: 0.875rem 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;"
      >
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <a
            href="/dashboard"
            class={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          >
            All ({totalChecks})
          </a>
          <a
            href="/dashboard?filter=up"
            class={`btn btn-sm ${filter === 'up' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Up ({upChecks})
          </a>
          <a
            href="/dashboard?filter=down"
            class={`btn btn-sm ${filter === 'down' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Down ({downChecks})
          </a>
          <a
            href="/dashboard?filter=paused"
            class={`btn btn-sm ${filter === 'paused' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Paused ({pausedChecks})
          </a>
        </div>

        <form method="GET" action="/dashboard" style="margin: 0; display: flex; gap: 0.5rem; min-width: 260px;">
          {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
          <input
            type="text"
            name="search"
            class="input"
            style="padding: 0.375rem 0.75rem; font-size: 0.875rem;"
            placeholder="Search checks or tags..."
            value={search}
          />
          <button type="submit" class="btn btn-secondary btn-sm">
            Search
          </button>
        </form>
      </div>

      {/* Checks Table or Empty State */}
      {filteredChecks.length === 0 ? (
        totalChecks === 0 ? (
          <div class="empty-state">
            <div class="empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="m4.93 4.93 4.24 4.24" />
                <path d="m14.83 9.17 4.24-4.24" />
                <path d="m14.83 14.83 4.24 4.24" />
                <path d="m9.17 14.83-4.24 4.24" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </div>
            <h3 class="empty-title">No checks created yet</h3>
            <p class="empty-desc">
              Create your first heartbeat check. In less than two minutes, you can monitor any cron job, backup script, or worker.
            </p>
            <a href="/checks/new" class="btn btn-primary">
              Create Your First Check
            </a>
          </div>
        ) : (
          <div class="empty-state">
            <h3 class="empty-title">No matching checks found</h3>
            <p class="empty-desc">No checks match your current filter or search criteria.</p>
            <a href="/dashboard" class="btn btn-secondary btn-sm">
              Clear Filters
            </a>
          </div>
        )
      ) : (
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 110px;">Status</th>
                <th>Name & Schedule</th>
                <th>Ping URL</th>
                <th>Last Ping</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredChecks.map((check) => {
                const pingUrl = `${appUrl}/ping/${check.pingUuid}`;
                const scheduleDesc =
                  check.scheduleType === 'CRON'
                    ? `Cron: ${check.cronExpr} (${check.timezone})`
                    : `Interval: Every ${
                        check.periodSeconds
                          ? check.periodSeconds < 3600
                            ? `${Math.round(check.periodSeconds / 60)}m`
                            : `${Math.round(check.periodSeconds / 3600)}h`
                          : '60s'
                      }`;

                return (
                  <tr>
                    <td>
                      <StatusBadge status={check.status} />
                    </td>
                    <td>
                      <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.125rem;">
                        <a href={`/checks/${check.id}`} style="color: inherit; text-decoration: underline-offset: 3px;">
                          {check.name}
                        </a>
                      </div>
                      <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">
                        {scheduleDesc}
                      </div>
                      {check.tags.length > 0 && (
                        <div style="display: flex; gap: 0.25rem; margin-top: 0.375rem;">
                          {check.tags.map((t) => (
                            <span
                              style="font-size: 0.6875rem; background: var(--bg-surface-elevated); padding: 0.125rem 0.375rem; border-radius: var(--radius-sm); color: var(--text-secondary);"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <code
                          style="background: #05080f; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); color: #38bdf8; font-size: 0.75rem;"
                        >
                          .../{check.pingUuid.slice(0, 8)}...
                        </code>
                        <button
                          type="button"
                          class="copy-btn"
                          onclick={`copyToClipboard('${pingUrl}', this)`}
                          title="Copy Full Ping URL"
                        >
                          Copy
                        </button>
                      </div>
                    </td>
                    <td>
                      <div style="font-size: 0.8125rem; color: var(--text-primary);">
                        {check.lastPingAt ? new Date(check.lastPingAt).toLocaleTimeString() : 'Never'}
                      </div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">
                        {check.lastPingAt ? new Date(check.lastPingAt).toLocaleDateString() : 'Awaiting first ping'}
                      </div>
                    </td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 0.5rem; align-items: center;">
                        <a href={`/checks/${check.id}`} class="btn btn-secondary btn-sm">
                          Details
                        </a>
                        <form
                          action={`/checks/${check.id}/pause`}
                          method="POST"
                          style="margin: 0; display: inline;"
                        >
                          <button
                            type="submit"
                            class="btn btn-secondary btn-sm"
                            title={check.status === 'PAUSED' ? 'Resume monitoring' : 'Pause alerts'}
                          >
                            {check.status === 'PAUSED' ? 'Resume' : 'Pause'}
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
