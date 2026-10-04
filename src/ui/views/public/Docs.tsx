import type { FC } from 'hono/jsx';
import { Layout } from '../../layout.js';

export const DocsView: FC = () => {
  return (
    <Layout title="Documentation - OrbitPing">
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
            <a href="/docs" class="nav-link active">Documentation</a>
            <a href="/status" class="nav-link">Status</a>
          </div>

          <div class="nav-user">
            <a href="/login" class="btn btn-primary btn-sm">Sign In</a>
          </div>
        </div>
      </nav>

      <main class="container" style="padding-top: 3rem; padding-bottom: 5rem; max-width: 860px;">
        <h1 style="font-size: 2.25rem; font-weight: 800; margin-bottom: 0.75rem;">
          OrbitPing Documentation
        </h1>
        <p style="color: var(--text-secondary); font-size: 1.0625rem; margin-bottom: 2.5rem; line-height: 1.6;">
          Everything you need to integrate heartbeat and dead-man's switch monitoring into your crontabs, backup scripts, and background workers.
        </p>

        {/* Section 1: Ingestion API */}
        <section style="margin-bottom: 3rem;">
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
            1. Ping Ingestion Endpoints
          </h2>
          <p style="color: var(--text-secondary); font-size: 0.9375rem; line-height: 1.6;">
            Each check is assigned an unguessable UUIDv4. To report success, make an HTTP GET or POST request to your check URL:
          </p>
          <div class="card" style="background: #090d16; padding: 1rem; margin-bottom: 1rem;">
            <pre style="margin: 0; font-family: monospace; font-size: 0.875rem; color: #38bdf8;">
curl -fsS -m 10 https://orbitping.io/ping/YOUR-CHECK-UUID
            </pre>
          </div>
          <p style="color: var(--text-secondary); font-size: 0.875rem;">
            You can also ping the root short-form endpoint: <code>https://orbitping.io/YOUR-CHECK-UUID</code>.
          </p>
        </section>

        {/* Section 2: Start & Failure Pings */}
        <section style="margin-bottom: 3rem;">
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
            2. Tracking Execution Duration & Failures
          </h2>
          <p style="color: var(--text-secondary); font-size: 0.9375rem; line-height: 1.6;">
            To measure how long your job takes and record failure outputs when non-zero exit codes occur:
          </p>
          <div class="card" style="background: #090d16; padding: 1.25rem; margin-bottom: 1rem;">
            <pre style="margin: 0; font-family: monospace; font-size: 0.875rem; color: #e2e8f0; line-height: 1.6;">
<span style="color: #64748b;"># Signal task start</span>
curl -fsS -m 10 https://orbitping.io/ping/YOUR-CHECK-UUID/start

<span style="color: #64748b;"># Signal task failure with captured error log (capped at 256 bytes)</span>
curl -fsS -m 10 --data-binary "Fatal DB Timeout" https://orbitping.io/ping/YOUR-CHECK-UUID/fail

<span style="color: #64748b;"># Or pass an explicit exit code in the path</span>
curl -fsS -m 10 --data-binary "Exit 2 Error" https://orbitping.io/ping/YOUR-CHECK-UUID/2
            </pre>
          </div>
        </section>

        {/* Section 3: CLI Wrapper */}
        <section style="margin-bottom: 3rem;">
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
            3. The Zero-Dependency CLI
          </h2>
          <p style="color: var(--text-secondary); font-size: 0.9375rem; line-height: 1.6;">
            Use our lightweight POSIX shell script to wrap any command automatically:
          </p>
          <div class="card" style="background: #090d16; padding: 1.25rem; margin-bottom: 1rem;">
            <pre style="margin: 0; font-family: monospace; font-size: 0.875rem; color: #e2e8f0; line-height: 1.6;">
<span style="color: #64748b;"># Install with curl</span>
curl -fsSL https://orbitping.io/install.sh | sh

<span style="color: #64748b;"># Run any command through orbitping</span>
orbitping run YOUR-CHECK-UUID -- /usr/local/bin/backup.sh --full
            </pre>
          </div>
          <p style="color: var(--text-secondary); font-size: 0.875rem;">
            The CLI automatically captures start times, forwards the exact exit code, logs errors, and dispatches the tail to OrbitPing.
          </p>
        </section>

        {/* Section 4: Webhook Signing */}
        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
            4. Webhook HMAC-SHA256 Signature Verification
          </h2>
          <p style="color: var(--text-secondary); font-size: 0.9375rem; line-height: 1.6;">
            Custom HTTP webhook alerts are signed with an HMAC-SHA256 signature in the <code>X-OrbitPing-Signature</code> header:
          </p>
          <div class="card" style="background: #090d16; padding: 1.25rem;">
            <pre style="margin: 0; font-family: monospace; font-size: 0.875rem; color: #e2e8f0; line-height: 1.6;">
<span style="color: #38bdf8;">import</span> crypto <span style="color: #38bdf8;">from</span> <span style="color: #a5d6a7;">'node:crypto'</span>;

<span style="color: #38bdf8;">function</span> <span style="color: #fbbf24;">verifySignature</span>(rawBody, signatureHeader, secret) &#123;
  <span style="color: #38bdf8;">const</span> hash = crypto.createHmac(<span style="color: #a5d6a7;">'sha256'</span>, secret).update(rawBody).digest(<span style="color: #a5d6a7;">'hex'</span>);
  <span style="color: #38bdf8;">return</span> crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signatureHeader));
&#125;
            </pre>
          </div>
        </section>
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
