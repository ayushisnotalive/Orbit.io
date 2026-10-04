import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { env } from '../../src/env.js';
import {
  getGitHubAuthorizationUrl,
  exchangeGitHubCode,
  fetchGitHubUserAndEmail,
  handleGitHubCallback,
} from '../../src/auth/github.js';

describe('GitHub OAuth 2.0 (src/auth/github.ts)', () => {
  const originalClientId = env.GITHUB_CLIENT_ID;
  const originalClientSecret = env.GITHUB_CLIENT_SECRET;

  beforeEach(() => {
    (env as any).GITHUB_CLIENT_ID = 'test-client-id-123';
    (env as any).GITHUB_CLIENT_SECRET = 'test-client-secret-456';
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    (env as any).GITHUB_CLIENT_ID = originalClientId;
    (env as any).GITHUB_CLIENT_SECRET = originalClientSecret;
    await prisma.$disconnect();
  });

  it('generates an authorization URL with required scopes and state', () => {
    const state = 'secure-random-state-abc';
    const url = getGitHubAuthorizationUrl(state);

    expect(url).toContain('https://github.com/login/oauth/authorize');
    expect(url).toContain('client_id=test-client-id-123');
    expect(url).toContain('scope=user%3Aemail+read%3Auser');
    expect(url).toContain(`state=${state}`);
  });

  it('exchanges OAuth code for access token successfully', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'gho_secret_access_token_xyz' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const token = await exchangeGitHubCode('temp-auth-code');
    expect(token).toBe('gho_secret_access_token_xyz');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('extracts primary verified email from user/emails response', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'https://api.github.com/user') {
        return {
          ok: true,
          json: async () => ({ id: 1234567, login: 'octocat', name: 'Mona Lisa' }),
        };
      }
      if (url === 'https://api.github.com/user/emails') {
        return {
          ok: true,
          json: async () => [
            { email: 'unverified@example.com', primary: false, verified: false },
            { email: 'primary-unverified@example.com', primary: true, verified: false },
            { email: 'mona@github.com', primary: true, verified: true },
          ],
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const profile = await fetchGitHubUserAndEmail('mock-token');
    expect(profile.githubId).toBe('1234567');
    expect(profile.name).toBe('Mona Lisa');
    expect(profile.email).toBe('mona@github.com');
  });

  it('strictly rejects GitHub accounts lacking a verified primary email (AUTH-01)', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'https://api.github.com/user') {
        return {
          ok: true,
          json: async () => ({ id: 999, login: 'unverified-user' }),
        };
      }
      if (url === 'https://api.github.com/user/emails') {
        return {
          ok: true,
          json: async () => [
            { email: 'unverified@example.com', primary: true, verified: false },
          ],
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchGitHubUserAndEmail('mock-token')).rejects.toThrow(
      'verified primary email address',
    );
  });

  it('handleGitHubCallback rejects state mismatch (CSRF defense)', async () => {
    await expect(
      handleGitHubCallback({
        code: 'code-123',
        state: 'tampered-state',
        expectedState: 'expected-state',
      }),
    ).rejects.toThrow('CSRF attempt');
  });

  it('handleGitHubCallback creates new user and session on valid callback', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'https://github.com/login/oauth/access_token') {
        return { ok: true, json: async () => ({ access_token: 'valid-token' }) };
      }
      if (url === 'https://api.github.com/user') {
        return { ok: true, json: async () => ({ id: 554433, login: 'newuser', name: 'New User' }) };
      }
      if (url === 'https://api.github.com/user/emails') {
        return {
          ok: true,
          json: async () => [{ email: 'newuser@github.com', primary: true, verified: true }],
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleGitHubCallback({
      code: 'valid-code',
      state: 'valid-state',
      expectedState: 'valid-state',
    });

    expect(result.user).toBeDefined();
    expect(result.user.githubId).toBe('554433');
    expect(result.user.email).toBe('newuser@github.com');
    expect(result.sessionToken).toBeDefined();
    expect(result.session).toBeDefined();
  });
});
