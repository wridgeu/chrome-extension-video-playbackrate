import { defineConfig } from 'vitest/config';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { globSync } from 'glob';
import path from 'path';

// Dynamically discover entry points (same pattern as rollup.config.js)
const inputFiles = globSync('src/*.ts').reduce<Record<string, string>>((acc, file) => {
    const name = path.basename(file, '.ts');
    acc[name] = path.resolve(__dirname, file);
    return acc;
}, {});

// Shared path aliases
const aliases = {
    '@src': path.resolve(__dirname, 'src'),
    '@tests': path.resolve(__dirname, 'src/__tests__')
};

export default defineConfig({
    // Required for Chrome extensions - use relative paths
    base: './',

    resolve: {
        alias: aliases
    },

    build: {
        // Output directory for JS files
        outDir: 'dist/js',

        // Use terser for consistent minification (matching Rollup setup)
        minify: 'terser',

        // Don't empty outDir since static files are copied separately
        emptyOutDir: false,

        // Target modern Chrome
        target: 'esnext',

        rollupOptions: {
            input: inputFiles,
            output: {
                format: 'esm',
                entryFileNames: '[name].js',
                chunkFileNames: '[name]-[hash].js'
            }
        }
    },

    plugins: [
        viteStaticCopy({
            targets: [
                // Copy HTML files
                { src: 'public/popup.html', dest: '..' },
                { src: 'public/options.html', dest: '..' },
                // Copy styles
                { src: 'public/styles/*', dest: '../styles' },
                // Copy icons
                { src: 'public/img/*', dest: '../img' },
                // Copy and transform manifest.json
                {
                    src: 'public/manifest.json',
                    dest: '..',
                    transform: (content) => {
                        const manifest = JSON.parse(content);
                        manifest.version = process.env.npm_package_version;
                        delete manifest.$schema;
                        return JSON.stringify(manifest, null, 2);
                    }
                }
            ]
        })
    ],

    // Vitest configuration
    test: {
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules', 'dist', '**/*.test.ts', '**/setup.ts']
        },
        projects: [
            {
                resolve: { alias: aliases },
                test: {
                    name: 'unit',
                    globals: true,
                    environment: 'jsdom',
                    setupFiles: ['./src/__tests__/unit/setup.ts'],
                    include: ['src/__tests__/unit/**/*.test.ts'],
                    exclude: ['node_modules', 'dist']
                }
            },
            {
                resolve: { alias: aliases },
                test: {
                    name: 'e2e',
                    globals: true,
                    include: ['src/__tests__/e2e/**/*.test.ts'],
                    exclude: ['node_modules', 'dist'],
                    testTimeout: 60000,
                    hookTimeout: 60000
                }
            }
        ]
    }
});
