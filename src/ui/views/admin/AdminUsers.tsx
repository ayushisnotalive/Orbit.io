import type { FC } from 'hono/jsx';
import { Layout } from '../../layout.js';
import type { Plan, PlanSource, PlanStatus } from '@prisma/client';

export interface AdminUserRow {
  id: string;
  email: string;
  plan: Plan;
  planSource: PlanSource;
  planStatus: PlanStatus;
  adminPlanUntil: Date | null;
  disabledAt: Date | null;
  disabledReason: string | null;
  createdAt: Date;
  checksCount: number;
  channelsCount: number;
}

export interface AdminUsersProps {
  user: {
    email: string;
    plan: string;
    isAdmin?: boolean;
  };
  users: AdminUserRow[];
  query?: string;
  page: number;
  totalPages: number;
  flash?: {
    type: 'success' | 'error';
    message: string;
  };
}

export const AdminUsersView: FC<AdminUsersProps> = ({
  user,
  users,
  query = '',
  page,
  totalPages,
  flash,
}) => {
  return (
    <Layout title="Admin User Management - OrbitPing" user={user} flash={flash} activePath="/admin">
      <div style="padding-bottom: 3rem;">
        {/* Navigation & Header */}
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 2rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <h1 style="font-size: 1.75rem; font-weight: 700; margin: 0;">User Management</h1>
              <span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171; font-weight: 600;">
                OPERATOR ACCESS
              </span>
            </div>
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.25rem;">
              Search accounts, modify plan allocations, or suspend abusive users.
            </p>
          </div>

          <div style="display: flex; gap: 0.75rem;">
            <a href="/admin" class="btn btn-secondary">
              Telemetry
            </a>
            <a href="/admin/users" class="btn btn-secondary active" style="background: var(--surface-card);">
              Users Management
            </a>
          </div>
        </div>

        {/* Flash banner */}
        {flash && (
          <div
            style={`padding: 0.875rem 1.25rem; border-radius: var(--radius-md); margin-bottom: 1.5rem; font-size: 0.875rem; ${
              flash.type === 'error'
                ? 'background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;'
                : 'background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #6ee7b7;'
            }`}
          >
            {flash.message}
          </div>
        )}

        {/* Search bar */}
        <div style="margin-bottom: 1.5rem;">
          <form method="GET" action="/admin/users" style="display: flex; gap: 0.75rem; max-width: 480px; margin: 0;">
            <input
              type="text"
              name="q"
              value={query}
              placeholder="Search users by email..."
              class="form-control"
              style="flex: 1;"
            />
            <button type="submit" class="btn btn-primary">
              Search
            </button>
            {query && (
              <a href="/admin/users" class="btn btn-secondary">
                Clear
              </a>
            )}
          </form>
        </div>

        {/* Users Table */}
        <div class="card" style="padding: 0; overflow-x: auto; background: var(--surface-card);">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">
                <th style="padding: 1rem 1.25rem;">User</th>
                <th style="padding: 1rem 1.25rem;">Plan</th>
                <th style="padding: 1rem 1.25rem;">Status</th>
                <th style="padding: 1rem 1.25rem;">Resources</th>
                <th style="padding: 1rem 1.25rem;">Joined</th>
                <th style="padding: 1rem 1.25rem; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colspan={6} style="padding: 3rem 1.25rem; text-align: center; color: var(--text-muted);">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isDisabled = u.disabledAt !== null;

                  return (
                    <tr style="border-bottom: 1px solid var(--border-color);">
                      <td style="padding: 1rem 1.25rem;">
                        <div style="font-weight: 600; color: var(--text-primary);">{u.email}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">{u.id}</div>
                      </td>

                      <td style="padding: 1rem 1.25rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                          <span class="badge badge-plan">{u.plan}</span>
                          <span
                            class="badge"
                            style={`font-size: 0.6875rem; ${
                              u.planSource === 'ADMIN'
                                ? 'background: rgba(168, 85, 247, 0.2); color: #d8b4fe;'
                                : 'background: rgba(255, 255, 255, 0.05); color: var(--text-muted);'
                            }`}
                          >
                            {u.planSource}
                          </span>
                        </div>
                        {u.adminPlanUntil && (
                          <div style="font-size: 0.75rem; color: #d8b4fe; margin-top: 0.25rem;">
                            Until: {u.adminPlanUntil.toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      <td style="padding: 1rem 1.25rem;">
                        {isDisabled ? (
                          <div>
                            <span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5;">
                              DISABLED
                            </span>
                            {u.disabledReason && (
                              <div style="font-size: 0.6875rem; color: #fca5a5; margin-top: 0.25rem;">
                                {u.disabledReason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7;">
                            {u.planStatus}
                          </span>
                        )}
                      </td>

                      <td style="padding: 1rem 1.25rem; color: var(--text-secondary);">
                        <div>{u.checksCount} checks</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">{u.channelsCount} channels</div>
                      </td>

                      <td style="padding: 1rem 1.25rem; color: var(--text-muted);">
                        {u.createdAt.toLocaleDateString()}
                      </td>

                      <td style="padding: 1rem 1.25rem; text-align: right;">
                        <div style="display: flex; gap: 0.5rem; justify-content: flex-end; align-items: center;">
                          {/* Plan Override Form */}
                          <form
                            action={`/admin/users/${u.id}/plan`}
                            method="POST"
                            style="margin: 0; display: inline-flex; gap: 0.25rem;"
                          >
                            <select
                              name="plan"
                              class="form-control"
                              style="font-size: 0.75rem; padding: 0.25rem 0.5rem; height: auto;"
                            >
                              <option value="FREE" selected={u.plan === 'FREE'}>Free</option>
                              <option value="PRO" selected={u.plan === 'PRO'}>Pro</option>
                              <option value="PLUS" selected={u.plan === 'PLUS'}>Plus</option>
                            </select>
                            <select
                              name="durationDays"
                              class="form-control"
                              style="font-size: 0.75rem; padding: 0.25rem 0.5rem; height: auto;"
                            >
                              <option value="30">30d</option>
                              <option value="90">90d</option>
                              <option value="365">1yr</option>
                              <option value="0" selected={!u.adminPlanUntil}>Forever</option>
                            </select>
                            <button type="submit" class="btn btn-secondary btn-sm" title="Apply Plan Override">
                              Set
                            </button>
                          </form>

                          {/* Disable / Enable Action */}
                          {isDisabled ? (
                            <form action={`/admin/users/${u.id}/enable`} method="POST" style="margin: 0;">
                              <button
                                type="submit"
                                class="btn btn-sm"
                                style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.3);"
                              >
                                Enable
                              </button>
                            </form>
                          ) : (
                            <form
                              action={`/admin/users/${u.id}/disable`}
                              method="POST"
                              style="margin: 0; display: inline-flex; gap: 0.25rem;"
                            >
                              <input
                                type="text"
                                name="reason"
                                placeholder="Reason..."
                                style="font-size: 0.75rem; padding: 0.25rem 0.5rem; width: 100px; background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary);"
                              />
                              <button
                                type="submit"
                                class="btn btn-danger btn-sm"
                                onclick="return confirm('Suspend this user and revoke all active sessions?');"
                              >
                                Disable
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem;">
            <div style="font-size: 0.8125rem; color: var(--text-muted);">
              Page {page} of {totalPages}
            </div>
            <div style="display: flex; gap: 0.5rem;">
              {page > 1 && (
                <a href={`/admin/users?page=${page - 1}&q=${encodeURIComponent(query)}`} class="btn btn-secondary btn-sm">
                  Previous
                </a>
              )}
              {page < totalPages && (
                <a href={`/admin/users?page=${page + 1}&q=${encodeURIComponent(query)}`} class="btn btn-secondary btn-sm">
                  Next
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
