import type { FC } from 'hono/jsx';

export interface IncidentRecord {
  id: string;
  reason: string;
  startedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

export interface PingRecord {
  id: string | bigint;
  ts: Date;
  kind: string;
  exitCode: number | null;
  durationMs: number | null;
  body: string | null;
}

interface IncidentTimelineProps {
  incidents: IncidentRecord[];
  recentPings: PingRecord[];
}

export const IncidentTimeline: FC<IncidentTimelineProps> = ({ incidents, recentPings }) => {
  return (
    <div style="display: grid; grid-template-columns: 1fr; gap: 1.5rem; margin-top: 1.5rem;">
      {/* Recent Pings Table */}
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Recent Pings (Latest 20)</h3>
          <span style="font-size: 0.8125rem; color: var(--text-muted);">
            {recentPings.length === 0 ? 'No pings recorded yet' : `${recentPings.length} recorded events`}
          </span>
        </div>

        {recentPings.length === 0 ? (
          <p style="color: var(--text-muted); font-size: 0.875rem; padding: 1rem 0;">
            No pings have arrived for this check yet. Follow the integration code snippets above to send your first heartbeat.
          </p>
        ) : (
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Type</th>
                  <th>Duration</th>
                  <th>Exit Code</th>
                  <th>Message / Body</th>
                </tr>
              </thead>
              <tbody>
                {recentPings.map((ping) => {
                  const isFail = ping.kind === 'FAIL' || (ping.exitCode !== null && ping.exitCode > 0);
                  return (
                    <tr>
                      <td style="font-family: var(--font-mono); font-size: 0.8125rem;">
                        {new Date(ping.ts).toLocaleString()}
                      </td>
                      <td>
                        <span
                          class={`badge ${
                            ping.kind === 'SUCCESS'
                              ? 'badge-up'
                              : isFail
                                ? 'badge-down'
                                : 'badge-new'
                          }`}
                        >
                          {ping.kind}
                        </span>
                      </td>
                      <td style="font-family: var(--font-mono);">
                        {ping.durationMs != null ? `${ping.durationMs}ms` : '—'}
                      </td>
                      <td style="font-family: var(--font-mono);">
                        {ping.exitCode != null ? ping.exitCode : '0'}
                      </td>
                      <td style="color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        {ping.body || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Incident History Table */}
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Incident History</h3>
          <span style="font-size: 0.8125rem; color: var(--text-muted);">
            {incidents.length === 0 ? 'Zero incidents' : `${incidents.length} recorded`}
          </span>
        </div>

        {incidents.length === 0 ? (
          <p style="color: var(--text-muted); font-size: 0.875rem; padding: 1rem 0;">
            No incidents recorded. This check has 100% uptime!
          </p>
        ) : (
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Reason</th>
                  <th>Resolved</th>
                  <th>Duration</th>
                  <th>Resolved By</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => {
                  const started = new Date(incident.startedAt);
                  const resolved = incident.resolvedAt ? new Date(incident.resolvedAt) : null;
                  const durationSec = resolved
                    ? Math.round((resolved.getTime() - started.getTime()) / 1000)
                    : null;

                  return (
                    <tr>
                      <td style="font-family: var(--font-mono); font-size: 0.8125rem;">
                        {started.toLocaleString()}
                      </td>
                      <td>
                        <span class="badge badge-down">{incident.reason}</span>
                      </td>
                      <td style="font-family: var(--font-mono); font-size: 0.8125rem;">
                        {resolved ? resolved.toLocaleString() : (
                          <span style="color: #f87171; font-weight: 600;">OPEN NOW</span>
                        )}
                      </td>
                      <td style="font-family: var(--font-mono);">
                        {durationSec != null
                          ? durationSec < 60
                            ? `${durationSec}s`
                            : `${Math.round(durationSec / 60)}m`
                          : 'Ongoing'}
                      </td>
                      <td style="color: var(--text-muted);">
                        {incident.resolvedBy || (resolved ? 'Auto-recovered' : '—')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
