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
 * Shows the exact value chosen without unnecessary trailing zeros.
 */
export function formatBadgeText(rate: number): string {
	return rate.toString();
}
