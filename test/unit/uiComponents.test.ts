import { describe, it, expect } from 'vitest';
import { Navbar } from '../../src/ui/components/Navbar.js';
import { StatusBadge } from '../../src/ui/components/StatusBadge.js';
import { SnippetGenerator } from '../../src/ui/components/SnippetGenerator.js';
import { IncidentTimeline } from '../../src/ui/components/IncidentTimeline.js';

describe('UI Components Unit Tests', () => {
  describe('Navbar Component', () => {
    it('renders login link when user is null', async () => {
      const html = (await Navbar({ user: null })).toString();
      expect(html).toContain('Sign In');
      expect(html).toContain('/login');
      expect(html).toContain('OrbitPing');
    });

    it('renders user email, plan badge, and logout form when logged in', async () => {
      const html = (
        await Navbar({
          user: { email: 'developer@example.com', plan: 'PRO' },
          activePath: '/dashboard',
        })
      ).toString();

      expect(html).toContain('developer@example.com');
      expect(html).toContain('PRO');
      expect(html).toContain('Sign out');
      expect(html).toContain('/auth/logout');
      expect(html).toContain('/dashboard');
      expect(html).toContain('/app/channels');
    });
  });

  describe('StatusBadge Component', () => {
    it('renders UP status with pulse dot animation class', async () => {
      const html = (await StatusBadge({ status: 'UP' })).toString();
      expect(html).toContain('badge-up');
      expect(html).toContain('Up');
      expect(html).toContain('badge-dot');
    });

    it('renders DOWN status with down class', async () => {
      const html = (await StatusBadge({ status: 'DOWN' })).toString();
      expect(html).toContain('badge-down');
      expect(html).toContain('Down');
    });

    it('renders PAUSED and NEW statuses', async () => {
      const pausedHtml = (await StatusBadge({ status: 'PAUSED' })).toString();
      expect(pausedHtml).toContain('badge-paused');
      expect(pausedHtml).toContain('Paused');

      const newHtml = (await StatusBadge({ status: 'NEW' })).toString();
      expect(newHtml).toContain('badge-new');
      expect(newHtml).toContain('New');
    });
  });

  describe('SnippetGenerator Component', () => {
    const testPingUrl = 'http://localhost:3000/ping/12345678-1234-1234-1234-123456789abc';
    const testUuid = '12345678-1234-1234-1234-123456789abc';

    it('generates copyable integration snippets for all supported environments', async () => {
      const html = (
        await SnippetGenerator({ pingUrl: testPingUrl, uuid: testUuid })
      ).toString();

      // Cron tab
      expect(html).toContain('curl -fsS -m 10 --retry 3');
      expect(html).toContain(testPingUrl);

      // Bash tab with start and fail pings
      expect(html).toContain(`${testPingUrl}/start`);
      expect(html).toContain(`${testPingUrl}/fail`);

      // CLI tab
      expect(html).toContain(`orbitping run ${testUuid}`);

      // Python tab
      expect(html).toContain('urllib.request.urlopen');

      // Node tab
      expect(html).toContain('await fetch');

      // PHP tab
      expect(html).toContain('file_get_contents');

      // GitHub Actions tab
      expect(html).toContain('OrbitPing Heartbeat');
      expect(html).toContain('job.status');
    });
  });

  describe('IncidentTimeline Component', () => {
    it('renders empty states when no pings or incidents exist', async () => {
      const html = (
        await IncidentTimeline({ incidents: [], recentPings: [] })
      ).toString();

      expect(html).toContain('No pings recorded yet');
      expect(html).toContain('No incidents recorded. This check has 100% uptime!');
    });

    it('renders recent pings and incident durations', async () => {
      const now = new Date();
      const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);

      const html = (
        await IncidentTimeline({
          incidents: [
            {
              id: 'inc-1',
              reason: 'MISSED',
              startedAt: thirtyMinsAgo,
              resolvedAt: now,
              resolvedBy: 'Auto-recovered',
            },
          ],
          recentPings: [
            {
              id: '1',
              ts: now,
              kind: 'SUCCESS',
              exitCode: 0,
              durationMs: 345,
              body: null,
            },
            {
              id: '2',
              ts: thirtyMinsAgo,
              kind: 'FAIL',
              exitCode: 1,
              durationMs: 1200,
              body: 'Out of memory error',
            },
          ],
        })
      ).toString();

      expect(html).toContain('SUCCESS');
      expect(html).toContain('FAIL');
      expect(html).toContain('345ms');
      expect(html).toContain('Out of memory error');
      expect(html).toContain('MISSED');
      expect(html).toContain('30m');
    });
  });
});
