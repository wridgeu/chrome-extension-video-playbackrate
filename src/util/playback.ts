/** Playback option for context menu */
export interface PlaybackOption {
	id: string;
	title: string;
	playbackRate: number;
	default?: boolean;
}

/** Finds the context menu option with the closest playback rate. */
export function findClosestOption(playbackRate: number, options: PlaybackOption[]): PlaybackOption | undefined {
	if (options.length === 0) return undefined;

	return options.reduce((closest, current) => {
		const closestDiff = Math.abs(closest.playbackRate - playbackRate);
		const currentDiff = Math.abs(current.playbackRate - playbackRate);
		return currentDiff < closestDiff ? current : closest;
	});
}

/**
 * Formats the playback rate for display in the badge.
 * Shows integers without decimals (e.g., "2"), decimals with one digit precision (e.g., "1.5").
 */
export function formatBadgeText(rate: number): string {
	return Number.isInteger(rate) ? rate.toString() : rate.toFixed(1);
}
