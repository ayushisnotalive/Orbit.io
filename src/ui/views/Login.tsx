import type { FC } from 'hono/jsx';
import { Layout } from '../layout.js';

interface LoginProps {
  flash?: {
    type: 'error' | 'success' | 'info';
    message: string;
  } | null;
  turnstileSiteKey?: string;
}

export const LoginView: FC<LoginProps> = ({ flash, turnstileSiteKey }) => {
  return (
    <Layout title="Sign In - OrbitPing" flash={flash} activePath="/login">
      <div style="max-width: 440px; margin: 3rem auto 0;">
        <div class="card" style="box-shadow: var(--shadow-lg); border-color: var(--border-medium);">
          <div style="text-align: center; margin-bottom: 2rem;">
            <div
              class="brand-icon"
              style="width: 44px; height: 44px; margin: 0 auto 1rem; border-radius: var(--radius-md);"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="2" />
                <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
              </svg>
            </div>
            <h1 style="font-size: 1.5rem; font-weight: 700; letter-spacing: -0.025em; margin-bottom: 0.5rem;">
              Welcome to OrbitPing
            </h1>
            <p style="font-size: 0.875rem; color: var(--text-secondary);">
              Passwordless dead-man's switch monitoring for your cron jobs and workers.
            </p>
          </div>

          {/* Consent Checkbox */}
          <div style="margin-bottom: 1.25rem; padding: 0.75rem; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
            <label style="display: flex; align-items: flex-start; gap: 0.625rem; font-size: 0.8125rem; color: var(--text-secondary); cursor: pointer; line-height: 1.45;">
              <input
                type="checkbox"
                id="consent-checkbox"
                name="consent"
                required
                style="margin-top: 0.15rem; accent-color: var(--brand-primary); width: 1.05rem; height: 1.05rem; cursor: pointer;"
                onchange="toggleAuthButtons(this.checked)"
              />
              <span>
                I agree to the <a href="/terms" target="_blank" style="color: var(--brand-primary); text-decoration: underline;">Terms of Service</a> and acknowledge the <a href="/privacy" target="_blank" style="color: var(--brand-primary); text-decoration: underline;">Privacy Policy</a> under the Digital Personal Data Protection (DPDP) Act, 2023.
              </span>
            </label>
          </div>

          {/* GitHub OAuth Button */}
          <div style="margin-bottom: 1.5rem;">
            <a
              id="github-login-btn"
              href="/auth/github"
              class="btn btn-secondary"
              style="width: 100%; padding: 0.75rem 1rem; font-weight: 600; opacity: 0.5; pointer-events: none;"
              onclick="return validateConsent(event)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>Continue with GitHub</span>
            </a>
          </div>

          <div style="display: flex; align-items: center; margin: 1.5rem 0; color: var(--text-muted); font-size: 0.8125rem;">
            <div style="flex: 1; height: 1px; background: var(--border-subtle);" />
            <span style="padding: 0 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.75rem;">
              Or with email magic link
            </span>
            <div style="flex: 1; height: 1px; background: var(--border-subtle);" />
          </div>

          {/* Magic Link Form */}
          <form action="/auth/magic-link" method="POST" onsubmit="return validateFormConsent(event)">
            <div class="form-group">
              <label for="email" class="form-label">
                Work Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                class="input"
                placeholder="you@company.com"
                required
                autocomplete="email"
              />
            </div>

            {turnstileSiteKey && (
              <div class="form-group">
                <div class="cf-turnstile" data-sitekey={turnstileSiteKey} />
              </div>
            )}

            <button
              id="magic-link-btn"
              type="submit"
              class="btn btn-primary"
              style="width: 100%; padding: 0.75rem 1rem; opacity: 0.5; pointer-events: none;"
            >
              <span>Send Magic Link</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14m-7-7 7 7-7 7" />
              </svg>
            </button>
          </form>

          <p style="font-size: 0.75rem; color: var(--text-muted); text-align: center; margin-top: 1.25rem;">
            We process minimal telemetry. No passwords stored. End-to-end encrypted alerts.
          </p>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            function toggleAuthButtons(checked) {
              const ghBtn = document.getElementById('github-login-btn');
              const magicBtn = document.getElementById('magic-link-btn');
              if (checked) {
                ghBtn.style.opacity = '1';
                ghBtn.style.pointerEvents = 'auto';
                magicBtn.style.opacity = '1';
                magicBtn.style.pointerEvents = 'auto';
              } else {
                ghBtn.style.opacity = '0.5';
                ghBtn.style.pointerEvents = 'none';
                magicBtn.style.opacity = '0.5';
                magicBtn.style.pointerEvents = 'none';
              }
            }

            function validateConsent(e) {
              const cb = document.getElementById('consent-checkbox');
              if (!cb || !cb.checked) {
                e.preventDefault();
                alert('Please accept the Terms of Service and Privacy Policy before continuing.');
                return false;
              }
              return true;
            }

            function validateFormConsent(e) {
              const cb = document.getElementById('consent-checkbox');
              if (!cb || !cb.checked) {
                e.preventDefault();
                alert('Please accept the Terms of Service and Privacy Policy before continuing.');
                return false;
              }
              return true;
            }
          `,
        }}
      />

      {turnstileSiteKey && (
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      )}
    </Layout>
  );
};
