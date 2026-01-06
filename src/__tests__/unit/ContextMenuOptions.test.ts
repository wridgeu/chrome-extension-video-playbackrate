import { describe, it, expect } from 'vitest';
import contextMenuOptions from '@src/ContextMenuOptions';

describe('ContextMenuOptions', () => {
	it('should export an array of options', () => {
		expect(Array.isArray(contextMenuOptions)).toBe(true);
	});

	it('should have 12 playback rate options', () => {
		expect(contextMenuOptions).toHaveLength(12);
	});

	it('should have unique ids for all options', () => {
		const ids = contextMenuOptions.map((opt) => opt.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(contextMenuOptions.length);
	});

	it('should have exactly one default option', () => {
		const defaultOptions = contextMenuOptions.filter((opt) => opt.default === true);
		expect(defaultOptions).toHaveLength(1);
	});

	it('should have Normal (1x) as the default option', () => {
		const defaultOption = contextMenuOptions.find((opt) => opt.default === true);
		expect(defaultOption).toBeDefined();
		expect(defaultOption?.playbackRate).toBe(1);
		expect(defaultOption?.title).toBe('Normal');
	});

	it('should have playback rates ranging from 0.25 to 4', () => {
		const playbackRates = contextMenuOptions.map((opt) => opt.playbackRate);
		expect(Math.min(...playbackRates)).toBe(0.25);
		expect(Math.max(...playbackRates)).toBe(4);
	});

	it('should have all required properties for each option', () => {
		contextMenuOptions.forEach((option) => {
			expect(option).toHaveProperty('id');
			expect(option).toHaveProperty('title');
			expect(option).toHaveProperty('playbackRate');
			expect(option).toHaveProperty('default');
			expect(typeof option.id).toBe('string');
			expect(typeof option.title).toBe('string');
			expect(typeof option.playbackRate).toBe('number');
			expect(typeof option.default).toBe('boolean');
		});
	});

	it('should have playback rates in ascending order', () => {
		const playbackRates = contextMenuOptions.map((opt) => opt.playbackRate);
		for (let i = 1; i < playbackRates.length; i++) {
			expect(playbackRates[i]).toBeGreaterThan(playbackRates[i - 1]);
		}
	});
});
