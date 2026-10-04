# OrbitPing

High-reliability heartbeat and dead-man's switch monitoring for scheduled jobs, cron tasks, and background workers.

OrbitPing inverts scheduled job monitoring: instead of waiting for error logs that never fire when a process hangs or crontab fails silently, jobs send a lightweight HTTPS ping to OrbitPing when they finish. If a report is late, missed, or reports an explicit failure, OrbitPing opens an incident and dispatches alerts via Telegram, Slack, Discord, Email, or Webhooks.

---

## Key Capabilities

- **Dead-Man's Switch Heartbeat:** Monitor crontab, systemd timers, GitHub Actions, Django/Laravel schedulers, n8n, and Make workflows.
- **Fail Fast & Measure Duration:** Optional `/start` pings measure execution runtime; `/fail` or `/<exit-code>` pings report errors immediately.
- **Zero-False-Alarm Outage Compensation:** When the monitoring service restarts or undergoes downtime, detection deadlines automatically adjust forward to prevent false alerts.
- **Atomic Incident Detection:** PostgreSQL atomic Common Table Expressions (CTEs) guarantee exact-once incident creation and alert queuing.
- **Multi-Channel Alert Delivery:** Verified Telegram Bot, Slack, Discord incoming webhooks, Resend transactional email, and HMAC-signed generic webhooks.
- **Lightweight CLI Wrapper:** Includes `orbitping run <uuid> -- <cmd...>` to transparently wrap commands without affecting exit codes.

---

## Technology Stack

- **Runtime:** Node.js 22 LTS
- **Framework:** [Hono](https://hono.dev/) with `@hono/node-server`
- **Database & ORM:** PostgreSQL 16 with [Prisma ORM](https://www.prisma.io/)
- **UI:** Server-rendered Hono JSX + [htmx](https://htmx.org/)
- **Task Scheduling:** In-process loops secured by PostgreSQL advisory locks (`pg_try_advisory_lock`)
- **Containerization:** Docker Compose + Caddy reverse proxy

---

## Getting Started

### 1. Prerequisites

- Node.js 22 LTS
- PostgreSQL 16 (or Docker)
- npm >= 10.x

### 2. Installation

```bash
git clone <repository-url>
cd Orbit.io
npm install
```

### 3. Environment Setup

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
npm run gen-key
```

Review [SETUP.md](SETUP.md) for details on setting up external integrations (GitHub OAuth, Telegram Bot, Resend).

### 4. Database Setup

```bash
# Start local PostgreSQL via Docker (if not running a local Postgres)
docker compose up -d db

# Run Prisma migrations & generate client
npm run prisma:generate
npm run prisma:migrate
```

### 5. Running the Application

```bash
# Development mode with hot reload
npm run dev

# Run unit tests
npm test
```

---

## Documentation & Architecture

Comprehensive technical specifications, API schemas, security architecture, and operational runbooks are available in [docs/PROJECT.md](docs/PROJECT.md) and [OrbitPing_Documentation.md](OrbitPing_Documentation.md).

For production deployment instructions and external service configuration, refer to [SETUP.md](SETUP.md).

---

## Privacy & Statutory Compliance

OrbitPing is engineered with privacy-by-design and strict compliance with the **Digital Personal Data Protection (DPDP) Act, 2023** (India) and international privacy frameworks:
- **Zero-Log Heartbeat Payloads:** Monitored ping payloads are ephemeral and read limits prevent accidental credential or log leakage.
- **Strict Cryptographic Protection:** Alert channel targets and customer webhook secrets are encrypted at rest using AES-256-GCM with rotation key prefixing.
- **Data Principal Rights:** Statutory rights for consent withdrawal, access, rectification, and account erasure under statutory timelines.

---

## License

Proprietary / All rights reserved.
