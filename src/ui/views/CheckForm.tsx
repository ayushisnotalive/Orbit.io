import type { FC } from 'hono/jsx';
import { Layout } from '../layout.js';
import type { PlanName } from '../../config/plans.js';

interface CheckFormData {
  id?: string;
  name?: string;
  scheduleType?: 'PERIOD' | 'CRON';
  periodSeconds?: number | null;
  cronExpr?: string | null;
  timezone?: string;
  graceSeconds?: number;
  tags?: string[];
}

interface ChannelOption {
  id: string;
  type: string;
  label: string;
}

interface CheckFormProps {
  user: {
    email: string;
    plan: PlanName;
    isAdmin?: boolean;
  };
  check?: CheckFormData;
  availableChannels?: ChannelOption[];
  selectedChannelIds?: string[];
  isEdit?: boolean;
  flash?: {
    type: 'error' | 'success' | 'info';
    message: string;
  } | null;
}

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Australia/Sydney',
];

export const CheckFormView: FC<CheckFormProps> = ({
  user,
  check,
  availableChannels = [],
  selectedChannelIds = [],
  isEdit = false,
  flash,
}) => {
  const currentScheduleType = check?.scheduleType || 'PERIOD';
  const currentTz = check?.timezone || 'UTC';
  const currentGraceMin = Math.round((check?.graceSeconds ?? 300) / 60);
  const currentPeriodMin = Math.round((check?.periodSeconds ?? 3600) / 60);

  return (
    <Layout
      title={isEdit ? `Edit Check - OrbitPing` : `Create Check - OrbitPing`}
      user={user}
      flash={flash}
      activePath="/checks/new"
    >
      <div style="max-width: 680px; margin: 1rem auto 3rem;">
        <div style="margin-bottom: 1.5rem;">
          <a href="/dashboard" style="font-size: 0.875rem; display: inline-flex; align-items: center; gap: 0.375rem; color: var(--text-muted); margin-bottom: 0.5rem;">
            &larr; Back to Dashboard
          </a>
          <h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em;">
            {isEdit ? 'Edit Heartbeat Check' : 'Create Heartbeat Check'}
          </h1>
          <p style="color: var(--text-secondary); font-size: 0.9375rem;">
            Configure schedule intervals, grace periods, and deadlines for your monitored task.
          </p>
        </div>

        <div class="card" style="box-shadow: var(--shadow-lg);">
          <form
            action={isEdit ? `/checks/${check?.id}/edit` : '/checks'}
            method="POST"
            id="check-form"
          >
            {/* Check Name */}
            <div class="form-group">
              <label for="name" class="form-label">
                Check Name <span style="color: #f87171;">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                class="input"
                placeholder="e.g. Database Nightly Backup, Stripe Ingestion Sync"
                required
                maxlength={80}
                value={check?.name || ''}
              />
              <div class="form-hint">Descriptive name for identification in alert notifications.</div>
            </div>

            {/* Schedule Type Selection */}
            <div class="form-group">
              <label class="form-label">Schedule Type</label>
              <div class="radio-tab-group">
                <input
                  type="radio"
                  id="sched-period"
                  name="scheduleType"
                  value="PERIOD"
                  class="radio-tab-input"
                  checked={currentScheduleType === 'PERIOD'}
                  onchange="toggleScheduleFields('PERIOD')"
                />
                <label for="sched-period" class="radio-tab-label">
                  Simple Interval
                </label>

                <input
                  type="radio"
                  id="sched-cron"
                  name="scheduleType"
                  value="CRON"
                  class="radio-tab-input"
                  checked={currentScheduleType === 'CRON'}
                  onchange="toggleScheduleFields('CRON')"
                />
                <label for="sched-cron" class="radio-tab-label">
                  Cron Expression
                </label>
              </div>
            </div>

            {/* Interval Configuration */}
            <div id="period-fields" style={currentScheduleType === 'PERIOD' ? 'display: block;' : 'display: none;'}>
              <div class="form-group">
                <label for="periodMinutes" class="form-label">
                  Period (Interval)
                </label>
                <div style="display: flex; gap: 0.5rem;">
                  <input
                    type="number"
                    id="periodMinutes"
                    name="periodMinutes"
                    class="input"
                    min={1}
                    max={525600}
                    value={currentPeriodMin}
                    hx-get="/checks/preview-schedule"
                    hx-trigger="keyup changed delay:300ms, change"
                    hx-target="#schedule-preview"
                    hx-include="#check-form"
                  />
                  <span style="display: flex; align-items: center; color: var(--text-secondary); font-size: 0.875rem; white-space: nowrap; padding: 0 0.5rem;">
                    Minutes
                  </span>
                </div>
                <div class="form-hint">How often your task runs (e.g. 5 for every 5m, 60 for hourly, 1440 for daily).</div>
              </div>
            </div>

            {/* Cron Configuration */}
            <div id="cron-fields" style={currentScheduleType === 'CRON' ? 'display: block;' : 'display: none;'}>
              <div class="form-group">
                <label for="cronExpr" class="form-label">
                  Cron Expression
                </label>
                <input
                  type="text"
                  id="cronExpr"
                  name="cronExpr"
                  class="input"
                  placeholder="0 2 * * * (e.g. 2:00 AM daily)"
                  value={check?.cronExpr || '0 0 * * *'}
                  hx-get="/checks/preview-schedule"
                  hx-trigger="keyup changed delay:300ms, change"
                  hx-target="#schedule-preview"
                  hx-include="#check-form"
                />
                <div class="form-hint">Standard 5-part cron syntax (minute hour day month day-of-week).</div>
              </div>

              <div class="form-group">
                <label for="timezone" class="form-label">
                  Timezone
                </label>
                <select
                  id="timezone"
                  name="timezone"
                  class="select"
                  hx-get="/checks/preview-schedule"
                  hx-trigger="change"
                  hx-target="#schedule-preview"
                  hx-include="#check-form"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option value={tz} selected={tz === currentTz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <div class="form-hint">Timezone evaluated for scheduled cron triggers.</div>
              </div>
            </div>

            {/* Live Schedule Preview Container */}
            <div
              id="schedule-preview"
              style="margin: 1.25rem 0; padding: 0.875rem 1rem; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);"
            >
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">
                Schedule Interpretation
              </div>
              <div style="font-size: 0.9375rem; color: #38bdf8; font-weight: 500;">
                {currentScheduleType === 'PERIOD'
                  ? `Runs every ${currentPeriodMin} minutes`
                  : `Cron expression: ${check?.cronExpr || '0 0 * * *'} (${currentTz})`}
              </div>
            </div>

            {/* Grace Period */}
            <div class="form-group">
              <label for="graceMinutes" class="form-label">
                Grace Window (Minutes)
              </label>
              <input
                type="number"
                id="graceMinutes"
                name="graceMinutes"
                class="input"
                min={1}
                max={10080}
                value={currentGraceMin}
              />
              <div class="form-hint">
                Extra buffer time before an alert is dispatched if a job runs slightly longer than normal.
              </div>
            </div>

            {/* Tags */}
            <div class="form-group">
              <label for="tags" class="form-label">
                Tags (Optional)
              </label>
              <input
                type="text"
                id="tags"
                name="tags"
                class="input"
                placeholder="production, database, reports"
                value={check?.tags ? check.tags.join(', ') : ''}
              />
              <div class="form-hint">Comma-separated tags for filtering in your dashboard.</div>
            </div>

            {/* Alert Channels Selection */}
            <div class="form-group" style="margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border-subtle);">
              <label class="form-label" style="font-size: 1rem; font-weight: 600;">Alert Channels</label>
              <div class="form-hint" style="margin-bottom: 0.75rem;">
                Select which notification channels receive alerts when this check goes DOWN or RECOVERS.
              </div>
              {availableChannels.length > 0 ? (
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                  {availableChannels.map((ch) => {
                    const isChecked = selectedChannelIds.includes(ch.id);
                    return (
                      <label
                        style="display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.875rem; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer;"
                      >
                        <input
                          type="checkbox"
                          name="channelIds"
                          value={ch.id}
                          checked={isChecked}
                          style="accent-color: var(--brand-primary); width: 1.1rem; height: 1.1rem; cursor: pointer;"
                        />
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                          <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: var(--bg-surface); padding: 0.15rem 0.4rem; border-radius: 4px;">
                            {ch.type}
                          </span>
                          <span style="font-weight: 500; font-size: 0.875rem;">{ch.label}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div style="padding: 0.875rem; background: var(--bg-surface-elevated); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); font-size: 0.875rem; color: var(--text-secondary);">
                  No alert channels set up yet. <a href="/channels" style="color: var(--brand-primary); font-weight: 600;">Add an Alert Channel</a> (Discord, Telegram, or Email) to receive instant alerts when your tasks fail.
                </div>
              )}
            </div>

            {/* Actions */}
            <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--border-subtle);">
              <a href="/dashboard" class="btn btn-secondary">
                Cancel
              </a>
              <button type="submit" class="btn btn-primary">
                {isEdit ? 'Save Changes' : 'Create Check'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            function toggleScheduleFields(type) {
              const pEl = document.getElementById('period-fields');
              const cEl = document.getElementById('cron-fields');
              if (type === 'PERIOD') {
                pEl.style.display = 'block';
                cEl.style.display = 'none';
              } else {
                pEl.style.display = 'none';
                cEl.style.display = 'block';
              }
              htmx.trigger('#periodMinutes', 'change');
            }
          `,
        }}
      />
    </Layout>
  );
};
