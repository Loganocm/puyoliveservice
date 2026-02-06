import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', '**/*.test.ts', 'src/db/seed.ts']
    },
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 10000,
    // Load environment variables for tests
    env: {
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_NAME: 'puyio',
      DB_USER: 'puyio',
      DB_PASSWORD: 'puyio_secret',
      JWT_SECRET: 'test-secret-key',
      NODE_ENV: 'test'
    }
  }
});
