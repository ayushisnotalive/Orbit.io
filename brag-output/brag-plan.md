# Brag Plan: OrbitPing

## What is this app?
OrbitPing is a high-reliability heartbeat and inverted dead-man's switch monitor for scheduled jobs, cron tasks, and background workers that detects silent failures and missed deadlines before users notice.

## The angle
Scheduled background jobs fail quietly: cron errors don't send emails when the daemon hangs, crontabs are misconfigured, or the container crashes. OrbitPing inverts the paradigm—your jobs ping an unguessable HTTPS secret URL when they finish, backed by atomic Postgres CTEs, zero false-alarm outage compensation, and instant multi-channel alerting.

## Hook (first 2-3 seconds)
An obsidian terminal window in the dead of night: `0 2 * * * /backup.sh`. The cursor blinks into darkness. A stark warning slams in: *"Your cron job failed silently at 2:00 AM. Nobody noticed."*

## Key moments (the middle)
1. **The Inverted Dead-Man's Switch (Scene 2):** Showing the one-line fix—wrapping any command with `orbitping run <uuid> -- /backup.sh` or a simple `curl` ping.
2. **Real Monitored Checks Dashboard (Scene 3):** Obsidian UI cards populating live with emerald `UP` pulses, latency meters (<200ms), and an atomic alert trigger when a deadline is missed (`DOWN`).
3. **Instant Multi-Channel Dispatch (Scene 4):** Lightning-fast alert delivery across Telegram Bot, Slack, Discord, Resend Email, and HMAC-signed Webhooks with SSRF defense.

## Outro / punchline
The glowing OrbitPing radar emblem resolves with confidence: *"Never let a silent background cron failure slip by."* Followed by *"Start Monitoring for Free • orbitping.io"*.

## User flow worth showing
1. **Entry:** Add one line to crontab or wrap with the CLI: `orbitping run 1a2b3c4d -- /backup.sh`.
2. **Action:** Monitored task runs and sends an outgoing sub-200ms HTTPS ping to `/ping/<uuid>`.
3. **Result:** Dashboard lights up healthy; if a run is late or fails, instant incident opened with zero false alarms.

## Tone
- Preset: `polished`
- Creative direction: "Sleek infra dead-man's switch motion promo — cyber-obsidian styling, high-velocity terminal execution, and instantaneous multi-channel dispatch."
- Interpretation: Restrained, authoritative engineering confidence. Dark obsidian glassmorphism, snappy terminal typography, radiant emerald and ruby status indicators, with clean cuts that let key technical claims land.

## Format: landscape — 1920x1080
## Duration: 20.0s

## Visual identity (from the project)
- Background: `#080c14` (Obsidian theme `--bg-app`) with surface glass `#0f172a`
- Surface Elevated: `#1e293b`
- Accent / Brand: `#6366f1` (Indigo primary) and `#a855f7` (Purple secondary)
- Status UP: `#10b981` (Emerald pulse)
- Status DOWN: `#ef4444` (Ruby crimson alert)
- Text Primary: `#f8fafc`
- Text Secondary: `#94a3b8`
- Display font: `Inter`, sans-serif
- Code font: `JetBrains Mono`, monospace
- Strongest visual element: Pulsing concentric orbit radar waves and the crontab terminal card with live status badges.

## Share copy (draft)
Crontabs fail silently. OrbitPing doesn't. Inverted dead-man's switch monitoring with zero false alarms and sub-200ms ping ingestion: https://orbit.ayushisalive.me

## Audio direction
- Role: Rhythmic electronic bed with cyber-tech momentum and clean UI accents.
- Music: `happy-beats-business-moves-vol-10-by-ende-dot-app.mp3` (109.96 BPM).
- Music treatment: Starts at 0.00s with subtle low-pass intro, opens full drive at beat drop ~3.55s, fades gracefully at 19.0s into the outro logo chime.
- Music cue guidance:
  - Estimated tempo: 109.96 BPM
  - Major cues: 3.55s (reveal swell), 8.22s (first check card), 12.56s (down alert spike), 16.93s / 18.01s (outro hero lock).
  - Beat-grid windows: Sequential check cards land at 8.22s, 9.83s, 11.47s.
- Audio-reactive treatment: Subtle ambient reactive glow on the radar pulse and status rings corresponding to bass hits.
- SFX posture: Crisp, motion-matched terminal clicks, card slides, and alert chime.
- Audio-coupled moments:
  - 0.8s: Terminal keystrokes as the crontab command types out.
  - 3.5s: Whoosh / impact as the OrbitPing radar expands.
  - 8.2s, 9.8s: Soft card click as checks pop into view.
  - 12.0s: Alert ping / glitch when stripe-recon-cron misses its deadline.
  - 17.0s: Bell / shimmer as the OrbitPing logo locks into place.
- Restraint rule: No distracting sirens or harsh loud buzzers; keep all SFX mixed cleanly into the music.

## Storyboard

### Scene 1 — The Silent Failure (Hook) — 3.5s (0.00s - 3.50s)
Obsidian dark terminal in an empty datacenter atmosphere. Terminal window appears with macOS/Linux window dots.
A line types out:
`0 2 * * * /backup.sh`
A blinking amber cursor stalls.
Bold typography punches in:
**"Your scheduled job failed silently at 2:00 AM."**
Subtext: *"No errors caught. No alert triggered. Nobody noticed."*
Sequential/interaction: Terminal command types in 0.5s - 1.8s; red alert pill fades in at 2.4s.
Audio intent: Ominous, sparse tension building up to the solution.
Audio-coupled idea: Subtle keyboard clicks during typing; gentle low impact on the warning text.
Music: Filtered low intro swell.
Transition mood: Fast kinetic sweep → Scene 2

### Scene 2 — The Inverted Switch (Reveal) — 4.0s (3.50s - 7.50s)
The beat drops at 3.55s! Glowing neon concentric radar rings expand outward from the OrbitPing core emblem.
A glowing cyan pill: `High-Reliability Dead-Man's Switch`
Headline: **"Never let a silent background job slip by."**
Command card transforms to:
`0 2 * * * orbitping run 1a2b3c4d -- /backup.sh`
Subtext: *"Jobs report completion to an unguessable secret ping URL. Late, missed, or failed? OrbitPing alerts instantly."*
Sequential/interaction: Radar sweeps, command swaps with an emerald glow underline.
Audio intent: High-energy tech lift, crisp momentum.
Audio-coupled idea: Bass drop at 3.55s, radar ping sweep sound.
Transition mood: Clean wipe into dashboard → Scene 3

### Scene 3 — Monitored Checks Dashboard (The Product in Action) — 5.5s (7.50s - 13.00s)
Full-width obsidian UI card showing the real OrbitPing dashboard view.
Header: `Monitored Checks • 3 Active`
Three check items slide in sequentially onto the beat grid:
- Card 1 (8.22s): `db-nightly-backup` • `Every 24h` • `42ms ping` → [ UP (Emerald Pulse) ]
- Card 2 (9.83s): `invoice-sync-worker` • `Every 1h` • `118ms ping` → [ UP (Emerald Pulse) ]
- Card 3 (11.47s): `stripe-recon-cron` • `Every 15m` • `Deadline + Grace Expired` → [ DOWN (Ruby Alert) ]
Stat tags below cards:
`Sub-200ms Ingestion Latency` | `Atomic Postgres CTEs` | `Zero False-Alarm Outage Compensation`
Sequential/interaction: Cards appear one-by-one with staggered slide-in; status badges illuminate with glowing borders.
Audio intent: Product capability showcase, sharp precision.
Audio-coupled idea: Card slide clicks at 8.22s, 9.83s; subtle error warning chime at 11.47s.
Transition mood: Slide wipe → Scene 4

### Scene 4 — Instant Multi-Channel Dispatch — 3.5s (13.00s - 16.50s)
Incident alert modal springs into view:
`INCIDENT #1042 OPENED: stripe-recon-cron missed expected heartbeat deadline.`
Radial laser lines branch to 4 notification channel badges with live delivery indicators:
- ✉️ **Resend Transactional Email** `[ Delivered ]`
- 💬 **Slack & Discord Webhook** `[ Delivered ]`
- 📱 **Telegram Bot Notification** `[ Delivered ]`
- ⚡ **HMAC-SHA256 Signed Webhook** `[ Delivered ]`
Sequential/interaction: Channel badges light up around the incident card in rapid sequence.
Audio intent: Instant, bulletproof reliability and multi-channel coverage.
Audio-coupled idea: Rapid chime sequence matching the channel badges.
Transition mood: Dramatic zoom-fade into logo outro → Scene 5

### Scene 5 — Outro & Call to Action — 3.5s (16.50s - 20.00s)
Deep obsidian space with subtle particle glow. The central OrbitPing logo icon (geometric concentric orbital rings with radiant core) pulses in.
Headline: **OrbitPing**
Tagline: *"High-Reliability Dead-Man's Switch Monitoring"*
Feature bullets: `10 Free Checks` • `Sub-200ms Ingestion` • `Zero False Alarms`
CTA Button: `Start Monitoring for Free — orbitping.io`
CLI install tip: `curl -fsS https://orbitping.io/install.sh | sh`
Sequential/interaction: Logo locks into place at 17.0s, CTA button glimmers with purple-indigo gradient shimmer at 18.0s.
Audio intent: Satisfying, confident close.
Audio-coupled idea: Clear logo chime at 17.0s, music fades out to silence by 20.0s.

**Music mood for this video:** Sleek electronic / upbeat synth tech groove.
**Audio summary:** Starts tense and mysterious, drops into an energetic and clean tech groove as the solution appears, drives through the live dashboard and multi-channel dispatch, and lands on a pristine resonant logo finish.
