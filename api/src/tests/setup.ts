import { beforeAll, afterAll, afterEach } from 'vitest';
import { prisma } from '../db/prisma.js';

// Test database setup
beforeAll(async () => {
  try {
    // Tests assume DB is migrated by external process (e.g. earlier npm script or docker init)
    // We can just check connection
    await prisma.$connect();
  } catch (error) {
    console.log('Note: Database not available, some tests may be skipped', error);
  }
});

// Clean up after each test
afterEach(async () => {
  // Tests should handle their own cleanup
});

// Close prisma connection after all tests
afterAll(async () => {
  await prisma.$disconnect();
});
