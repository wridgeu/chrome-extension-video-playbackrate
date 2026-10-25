import { describe, it, expect } from 'vitest';
import contextMenuOptions from '@src/ContextMenuOptions';

// Invariants the service worker relies on (radio menu ids, a single checked default, closest-match lookup)
describe('ContextMenuOptions', () => {
	it('has unique ids', () => {
		const ids = contextMenuOptions.map((opt) => opt.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('has exactly one default option, at 1x', () => {
		const defaults = contextMenuOptions.filter((opt) => opt.default);
		expect(defaults.map((opt) => opt.playbackRate)).toEqual([1]);
	});

	it('lists playback rates in strictly ascending order', () => {
		const rates = contextMenuOptions.map((opt) => opt.playbackRate);
		expect(rates).toEqual(rates.toSorted((a, b) => a - b));
		expect(new Set(rates).size).toBe(rates.length);
	});
});
