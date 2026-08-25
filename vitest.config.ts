import { defineConfig } from 'vitest/config';
import path from 'path';

// Client-side test suite. The API has its own suite under api/.
//
// Environment is jsdom because the engine currently reaches SettingsManager
// (localStorage at module load) and SoundManager (asset imports). Removing
// that coupling is the point of the engine extraction; until then jsdom lets
// the characterization suite run against the unmodified engine.
//
// See README §"Testing".

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    // A simulation bug can turn into an unbounded loop. Fail fast rather than
    // hanging CI: every test must finish well inside this budget.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Characterization goldens must never depend on wall clock or ambient
    // randomness. Every test seeds its own PRNG explicitly.
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/core/**', 'src/game/**'],
      exclude: ['src/core/AudioContext.ts', 'src/core/BGMManager.ts', 'src/core/SoundManager.ts'],
    },
  },
});
