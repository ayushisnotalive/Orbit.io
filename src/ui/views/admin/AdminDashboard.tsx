import type { FC } from 'hono/jsx';
import { Layout } from '../../layout.js';
import type { SystemTelemetry } from '../../../admin/telemetry.js';

export interface AdminDashboardProps {
  user: {
    email: string;
    plan: string;
    isAdmin?: boolean;
  };
  telemetry: SystemTelemetry;
}

export const AdminDashboardView: FC<AdminDashboardProps> = ({ user, telemetry }) => {
  const scanner = telemetry.scanner;

  return (
    <Layout title="Admin Console - OrbitPing" user={user} activePath="/admin">
      <div style="padding-bottom: 3rem;">
        {/* Admin Navigation Bar */}
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 2rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <h1 style="font-size: 1.75rem; font-weight: 700; margin: 0;">Admin Operations</h1>
              <span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171; font-weight: 600;">
                OPERATOR ACCESS
              </span>
            </div>
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.25rem;">
              Real-time platform telemetry, scanner freshness, and user lifecycle control.
            </p>
          </div>

          <div style="display: flex; gap: 0.75rem;">
            <a href="/admin" class="btn btn-secondary active" style="background: var(--surface-card);">
              Telemetry
            </a>
            <a href="/admin/users" class="btn btn-secondary">
              Users Management
            </a>
          </div>
        </div>

        {/* Operational Health Row */}
        <h2 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
          Operational Health & Freshness
        </h2>

        <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-bottom: 2.5rem;">
          {/* Scanner Freshness Card */}
          <div class="card" style="background: var(--surface-card);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="card-label">Scanner Engine</span>
              <span
                class="badge"
                style={`font-weight: 600; ${
                  scanner.status === 'HEALTHY'
                    ? 'background: rgba(16, 185, 129, 0.2); color: #6ee7b7;'
                    : scanner.status === 'DEGRADED'
                    ? 'background: rgba(245, 158, 11, 0.2); color: #fde68a;'
                    : 'background: rgba(239, 68, 68, 0.2); color: #fca5a5;'
                }`}
              >
                {scanner.status}
              </span>
            </div>
            <div style="font-size: 1.5rem; font-weight: 700; margin-top: 0.5rem;">
              {scanner.ageSeconds !== null ? `${scanner.ageSeconds}s ago` : 'Never Run'}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
              60s scan interval (degrades at &gt;90s)
            </div>
          </div>

          {/* Queue Backlog Card */}
          <div class="card" style="background: var(--surface-card);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="card-label">Alert Queue Backlog</span>
              <span
                class="badge"
                style={`font-weight: 600; ${
                  telemetry.queueBacklog === 0
                    ? 'background: rgba(16, 185, 129, 0.2); color: #6ee7b7;'
                    : 'background: rgba(245, 158, 11, 0.2); color: #fde68a;'
                }`}
              >
                {telemetry.queueBacklog === 0 ? 'CLEAR' : 'PENDING'}
              </span>
            </div>
            <div style="font-size: 1.5rem; font-weight: 700; margin-top: 0.5rem;">
              {telemetry.queueBacklog} <span style="font-size: 0.875rem; font-weight: normal; color: var(--text-muted);">alerts</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
              Unprocessed delivery jobs
            </div>
          </div>

          {/* Active Incidents Card */}
          <div class="card" style="background: var(--surface-card);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="card-label">Active Incidents</span>
              <span
                class="badge"
                style={`font-weight: 600; ${
                  telemetry.activeIncidents === 0
                    ? 'background: rgba(16, 185, 129, 0.2); color: #6ee7b7;'
                    : 'background: rgba(239, 68, 68, 0.2); color: #fca5a5;'
                }`}
              >
                {telemetry.activeIncidents === 0 ? 'ALL UP' : `${telemetry.activeIncidents} DOWN`}
              </span>
            </div>
            <div style="font-size: 1.5rem; font-weight: 700; margin-top: 0.5rem;">
              {telemetry.activeIncidents}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
              {telemetry.recentIncidents24h} incidents opened in last 24h
            </div>
          </div>
        </div>

        {/* Database & Volume Totals */}
        <h2 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
          Platform Metrics & Storage
        </h2>

        <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
          <div class="card" style="background: var(--surface-card);">
            <div class="card-label">Total Registered Users</div>
            <div style="font-size: 1.375rem; font-weight: 700; margin-top: 0.25rem;">
              {telemetry.totalUsers}
            </div>
          </div>
          <div class="card" style="background: var(--surface-card);">
            <div class="card-label">Monitored Checks</div>
            <div style="font-size: 1.375rem; font-weight: 700; margin-top: 0.25rem;">
              {telemetry.totalChecks}
            </div>
          </div>
          <div class="card" style="background: var(--surface-card);">
            <div class="card-label">Configured Channels</div>
            <div style="font-size: 1.375rem; font-weight: 700; margin-top: 0.25rem;">
              {telemetry.totalChannels}
            </div>
          </div>
          <div class="card" style="background: var(--surface-card);">
            <div class="card-label">Ingested Pings (24h)</div>
            <div style="font-size: 1.375rem; font-weight: 700; margin-top: 0.25rem;">
              {telemetry.recentPings24h}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
