import { defineConfig } from 'vitest/config';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

// Extension entry points; shared code is split into js/chunks/ (exposed to pages via web_accessible_resources)
const inputFiles = Object.fromEntries(
	['sw', 'popup', 'options', 'contentscript', 'contentscript-loader'].map((name) => [
		name,
		path.resolve(import.meta.dirname, `src/${name}.ts`)
	])
);

const aliases = {
	'@src': path.resolve(import.meta.dirname, 'src'),
	'@tests': path.resolve(import.meta.dirname, 'src/__tests__')
};

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
						manifest.version = process.env.npm_package_version;
						delete manifest.$schema;
						return JSON.stringify(manifest, null, 2);
					}
				}
			]
		})
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
