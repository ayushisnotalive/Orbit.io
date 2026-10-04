import type { FC } from 'hono/jsx';
import { Layout } from '../../layout.js';
import type { StatusNotice } from '@prisma/client';

export interface StatusViewProps {
  overallStatus: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE';
  scannerStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  scannerAgeSeconds: number | null;
  notices: StatusNotice[];
}

export const StatusView: FC<StatusViewProps> = ({
  overallStatus,
  scannerStatus,
  scannerAgeSeconds,
  notices,
}) => {
  const isAllGood = overallStatus === 'OPERATIONAL' && notices.length === 0;

  return (
    <Layout title="System Status - OrbitPing">
      <nav class="navbar">
        <div class="container navbar-inner">
          <a href="/" class="brand">
            <div class="brand-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="2" />
                <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
              </svg>
            </div>
            <span>OrbitPing</span>
          </a>

          <div class="nav-links">
            <a href="/pricing" class="nav-link">Pricing</a>
            <a href="/docs" class="nav-link">Documentation</a>
            <a href="/status" class="nav-link active">Status</a>
          </div>

          <div class="nav-user">
            <a href="/login" class="btn btn-primary btn-sm">Sign In</a>
          </div>
        </div>
      </nav>

      <main class="container" style="padding-top: 3.5rem; padding-bottom: 5rem; max-width: 820px;">
        <div style="margin-bottom: 2.5rem; text-align: center;">
          <h1 style="font-size: 2.25rem; font-weight: 800; margin-bottom: 0.5rem;">
            OrbitPing System Status
          </h1>
          <p style="color: var(--text-secondary); font-size: 1rem;">
            Current real-time operational status of all core monitoring infrastructure.
          </p>
        </div>

        {/* Global Banner */}
        <div
          class="card"
          style={`margin-bottom: 2.5rem; display: flex; align-items: center; justify-content: space-between; padding: 1.5rem; ${
            isAllGood
              ? 'background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);'
              : 'background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3);'
          }`}
        >
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span
              style={`width: 14px; height: 14px; border-radius: 50%; display: inline-block; ${
                isAllGood ? 'background: #10b981;' : 'background: #f59e0b;'
              }`}
            ></span>
            <div style="font-size: 1.25rem; font-weight: 700;">
              {isAllGood ? 'All Systems Operational' : 'Degraded Performance Detected'}
            </div>
          </div>
          <span style="font-size: 0.8125rem; color: var(--text-muted);">
            Updated: {new Date().toLocaleTimeString()}
          </span>
        </div>

        {/* Subsystems Breakdown */}
        <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem;">
          Subsystems
        </h2>

        <div class="card" style="padding: 0; background: var(--surface-card); margin-bottom: 2.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-color);">
            <div>
              <div style="font-weight: 600;">Ping Ingestion API</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Global edge /ping/:uuid HTTP endpoints</div>
            </div>
            <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; font-weight: 600;">
              OPERATIONAL
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-color);">
            <div>
              <div style="font-weight: 600;">Scanner CTE Engine</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                Atomic deadline evaluation {scannerAgeSeconds !== null ? `(${scannerAgeSeconds}s ago)` : ''}
              </div>
            </div>
            <span
              class="badge"
              style={`font-weight: 600; ${
                scannerStatus === 'HEALTHY'
                  ? 'background: rgba(16, 185, 129, 0.2); color: #6ee7b7;'
                  : 'background: rgba(245, 158, 11, 0.2); color: #fde68a;'
              }`}
            >
              {scannerStatus === 'HEALTHY' ? 'OPERATIONAL' : scannerStatus}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-color);">
            <div>
              <div style="font-weight: 600;">Alert Worker Queue</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Telegram, Discord, Slack & Resend dispatch</div>
            </div>
            <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; font-weight: 600;">
              OPERATIONAL
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem;">
            <div>
              <div style="font-weight: 600;">Customer Dashboard & Auth</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Web application and session controllers</div>
            </div>
            <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; font-weight: 600;">
              OPERATIONAL
            </span>
          </div>
        </div>

        {/* Notices Section */}
        {notices.length > 0 && (
          <div>
            <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem;">
              Active Notices
            </h2>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              {notices.map((n) => (
                <div class="card" style="background: var(--surface-card); border-left: 4px solid #f59e0b;">
                  <div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">{n.title}</div>
                  {n.body && <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">{n.body}</p>}
                  <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                    Started: {n.startedAt.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer style="border-top: 1px solid var(--border-color); padding: 3rem 0; font-size: 0.875rem; color: var(--text-muted);">
        <div class="container" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem;">
          <div>OrbitPing &copy; {new Date().getFullYear()}</div>
          <div style="display: flex; gap: 1.5rem;">
            <a href="/pricing" style="color: var(--text-secondary); text-decoration: none;">Pricing</a>
            <a href="/docs" style="color: var(--text-secondary); text-decoration: none;">Docs</a>
            <a href="/status" style="color: var(--text-secondary); text-decoration: none;">Status</a>
            <a href="/terms" style="color: var(--text-secondary); text-decoration: none;">Terms</a>
            <a href="/privacy" style="color: var(--text-secondary); text-decoration: none;">Privacy</a>
            <a href="/refunds" style="color: var(--text-secondary); text-decoration: none;">Refunds</a>
          </div>
        </div>
      </footer>
    </Layout>
  );
};
