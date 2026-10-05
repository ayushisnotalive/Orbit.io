# Hyperframes Composition Brief: OrbitPing

## Objective
Create a short, polished, high-energy launch and motion-designed video for OrbitPing.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080 (30 fps)
- Duration: 20.0 seconds

## Source Material
- Project root: `/home/ayushz/storage/CST studies/all projects/Orbit.io`
- Primary files read: `README.md`, `src/ui/views/public/Landing.tsx`, `public/css/app.css`, `src/ui/views/Dashboard.tsx`, `cli/orbitping.sh`, `src/ui/layout.tsx`
- Product name: OrbitPing
- Tagline / strongest claim: "Never let a silent background cron failure slip by." / "Inverted dead-man's switch monitoring with zero false alarms."
- Key UI or visual moment to recreate:
  - Terminal card showing crontab execution & `orbitping run <uuid> -- /backup.sh`
  - Dashboard check summary cards showing status (`UP` with 42ms ping vs `DOWN` with missed deadline)
  - Concentric radar orbit wave animation (OrbitPing brand mark)
  - Multi-channel notification delivery badges (Telegram, Slack, Discord, Email, Webhooks)
- Copy that must appear verbatim:
  - "Never let a silent background cron failure slip by."
  - "Your scheduled jobs report completion to an unguessable secret ping URL."
  - "0 2 * * * orbitping run 1a2b3c4d -- /backup.sh"
  - "Sub-200ms Ping Ingestion"
  - "Zero False-Alarm Guarantee"
  - "Start Monitoring for Free — orbitping.io"

## Creative Direction
- Tone preset: `polished`
- Creative direction: "Sleek infra dead-man's switch motion promo — cyber-obsidian styling, high-velocity terminal execution, and instantaneous multi-channel dispatch."
- Interpretation: Restrained, authoritative engineering confidence. High-contrast dark obsidian background, sharp typography, radiant emerald and ruby status pulses, with clean cuts that let key technical claims land.
- Angle: Cron jobs and background workers fail silently in production without anyone knowing. OrbitPing flips monitoring on its head: jobs ping an unguessable HTTPS URL when done. If a ping is late or missed, incidents open instantly with zero false alarms.
- Hook: A terminal at 2:00 AM where a job silently stops reporting. "Your scheduled job failed silently at 2:00 AM. Nobody noticed."
- Outro / punchline: OrbitPing logo resolves with "Start Monitoring for Free • orbitping.io".
- Avoid:
  - Generic SaaS buzzwords
  - Abstract ungrounded filler graphics
  - Unreadable text or transitions faster than reading speed

## Visual Identity
- Background: `#080c14` (Obsidian theme `--bg-app`), surface cards `#0f172a`, elevated `#1e293b`
- Border: `rgba(255, 255, 255, 0.12)`
- Accent Colors: `#6366f1` (Indigo primary), `#a855f7` (Purple secondary), `#38bdf8` (Cyan status)
- Status Colors: `#10b981` (Emerald UP), `#ef4444` (Ruby DOWN)
- Text Primary: `#f8fafc`
- Text Secondary: `#94a3b8`
- Display font: 'Inter', -apple-system, sans-serif
- Monospace font: 'JetBrains Mono', monospace
- Visual references from the project: Concentric radio wave radar arcs SVG, crontab terminal card, status badges, metric pill cards.

## Storyboard
See `brag-output/brag-plan.md` for full beat-by-beat storyboard.

Scene summary:
1. Scene 1: The Silent Failure (Hook) — 0.00s - 3.50s (3.5s) — Crontab terminal with blinking cursor and silent failure hook text.
2. Scene 2: The Inverted Switch (Reveal) — 3.50s - 7.50s (4.0s) — Concentric radar pulse, OrbitPing reveal, `orbitping run` CLI one-liner.
3. Scene 3: Monitored Checks Dashboard — 7.50s - 13.00s (5.5s) — Live dashboard card with sequential check items (`UP` vs `DOWN`) and metric badges.
4. Scene 4: Instant Multi-Channel Dispatch — 13.00s - 16.50s (3.5s) — Incident opened modal with branching alerts (Telegram, Slack, Email, Webhooks).
5. Scene 5: Outro & Call to Action — 16.50s - 20.00s (3.5s) — Central glowing OrbitPing brand mark, core claims, and CTA.

## Audio
- Audio role: Warm electronic synth groove with cybernetic precision and clean motion-matched UI accents.
- Audio arc: Filtered tension intro (0-3.5s) -> energetic beat drop (3.55s) -> driving dashboard rhythm (7.5-16.5s) -> resonant logo chime and graceful fade (16.5-20.0s).
- Music: `assets/music/happy-beats-business-moves-vol-10-by-ende-dot-app.mp3`
- Music treatment: Intro volume 0.7, full volume 1.0 from 3.55s, smooth fade out starting at 18.5s to 20.0s.
- Music cue guidance:
  - Tempo: 109.96 BPM
  - Strong cues: 3.55s (reveal drop), 8.22s (first card pop), 11.47s (down card alert), 16.93s / 18.01s (outro hero lock).
  - Beat-grid windows: Sequential check cards land at 8.22s, 9.83s, 11.47s.
- Audio-reactive treatment: Subtle ambient reactive glow on the radar pulse and status badges corresponding to the beat.
- Audio-coupled moments:
  - Keystrokes during crontab command typing in Scene 1
  - Whoosh/impact on reveal in Scene 2
  - Card pop clicks in Scene 3
  - Alert notification chime in Scene 4
  - Resonant bell on logo arrival in Scene 5

## Hyperframes Instructions
- Create the video composition in `brag-output/composition/` using standard Hyperframes structure (`index.html`, `styles.css`, assets).
- Use local assets for audio in `brag-output/composition/assets/`.
- Ensure all WCAG contrast requirements are met (bright white `#f8fafc` text on `#080c14` / `#0f172a` surfaces).
- Run `hyperframes check` to ensure zero errors.
- Render to `brag-output/brag.mp4`.
