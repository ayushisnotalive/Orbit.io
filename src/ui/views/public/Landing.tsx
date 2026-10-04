import type { FC } from 'hono/jsx';
import { Layout } from '../../layout.js';

export const LandingView: FC = () => {
  return (
    <Layout title="OrbitPing - High-Reliability Cron Job & Heartbeat Monitoring" activePath="/">

      {/* Hero Section */}
      <header class="container" style="padding: 4rem 1rem 3rem 1rem; text-align: center;">
        <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); padding: 0.375rem 0.875rem; border-radius: 9999px; font-size: 0.8125rem; color: #38bdf8; margin-bottom: 1.5rem; font-weight: 500;">
          <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #38bdf8;"></span>
          High-Reliability Dead-Man's Switch
        </div>

        <h1 style="font-size: clamp(2.25rem, 5vw, 3.5rem); font-weight: 800; line-height: 1.15; letter-spacing: -0.03em; max-width: 820px; margin: 0 auto 1.25rem auto;">
          Never let a silent background cron failure slip by.
        </h1>

        <p style="font-size: 1.125rem; color: var(--text-secondary); max-width: 620px; margin: 0 auto 2rem auto; line-height: 1.6;">
          Your scheduled jobs report completion to an unguessable secret ping URL. If a task fails, hangs, or misses its deadline, OrbitPing alerts your team immediately.
        </p>

        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-bottom: 3.5rem;">
          <a href="/login" class="btn btn-primary" style="padding: 0.75rem 1.75rem; font-size: 1rem;">
            Start Monitoring for Free
          </a>
          <a href="/docs" class="btn btn-secondary" style="padding: 0.75rem 1.75rem; font-size: 1rem;">
            Read the Documentation
          </a>
        </div>

        {/* Quickstart Code Preview Card */}
        <div
          class="card"
          style="max-width: 720px; margin: 0 auto; text-align: left; padding: 0; background: #090d16; border: 1px solid var(--border-color); box-shadow: 0 20px 40px -15px rgba(0,0,0,0.7);"
        >
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); background: rgba(255,255,255,0.02);">
            <div style="display: flex; gap: 6px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
              <span style="width: 10px; height: 10px; border-radius: 50%; background: #f59e0b; display: inline-block;"></span>
              <span style="width: 10px; height: 10px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
            </div>
            <span style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">crontab -e</span>
          </div>
          <pre style="padding: 1.25rem; margin: 0; font-family: monospace; font-size: 0.875rem; color: #e2e8f0; line-height: 1.6; overflow-x: auto;">
<span style="color: #64748b;"># 1. Direct one-line ping at job completion</span>
0 2 * * * /backup.sh && curl -fsS -m 10 https://orbitping.io/ping/1a2b3c4d-5e6f

<span style="color: #64748b;"># 2. Or wrap any job with OrbitPing CLI to track execution time & failure logs</span>
0 2 * * * orbitping run 1a2b3c4d-5e6f -- /backup.sh
          </pre>
        </div>
      </header>

      {/* Feature Grid */}
      <section class="container" style="padding: 4rem 1rem;">
        <div style="text-align: center; margin-bottom: 3rem;">
          <h2 style="font-size: 1.875rem; font-weight: 700; margin-bottom: 0.5rem;">
            Engineered for High-Reliability Dead-Man's Switch Monitoring
          </h2>
          <p style="color: var(--text-secondary); font-size: 1rem;">
            Built with atomic Postgres CTEs, zero false-alarm guarantees, and instant multi-channel dispatch.
          </p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
          <div class="card" style="background: var(--surface-card);">
            <div style="font-size: 1.5rem; margin-bottom: 0.75rem;">📡</div>
            <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">Inverted Heartbeat Detection</h3>
            <p style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6;">
              No open firewall ports, incoming connections, or heavy agents. Your jobs make outgoing HTTPS pings to our distributed origin.
            </p>
          </div>

          <div class="card" style="background: var(--surface-card);">
            <div style="font-size: 1.5rem; margin-bottom: 0.75rem;">⚡</div>
            <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">Sub-200ms Ping Ingestion</h3>
            <p style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6;">
              Fail-open, ultra-low latency ingestion endpoints acknowledge your heartbeats in milliseconds without slowing down your production workloads.
            </p>
          </div>

          <div class="card" style="background: var(--surface-card);">
            <div style="font-size: 1.5rem; margin-bottom: 0.75rem;">🔔</div>
            <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">Multi-Channel Delivery</h3>
            <p style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6;">
              Dispatch alerts across Resend Email, Telegram Bot, Slack, Discord, or generic HMAC-SHA256 signed webhooks with SSRF defense.
            </p>
          </div>

          <div class="card" style="background: var(--surface-card);">
            <div style="font-size: 1.5rem; margin-bottom: 0.75rem;">🛡️</div>
            <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">Zero False-Alarm Guarantee</h3>
            <p style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6;">
              Outage compensation and configurable grace periods prevent cascade alerting storms during routine network hiccups or system maintenance.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section class="container" style="padding: 2rem 1rem 4rem 1rem;">
        <div
          class="card"
          style="background: linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(14, 165, 233, 0.03) 100%); border: 1px solid rgba(56, 189, 248, 0.3); text-align: center; padding: 3rem 1.5rem;"
        >
          <h2 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 0.75rem;">
            Ready to secure your background jobs?
          </h2>
          <p style="color: var(--text-secondary); font-size: 1rem; max-width: 500px; margin: 0 auto 1.5rem auto;">
            Get started in under two minutes with 10 free checks and unlimited pings.
          </p>
          <a href="/login" class="btn btn-primary" style="padding: 0.75rem 2rem; font-size: 1rem;">
            Create Your Free Account
          </a>
        </div>
      </section>
    </Layout>
  );
};
