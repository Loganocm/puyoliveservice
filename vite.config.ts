import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        alias: {
            '@': path.resolve(__dirname, './src'),
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
