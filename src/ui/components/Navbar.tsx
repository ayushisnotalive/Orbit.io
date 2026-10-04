import type { FC } from 'hono/jsx';

interface NavbarProps {
  user?: {
    email: string;
    plan: string;
    isAdmin?: boolean;
  } | null;
  activePath?: string;
}

export const Navbar: FC<NavbarProps> = ({ user, activePath = '/dashboard' }) => {
  return (
    <nav class="navbar">
      <div class="container navbar-inner">
        <a href={user ? '/dashboard' : '/'} class="brand">
          <div class="brand-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="2" />
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
            </svg>
          </div>
          <span>OrbitPing</span>
        </a>

        {user && (
          <div class="nav-links">
            <a
              href="/dashboard"
              class={`nav-link ${activePath.startsWith('/dashboard') || activePath.startsWith('/checks') ? 'active' : ''}`}
            >
              Checks
            </a>
            <a
              href="/app/channels"
              class={`nav-link ${activePath.startsWith('/app/channels') ? 'active' : ''}`}
            >
              Channels
            </a>
            <a
              href="/app/billing"
              class={`nav-link ${activePath.startsWith('/app/billing') ? 'active' : ''}`}
            >
              Billing
            </a>
            {user.isAdmin && (
              <a
                href="/admin"
                class={`nav-link ${activePath.startsWith('/admin') ? 'active' : ''}`}
                style="color: #f59e0b; font-weight: 600;"
              >
                Admin
              </a>
            )}
            <a
              href="https://github.com/ayushisnotalive/Orbit.io"
              target="_blank"
              rel="noopener noreferrer"
              class="nav-link"
            >
              Docs
            </a>
          </div>
        )}

        <div class="nav-user">
          {user ? (
            <>
              <span class="badge badge-plan">{user.plan}</span>
              <span style="font-size: 0.8125rem; color: var(--text-secondary); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {user.email}
              </span>
              <form action="/auth/logout" method="POST" style="margin: 0;">
                <button type="submit" class="btn btn-secondary btn-sm">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <a href="/login" class="btn btn-primary btn-sm">
              Sign In
            </a>
          )}
        </div>
      </div>
    </nav>
  );
};
