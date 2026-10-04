import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../../src/app.js';
import { AppError } from '../../src/lib/errors.js';
import { prisma } from '../../src/db/client.js';

describe('Hono App HTTP & Error Handling', () => {
  beforeAll(async () => {
    // Ensure DB is connected
    await prisma.$queryRaw`SELECT 1`;

    // Mount test routes before SmartRouter freezes
    app.get('/test/app-error', () => {
      throw new AppError('plan_limit_reached', 'Check limit reached', 402, {
        field: 'checks',
      });
    });

    app.get('/test/unexpected-error', () => {
      throw new Error('Database disk corrupted unexpectedly');
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Health and Readiness Endpoints', () => {
    it('GET /healthz should return 200 with Cache-Control no-store', async () => {
      const res = await app.request('/healthz');
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      const text = await res.text();
      expect(text).toBe('OK 200');
    });

    it('GET /readyz should return 200 with readiness JSON', async () => {
      const res = await app.request('/readyz');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ready');
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('Not Found (404) Handling', () => {
    it('should return plain text 404 for standard requests', async () => {
      const res = await app.request('/unknown-endpoint');
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toBe('Not Found');
    });

    it('should return structured JSON 404 when Accept header includes application/json', async () => {
      const res = await app.request('/unknown-api-endpoint', {
        headers: { Accept: 'application/json' },
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json).toEqual({
        error: {
          code: 'not_found',
          message: 'The requested resource was not found.',
          field: null,
        },
      });
    });
  });

  describe('Global Error Handling (app.onError)', () => {
    it('should translate AppError into structured JSON response with matching status', async () => {
      const res = await app.request('/test/app-error');
      expect(res.status).toBe(402);
      const json = await res.json();
      expect(json).toEqual({
        error: {
          code: 'plan_limit_reached',
          message: 'Check limit reached',
          field: 'checks',
        },
      });
    });

    it('should translate unexpected runtime exceptions into 500 internal error response', async () => {
      const res = await app.request('/test/unexpected-error');
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json).toEqual({
        error: {
          code: 'internal',
          message: 'An unexpected internal error occurred.',
          field: null,
        },
      });
    });
  });
});
