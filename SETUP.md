# OrbitPing Setup & Environment Guide

This file tracks all tools, links, and environment variables needed to develop and run OrbitPing. When you configure any item, mark it with `[x]` or provide your values, and the agent will detect it on subsequent runs.

---

## 1. System Requirements & Tools

| Tool | Required Version | Status | Detection / Notes |
|---|---|---|---|
| **Node.js** | 22 LTS (>= 22.0.0) | [x] Installed (`v22.23.2`) | Local runtime |
| **npm** | >= 10.0.0 | [x] Installed (`10.9.8`) | Package manager |
| **PostgreSQL** | 16.x | [x] Installed (`16.15`) / Docker | Required for advisory locks & CTEs |
| **Docker & Compose** | Docker 24+ / Compose v2 | [x] Installed (`29.1.3`) | Container stack for local dev / prod |

---

## 2. Environment Variables Checklist

Copy `.env.example` to `.env` in the project root:
```bash
cp .env.example .env
```

### Phase 0 & Phase 1: Core Runtime & Database

| Variable | Description | Default / Example | Status |
|---|---|---|---|
| `NODE_ENV` | Application environment | `development` | [x] Ready (default) |
| `PORT` | Local web server port | `3000` | [x] Ready (default: 3000) |
| `APP_URL` | Canonical app URL | `http://localhost:3000` | [x] Ready (default) |
| `PING_HOST` | Hostname for short ping URLs | `http://localhost:3000` | [x] Ready (default) |
| `DATABASE_URL` | Pooled connection string | `postgresql://orbitping:orbitping_dev_password@localhost:5433/orbitping_dev?schema=public` | [x] Running & Migrated (port 5433) |
| `DIRECT_URL` | Direct connection for migrations | `postgresql://orbitping:orbitping_dev_password@localhost:5433/orbitping_dev?schema=public` | [x] Running & Migrated (port 5433) |

---

### Phase 2: Security & Cryptography

| Variable | Description | Setup Guide / Value | Status |
|---|---|---|---|
| `SESSION_SECRET` | 64-char random hex key for session cookies | Generated via `npm run gen-key` | [x] Generated in `.env` |
| `ENC_KEY_V1` | 32-byte base64 AES-256-GCM key | Generated via `npm run gen-key` | [x] Generated in `.env` |
| `ENC_KEY_CURRENT` | Current active key identifier | `v1` | [x] Set to `v1` |

---

### Phase 6 & Phase 7: Authentication, Email & Chat Alerts

| Variable | Service | Dashboard / Link | Status |
|---|---|---|---|
| `ADMIN_EMAILS` | Comma-separated admin emails | Add your primary email address | [ ] Pending your email |
| `GITHUB_CLIENT_ID` | GitHub OAuth App | [GitHub Developer Settings](https://github.com/settings/developers) | [ ] Pending OAuth App |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App | [GitHub Developer Settings](https://github.com/settings/developers) | [ ] Pending OAuth App |
| `RESEND_API_KEY` | Resend Email API | [Resend Dashboard](https://resend.com/api-keys) | [ ] Pending API Key |
| `MAIL_FROM` | Sending sender string | `OrbitPing <alerts@mail.yourdomain.com>` | [ ] Pending Sender |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API | Telegram `@BotFather` | [ ] Pending Bot creation |
| `TELEGRAM_BOT_USERNAME`| Telegram Bot username | e.g. `OrbitPingBot` | [ ] Pending Bot creation |
| `TELEGRAM_WEBHOOK_SECRET`| 32+ random chars | Random string for webhook validation | [ ] Pending generation |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile | [Cloudflare Dashboard](https://dash.cloudflare.com/?to=/:account/turnstile) | [ ] Optional in local dev |
| `TURNSTILE_SECRET` | Cloudflare Turnstile | [Cloudflare Dashboard](https://dash.cloudflare.com/?to=/:account/turnstile) | [ ] Optional in local dev |

---

### Phase 10: Billing & Merchant of Record

| Variable | Service | Dashboard / Link | Status |
|---|---|---|---|
| `BILLING_PROVIDER` | MoR Provider | `polar` / `lemonsqueezy` / `paddle` | [ ] Pending provider choice |
| `BILLING_API_KEY` | Provider API Secret | Provider Developer Settings | [ ] Pending provider |
| `BILLING_WEBHOOK_SECRET` | Webhook verification key | Provider Webhooks | [ ] Pending provider |
| `PRICE_ID_PRO_MONTHLY` | Provider Price ID | Provider Products/Prices | [ ] Pending provider |
| `PRICE_ID_PRO_YEARLY` | Provider Price ID | Provider Products/Prices | [ ] Pending provider |
| `PRICE_ID_PLUS_MONTHLY`| Provider Price ID | Provider Products/Prices | [ ] Pending provider |
| `PRICE_ID_PLUS_YEARLY` | Provider Price ID | Provider Products/Prices | [ ] Pending provider |

---

### Phase 13: Operations & External Monitoring

| Variable | Service | Dashboard / Link | Status |
|---|---|---|---|
| `WATCHER_URL` | Healthchecks.io ping for scanner | [Healthchecks.io](https://healthchecks.io/) | [ ] Optional in local dev |
| `SYNTHETIC_CHECK_UUID` | Own check UUID for self-monitoring | Internal check UUID | [ ] Will be seeded |
| `SENTRY_DSN` | Sentry Error Reporting | [Sentry.io](https://sentry.io/) | [ ] Optional |

---

## 3. External Portals & Setup Links

1. **GitHub OAuth Application:**
   - URL: [https://github.com/settings/applications/new](https://github.com/settings/applications/new)
   - Application Name: `OrbitPing (Local Dev)`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/auth/github/callback`

2. **Telegram Bot Setup:**
   - Open Telegram and message `@BotFather`
   - Command: `/newbot`
   - Name: `OrbitPing`
   - Username: `YourBotName_bot`
   - Disable privacy mode: `/setprivacy` -> `Disable` (allows reading `/start` in groups)

3. **Resend Email Setup:**
   - URL: [https://resend.com](https://resend.com)
   - Add sending domain or test with sandbox address `onboarding@resend.dev`
