import { randomBytes } from 'crypto';

function generateKeys() {
  const sessionSecret = randomBytes(32).toString('hex');
  const encKeyV1 = randomBytes(32).toString('base64');
  const telegramWebhookSecret = randomBytes(32).toString('hex');

  console.log('\n=== Generated Security Secrets for OrbitPing ===\n');
  console.log(`SESSION_SECRET=${sessionSecret}`);
  console.log(`ENC_KEY_V1=${encKeyV1}`);
  console.log(`ENC_KEY_CURRENT=v1`);
  console.log(`TELEGRAM_WEBHOOK_SECRET=${telegramWebhookSecret}\n`);
  console.log('Copy these into your .env file.\n');
}

generateKeys();
