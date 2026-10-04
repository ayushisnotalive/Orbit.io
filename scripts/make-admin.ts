import { prisma } from '../src/db/client.js';

async function makeAdmin() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run make-admin <user-email>');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email },
  });

  if (!user) {
    console.error(`User with email "${email}" not found.`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isAdmin: true },
  });

  console.log(`Successfully granted admin privileges to "${email}".`);
  await prisma.$disconnect();
}

makeAdmin().catch((err) => {
  console.error('Failed to grant admin privileges:', err);
  process.exit(1);
});
