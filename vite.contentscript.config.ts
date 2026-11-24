import { defineConfig } from 'vite';
import path from 'path';

// MV3 declarative content_scripts run as classic scripts, so bundle contentscript.ts as a self-contained IIFE
export default defineConfig({
	base: './',
	publicDir: false,
	resolve: {
		alias: {
			'@src': path.resolve(import.meta.dirname, 'src')
		}
	},
	build: {
		outDir: 'dist/js',
		emptyOutDir: false,
		target: 'esnext',
		rolldownOptions: {
			input: path.resolve(import.meta.dirname, 'src/contentscript.ts'),
			output: {
				format: 'iife',
				entryFileNames: 'contentscript.js'
			}
		}
	}
});
