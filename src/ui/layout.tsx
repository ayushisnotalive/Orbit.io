import type { FC, PropsWithChildren } from 'hono/jsx';
import { Navbar } from './components/Navbar.js';

export interface LayoutProps extends PropsWithChildren {
  title?: string;
  user?: {
    email: string;
    plan: string;
    isAdmin?: boolean;
  } | null;
  activePath?: string;
  flash?: {
    type: 'error' | 'success' | 'info' | 'warning';
    message: string;
  } | null;
}

export const Layout: FC<LayoutProps> = ({
  title = 'OrbitPing - High Reliability Dead-Man Switch & Cron Monitor',
  user,
  activePath = '/dashboard',
  flash,
  children,
}) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/static/css/app.css" />
        <script src="/static/js/htmx.min.js"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.addEventListener('DOMContentLoaded', () => {
                document.body.addEventListener('htmx:configRequest', (event) => {
                  const match = document.cookie.match(/orbitping_csrf=([^;]+)/);
                  if (match && match[1]) {
                    event.detail.headers['X-CSRF-Token'] = match[1];
                  }
                  event.detail.headers['X-Requested-With'] = 'XMLHttpRequest';
                });
              });

              function copyToClipboard(text, btnElement) {
                navigator.clipboard.writeText(text).then(() => {
                  const original = btnElement.innerHTML;
                  btnElement.innerText = 'Copied!';
                  setTimeout(() => {
                    btnElement.innerHTML = original;
                  }, 2000);
                });
              }
            `,
          }}
        />
      </head>
      <body>
        <Navbar user={user} activePath={activePath} />

        <main class="main-content">
          <div class="container">
            {flash && (
              <div class="flash-container">
                <div class={`flash-message flash-${flash.type}`}>
                  <span>{flash.message}</span>
                </div>
              </div>
            )}
            {children}
          </div>
        </main>

        <footer style="border-top: 1px solid var(--border-subtle); padding: 2rem 0; margin-top: auto; font-size: 0.8125rem; color: var(--text-muted); text-align: center;">
          <div class="container">
            <p style="margin-bottom: 0.75rem;">
              OrbitPing &bull; Inverted dead-man's switch monitoring for background jobs, cron, and daemons.
            </p>
            <div style="display: flex; justify-content: center; gap: 1.25rem; font-size: 0.8125rem; flex-wrap: wrap;">
              <a href="/pricing" style="color: var(--text-secondary); text-decoration: none;">Pricing</a>
              <a href="/docs" style="color: var(--text-secondary); text-decoration: none;">Documentation</a>
              <a href="/status" style="color: var(--text-secondary); text-decoration: none;">Status</a>
              <a href="/terms" style="color: var(--text-secondary); text-decoration: none;">Terms</a>
              <a href="/privacy" style="color: var(--text-secondary); text-decoration: none;">Privacy</a>
              <a href="/refunds" style="color: var(--text-secondary); text-decoration: none;">Refunds</a>
            </div>
            <div style="margin-top: 0.75rem; font-size: 0.75rem; color: var(--text-muted);">
              &copy; {new Date().getFullYear()} OrbitPing. All rights reserved.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
};
