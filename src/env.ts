import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  PING_HOST: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1).optional(),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  ENC_KEY_V1: z.string().min(32, 'ENC_KEY_V1 must be a valid 32-byte base64 encryption key'),
  ENC_KEY_CURRENT: z.string().default('v1'),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('OrbitPing <alerts@mail.orbitping.example>'),
  EMAIL_GLOBAL_DAILY_CAP: z.coerce.number().default(90),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET: z.string().optional(),

  BILLING_PROVIDER: z.enum(['paddle', 'lemonsqueezy', 'polar']).default('polar'),
  BILLING_API_KEY: z.string().optional(),
  BILLING_WEBHOOK_SECRET: z.string().optional(),
  PRICE_ID_PRO_MONTHLY: z.string().optional(),
  PRICE_ID_PRO_YEARLY: z.string().optional(),
  PRICE_ID_PLUS_MONTHLY: z.string().optional(),
  PRICE_ID_PLUS_YEARLY: z.string().optional(),

  ADMIN_EMAILS: z
    .string()
    .optional()
    .transform((val) =>
      val
        ? val
            .split(',')
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean)
        : [],
    ),

  WATCHER_URL: z.string().url().optional(),
  SYNTHETIC_CHECK_UUID: z.string().uuid().optional(),
  SENTRY_DSN: z.string().optional(),

  BACKUP_BUCKET: z.string().optional(),
  BACKUP_KEY_ID: z.string().optional(),
  BACKUP_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Environment validation failed:');
    for (const issue of error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
  } else {
    console.error('Failed to parse environment variables:', error);
  }
  process.exit(1);
}

export const env = parsedEnv;
