import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DIST_DIR = join(import.meta.dirname, '../../../dist');
const JS_DIR = join(DIST_DIR, 'js');

/**
 * Convert glob pattern to regex.
 * Supports * (matches any characters except /) and ? (matches single character).
 */
function globToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '[^/]*')
		.replace(/\?/g, '[^/]');
	return new RegExp(`^${escaped}$`);
}

/**
 * Check if a filename matches any of the given glob patterns.
 */
function matchesAnyPattern(filename: string, patterns: string[]): boolean {
	return patterns.some((pattern) => globToRegex(pattern).test(filename));
}

/**
 * Extract imported chunk filenames from a built JS file.
 * Looks for patterns like: import{...}from"./chunk-name.js"
 */
function extractImportedChunks(jsContent: string): string[] {
	const importPattern = /from\s*["']\.\/([^"']+\.js)["']/g;
	const chunks: string[] = [];
	let match;
	while ((match = importPattern.exec(jsContent)) !== null) {
		chunks.push(match[1]);
	}
	return chunks;
}

describe('Extension Manifest', () => {
	describe('web_accessible_resources', () => {
		it('should cover all JS chunks imported by contentscript.js', () => {
			// Skip if dist doesn't exist (build not run)
			if (!existsSync(DIST_DIR)) {
				console.warn('Skipping manifest test: dist/ directory not found. Run build first.');
				return;
			}

			const manifestPath = join(DIST_DIR, 'manifest.json');
			const contentScriptPath = join(JS_DIR, 'contentscript.js');

			if (!existsSync(manifestPath) || !existsSync(contentScriptPath)) {
				console.warn('Skipping manifest test: required files not found. Run build first.');
				return;
			}

			// Read and parse manifest
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
			const webAccessible = manifest.web_accessible_resources;

			expect(webAccessible).toBeDefined();
			expect(Array.isArray(webAccessible)).toBe(true);

			// Extract patterns (remove js/ prefix for matching)
			const patterns: string[] = [];
			for (const entry of webAccessible) {
				if (entry.resources && Array.isArray(entry.resources)) {
					patterns.push(...entry.resources.map((p: string) => (p.startsWith('js/') ? p.slice(3) : p)));
				}
			}

			// Read contentscript.js and extract its chunk imports
			const contentScriptContent = readFileSync(contentScriptPath, 'utf-8');
			const importedChunks = extractImportedChunks(contentScriptContent);

			// Check each imported chunk is covered by patterns
			const uncoveredChunks = importedChunks.filter((chunk) => !matchesAnyPattern(chunk, patterns));

			if (uncoveredChunks.length > 0) {
				const uncoveredList = uncoveredChunks.map((c) => `  - js/${c}`).join('\n');
				const patternsText = patterns.map((p) => `  - js/${p}`).join('\n');

				throw new Error(
					`Content script imports chunks not covered by web_accessible_resources:\n` +
						`${uncoveredList}\n\n` +
						`Current patterns in manifest.json:\n` +
						`${patternsText}\n\n` +
						`Add patterns to public/manifest.json web_accessible_resources to fix this.\n` +
						`Example: "js/modulename-*.js" for Vite-generated chunks.`
				);
			}

			expect(uncoveredChunks).toEqual([]);
		});

		it('should have contentscript.js explicitly listed', () => {
			if (!existsSync(DIST_DIR)) {
				return;
			}

			const manifestPath = join(DIST_DIR, 'manifest.json');
			if (!existsSync(manifestPath)) {
				return;
			}

			const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
			const allResources: string[] = [];

			for (const entry of manifest.web_accessible_resources || []) {
				if (entry.resources) {
					allResources.push(...entry.resources);
				}
			}

			expect(allResources).toContain('js/contentscript.js');
		});

		it('should list all files in dist/js that contentscript depends on', () => {
			if (!existsSync(JS_DIR)) {
				return;
			}

			const contentScriptPath = join(JS_DIR, 'contentscript.js');
			if (!existsSync(contentScriptPath)) {
				return;
			}

			// Get all JS files in dist/js
			const allJsFiles = readdirSync(JS_DIR).filter((f) => f.endsWith('.js'));

			// Get chunks imported by contentscript
			const contentScriptContent = readFileSync(contentScriptPath, 'utf-8');
			const importedChunks = extractImportedChunks(contentScriptContent);

			// Verify imported chunks exist in dist/js
			for (const chunk of importedChunks) {
				expect(allJsFiles).toContain(chunk);
			}
		});
	});
});
