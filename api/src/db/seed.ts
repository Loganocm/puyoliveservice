import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';
import { Prisma } from '@prisma/client';

async function seed(): Promise<void> {
  console.log('🌱 Seeding database...');

  // Create test users
  const testUsers = [
    { username: 'alice', password: 'password123', elo: 1200 },
    { username: 'bob', password: 'password123', elo: 1150 },
    { username: 'charlie', password: 'password123', elo: 1100 },
    { username: 'diana', password: 'password123', elo: 1050 },
    { username: 'eve', password: 'password123', elo: 1000 }
  ];

  for (const user of testUsers) {
    const hash = await bcrypt.hash(user.password, 12);
    try {
      const exists = await prisma.user.findFirst({
        where: { username: user.username }
      });

      if (!exists) {
        await prisma.user.create({
          data: {
            username: user.username,
            password_hash: hash,
            elo_rating: user.elo,
            email: `${user.username}@example.com` // Email is required in schema
          }
        });
        console.log(`  Created user: ${user.username}`);
      } else {
        console.log(`  User ${user.username} already exists`);
      }
    } catch (error) {
      console.log(`  Error creating user ${user.username}:`, error);
    }
  }

  console.log('✅ Seeding complete');
}

seed()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Seed failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
