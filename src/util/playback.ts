/** Slowest selectable playback rate (0 would pause the video). */
export const MIN_RATE = 0.25;
/** Fastest selectable playback rate. */
export const MAX_RATE = 4;
/** Granularity shared by the popup slider, options page and context menu. */
export const RATE_STEP = 0.25;

/** Every selectable rate, ascending: 0.25, 0.5, ... 4. The single source for all speed pickers. */
export const PLAYBACK_RATES: readonly number[] = Array.from(
	{ length: (MAX_RATE - MIN_RATE) / RATE_STEP + 1 },
	(_, index) => MIN_RATE + index * RATE_STEP
);

/** Human-readable rate, e.g. "1.5×" or "1× (Normal)". */
export function formatRate(rate: number): string {
	return rate === 1 ? '1× (Normal)' : `${rate}×`;
}

/** Compact badge label (up to 4 chars, e.g. "1.75" or "1.33" for non-step rates). */
export function formatBadgeRate(rate: number): string {
	return String(Number(rate.toFixed(2)));
}

/** Clamp a playback rate to the slider's selectable range [MIN_RATE, MAX_RATE]. */
export function clampRate(rate: number): number {
	return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

/** The selectable rate closest to `playbackRate` (first match wins on a tie). */
export function findClosestRate(playbackRate: number): number {
	return PLAYBACK_RATES.reduce((closest, current) =>
		Math.abs(current - playbackRate) < Math.abs(closest - playbackRate) ? current : closest
	);
}

/** Storage key for the per-tab playback rate, shared by the service worker and popup. */
export function getPlaybackRateStorageKey(tabId: number): string {
	return `playbackRate_${tabId}`;
}
