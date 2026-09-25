import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';
import { Prisma } from '@prisma/client';

async function seed(): Promise<void> {
  // Known passwords and an admin account: development data only.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database');
  }
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

  await seedForums();

  console.log('✅ Seeding complete');
}

/**
 * A few forum threads, so the community hub has something to show in
 * development. "alice" is made an admin to post the announcement. Skipped
 * when the forums already have threads.
 */
async function seedForums(): Promise<void> {
  if (await prisma.forumThread.count() > 0) {
    console.log('  Forums already have threads');
    return;
  }
  const users = Object.fromEntries(
    (await prisma.user.findMany({ where: { username: { in: ['alice', 'bob', 'charlie'] } } })).map(u => [u.username, u]),
  );
  if (!users.alice || !users.bob || !users.charlie) return;
  await prisma.user.update({ where: { id: users.alice.id }, data: { is_admin: true } });
  const categories = Object.fromEntries((await prisma.forumCategory.findMany()).map(c => [c.slug, c.id]));

  const threads: { slug: string; by: string; title: string; posts: [string, string][] }[] = [
    {
      slug: 'announcements', by: 'alice', title: 'Puyo Live 0.3.0: a look of its own',
      posts: [['alice', 'The game has **its own art** now, drawn in code, a new board, and handling that feels the same on every monitor.\n\nFull notes: https://github.com/Loganocm/puyoliveservice/blob/main/CHANGELOG.md'],
              ['bob', 'The new pops look *great*.']],
    },
    {
      slug: 'strategy', by: 'charlie', title: 'GTR or stairs for a first chain?',
      posts: [['charlie', 'I keep dropping my GTR when garbage comes early. Is stairs safer while learning?'],
              ['bob', '> Is stairs safer while learning?\n\nYes: stairs forgive a wrong colour more often. Learn GTR once you can build 5 links without looking.'],
              ['alice', 'Try the `chain-6-all-clear` board in the animation lab to see a stairs chain fire slowly.']],
    },
    {
      slug: 'help', by: 'bob', title: 'Touch controls feel great on my phone',
      posts: [['bob', 'Hard drop in the corner is exactly where my thumb is. Could rotate be a bit bigger on tablets?']],
    },
  ];
  for (const t of threads) {
    const thread = await prisma.forumThread.create({
      data: { category_id: categories[t.slug], author_id: users[t.by].id, title: t.title, post_count: t.posts.length },
    });
    for (const [by, body] of t.posts) {
      await prisma.forumPost.create({ data: { thread_id: thread.id, author_id: users[by].id, body } });
    }
  }
  console.log(`  Seeded ${threads.length} forum threads`);
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
