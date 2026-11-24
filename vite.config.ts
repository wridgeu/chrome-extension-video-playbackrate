import { defineConfig } from 'vitest/config';
import { build, type Plugin } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import pkg from './package.json' with { type: 'json' };

// Extension ES module entry points (contentscript is bundled as a classic IIFE via buildContentScript)
const inputFiles = Object.fromEntries(
	['sw', 'popup', 'options'].map((name) => [name, path.resolve(import.meta.dirname, `src/${name}.ts`)])
);

const aliases = {
	'@src': path.resolve(import.meta.dirname, 'src'),
	'@tests': path.resolve(import.meta.dirname, 'src/__tests__')
};

/**
 * MV3 declarative content_scripts run as classic scripts (not ES modules).
 * Build src/contentscript.ts as a self-contained IIFE and register it in Vite's watch graph
 * so both `npm run build` and `npm run build:watch` rebuild it automatically.
 */
function buildContentScript(): Plugin {
	const entry = path.resolve(import.meta.dirname, 'src/contentscript.ts');
	return {
		name: 'build-content-script',
		apply: 'build',
		buildStart() {
			this.addWatchFile(entry);
		},
		async closeBundle() {
			await build({
				configFile: false,
				base: './',
				publicDir: false,
				resolve: { alias: aliases },
				build: {
					outDir: 'dist/js',
					emptyOutDir: false,
					target: 'esnext',
					rolldownOptions: {
						input: entry,
						output: {
							format: 'iife',
							entryFileNames: 'contentscript.js'
						}
					}
				}
			});
		}
	};
}

export default defineConfig({
	// Required for Chrome extensions - use relative paths
	base: './',

	resolve: {
		alias: aliases
	},

	// Disable Vite's default public dir copying (viteStaticCopy handles this)
	publicDir: false,

	build: {
		outDir: 'dist/js',

		// Don't empty outDir since static files are copied separately
		emptyOutDir: false,

		target: 'esnext',

		rolldownOptions: {
			input: inputFiles,
			output: {
				format: 'esm',
				entryFileNames: '[name].js',
				chunkFileNames: 'chunks/[name]-[hash].js'
			}
		}
	},

	plugins: [
		viteStaticCopy({
			targets: [
				{ src: 'public/popup.html', dest: '..', rename: { stripBase: true } },
				{ src: 'public/options.html', dest: '..', rename: { stripBase: true } },
				{ src: 'public/styles/*', dest: '../styles', rename: { stripBase: true } },
				{ src: 'public/img/*', dest: '../img', rename: { stripBase: true } },
				// The version comes from package.json, so a release only bumps one file
				{
					src: 'public/manifest.json',
					dest: '..',
					rename: { stripBase: true },
					transform: (content) => {
						const manifest = JSON.parse(content);
						manifest.version = pkg.version;
						delete manifest.$schema;
						return JSON.stringify(manifest, null, 2);
					}
				}
			]
		}),
		buildContentScript()
	],

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
					environment: 'jsdom',
					setupFiles: ['./src/__tests__/unit/setup.ts'],
					include: ['src/__tests__/unit/**/*.test.ts'],
					exclude: ['node_modules', 'dist'],
					clearMocks: true
				}
			},
			{
				resolve: { alias: aliases },
				test: {
					name: 'e2e',
					include: ['src/__tests__/e2e/**/*.test.ts'],
					exclude: ['node_modules', 'dist'],
					testTimeout: 60000,
					hookTimeout: 60000,
					globalSetup: './src/__tests__/e2e/globalSetup.ts'
				}
			}
		]
	}
});
