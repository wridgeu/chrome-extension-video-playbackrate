import { describe, it, expect } from 'vitest';
import { PLAYBACK_RATES, findClosestRate, formatRate } from '@src/util/playback';

describe('PLAYBACK_RATES', () => {
	it('covers 0.25× to 4× in 0.25 steps, ascending', () => {
		expect(PLAYBACK_RATES).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4]);
	});
});

describe('findClosestRate', () => {
	it.each([
		[1.5, 1.5],
		[1.1, 1],
		[1.2, 1.25],
		// 1.125 is equidistant from 1 and 1.25: the first match wins
		[1.125, 1],
		[0.1, 0.25],
		[10, 4]
	])('maps %d to %d', (rate, expected) => {
		expect(findClosestRate(rate)).toBe(expected);
	});
});

describe('formatRate', () => {
	it('marks 1× as normal and shows other rates with a × sign', () => {
		expect([formatRate(1), formatRate(0.25), formatRate(2.5)]).toEqual(['1× (Normal)', '0.25×', '2.5×']);
	});
});
