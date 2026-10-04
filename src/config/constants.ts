export const CONSTANTS = {
  // Ping ingestion boundaries
  PING_BODY_READ_LIMIT_BYTES: 1024, // 1 KB max read from request body
  PING_FAIL_BODY_MAX_BYTES: 256, // 256 bytes stored in DB on failure
  PING_MESSAGE_MAX_CHARS: 100, // Optional ?msg= parameter limit
  PING_START_RATE_LIMIT_SECONDS: 5, // Max 1 start ping per 5s per check

  // Scanner & Outage detection
  SCANNER_INTERVAL_SECONDS: 60, // Scans every 60s
  OUTAGE_COMPENSATION_THRESHOLD_SECONDS: 180, // Trigger compensation if last scan was > 180s ago
  OUTAGE_COMPENSATION_WINDOW_MINUTES: 5, // checks due between lastScan and now + 5 min
  OUTAGE_COMPENSATION_EXTENSION_MINUTES: 10, // extend deadlines by 10 min

  // Alert worker & queue
  ALERT_WORKER_INTERVAL_SECONDS: 10, // Polls queue every 10s
  ALERT_CLAIM_BATCH_SIZE: 25, // Claims up to 25 pending alerts per batch
  ALERT_SEND_TIMEOUT_MS: 5000, // 5s abort timeout per channel send
  ALERT_GIVE_UP_HOURS: 24, // Mark FAILED after 24h of retry failures
  CHANNEL_AUTO_DISABLE_FAILURES: 10, // Disable channel after 10 consecutive failures

  // Check default timings
  DEFAULT_GRACE_SECONDS: 300, // 5 min backend fallback
  UI_DEFAULT_GRACE_SECONDS: 900, // 15 min default in check creation form
  DEFAULT_FIRST_PING_DEADLINE_SECONDS: 86400, // 24 hours

  // Auth & sessions
  SESSION_LIFETIME_DAYS: 30, // 30-day sliding cookie session
  MAGIC_LINK_LIFETIME_MINUTES: 15, // 15-minute token expiration
  ADMIN_REAUTH_WINDOW_HOURS: 12, // Require fresh login within 12h for /admin

  // Rate limiting (in-memory per instance)
  RATE_LIMIT_PINGS_PER_IP_MINUTE: 120,
  RATE_LIMIT_MAGIC_EMAIL_PER_HOUR: 5,
  RATE_LIMIT_MAGIC_IP_PER_HOUR: 20,
  RATE_LIMIT_LOGIN_VERIFY_PER_HOUR: 10,
  RATE_LIMIT_CHANNEL_TEST_PER_HOUR: 5,
  RATE_LIMIT_ADMIN_PER_MINUTE: 60,
  NEGATIVE_CACHE_MAX_ENTRIES: 10000,
  NEGATIVE_CACHE_TTL_SECONDS: 60,
} as const;
