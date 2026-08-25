import { defineConfig } from 'vitest/config';
import path from 'path';

// Client-side test suite. The API has its own suite under api/.
//
// Environment is 'node': the engine is pure. It takes its handling settings
// from an injected config and reports audio through a hook, so it reaches no
// browser global and needs no DOM. If a test here ever fails for want of
// localStorage or Audio, something has re-coupled the engine to the browser --
// fix that rather than switching this back to jsdom.
//
// See README §"Testing".

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'node',
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
