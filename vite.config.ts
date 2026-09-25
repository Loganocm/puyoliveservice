import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
    plugins: [react()],
    // The version players see (footer, bug reports) comes from package.json,
    // which the release process bumps (see CHANGELOG.md).
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        alias: {
            '@': path.resolve(__dirname, './src'),
            // Point the shared engine at its SOURCE, not its build output.
            //
            // The package publishes `dist/` for the game server, which imports
            // it through node and needs real JavaScript. The client has a
            // bundler, so it can read the TypeScript directly -- which means
            // `npm run dev` needs no watch task on the package, and an edit to
            // the engine hot-reloads like any other file under src/.
            //
            // Vitest applies the same alias (see vitest.config.ts), so the test
            // suite exercises the source the client ships, not a stale build.
            '@puyolive/engine': path.resolve(__dirname, './packages/engine/src/index.ts'),
        },
    },
    build: {
        target: 'esnext',
        outDir: 'dist',
        rollupOptions: {
            output: {
                manualChunks(id: string) {
                    if (id.includes('node_modules')) {
                        if (id.includes('react') || id.includes('react-dom')) {
                            return 'react-vendor';
                        }
                        if (id.includes('pixi.js')) {
                            return 'game-vendor';
                        }
                        if (id.includes('motion')) {
                            return 'animation-vendor';
                        }
                        if (id.includes('lucide-react')) {
                            return 'ui-vendor';
                        }
                    }
                },
            },
        },
        chunkSizeWarningLimit: 600,
    },
    server: {
        port: 5173,
        open: true,
    },
});
