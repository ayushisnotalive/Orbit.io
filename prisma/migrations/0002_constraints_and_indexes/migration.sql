-- Custom partial indexes and relational integrity constraints for OrbitPing
-- Section 7.3 in OrbitPing Documentation

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));
CREATE INDEX IF NOT EXISTS checks_due_idx ON checks (alert_after) WHERE status IN ('NEW','UP');
CREATE INDEX IF NOT EXISTS pings_run_idx ON pings (check_id, run_id) WHERE run_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS one_open_incident ON incidents (check_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS alerts_pending_idx ON alerts (next_attempt_at) WHERE status = 'PENDING';
CREATE UNIQUE INDEX IF NOT EXISTS checks_user_slug_key ON checks (user_id, slug) WHERE slug IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE checks ADD CONSTRAINT checks_period_range CHECK (period_seconds IS NULL OR period_seconds BETWEEN 60 AND 31536000);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE checks ADD CONSTRAINT checks_grace_range CHECK (grace_seconds BETWEEN 60 AND 2592000);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE checks ADD CONSTRAINT checks_fpd_range CHECK (first_ping_deadline_seconds BETWEEN 300 AND 2592000);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE checks ADD CONSTRAINT checks_fail_threshold CHECK (fail_threshold BETWEEN 1 AND 5);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE checks ADD CONSTRAINT checks_schedule_shape CHECK (
    (schedule_type = 'PERIOD' AND period_seconds IS NOT NULL AND cron_expr IS NULL) OR
    (schedule_type = 'CRON' AND cron_expr IS NOT NULL AND period_seconds IS NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
