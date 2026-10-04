import type { FC } from 'hono/jsx';
import { Layout } from '../../layout.js';

export interface LegalProps {
  title: string;
  lastUpdated: string;
  sections: Array<{
    heading: string;
    content: string;
  }>;
}

export const LegalView: FC<LegalProps> = ({ title, lastUpdated, sections }) => {
  return (
    <Layout title={`${title} - OrbitPing`}>
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
            <a href="/status" class="nav-link">Status</a>
          </div>

          <div class="nav-user">
            <a href="/login" class="btn btn-primary btn-sm">Sign In</a>
          </div>
        </div>
      </nav>

      <main class="container" style="padding-top: 3.5rem; padding-bottom: 5rem; max-width: 800px;">
        <h1 style="font-size: 2.25rem; font-weight: 800; margin-bottom: 0.5rem;">
          {title}
        </h1>
        <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 2.5rem;">
          Last updated: {lastUpdated}
        </div>

        <div style="display: flex; flex-direction: column; gap: 2rem;">
          {sections.map((section) => (
            <section>
              <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.75rem;">
                {section.heading}
              </h2>
              <p style="color: var(--text-secondary); font-size: 0.9375rem; line-height: 1.7; margin: 0; white-space: pre-line;">
                {section.content}
              </p>
            </section>
          ))}
        </div>
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
