import { MessagingAction, type MessagingRequestPayload, type DefaultsStorage } from '@src/types';

/** Symbol to mark video elements that already have listeners attached */
const LISTENER_ATTACHED = Symbol('listenerAttached');

type TrackedVideo = HTMLVideoElement & { [LISTENER_ATTACHED]?: true };

/** Reference to active MutationObserver for cleanup */
let videoObserver: MutationObserver | null = null;

/** Send a message to the service worker, logging errors in development mode only. */
function sendMessageSafe(message: MessagingRequestPayload): void {
	chrome.runtime.sendMessage(message).catch((error) => {
		if (import.meta.env.DEV) {
			console.warn('Message send failed:', error);
		}
	});
}

/** Load default playback rate from storage, or null if defaults are disabled. */
async function getDefaultPlaybackRate(): Promise<number | null> {
	const { defaults } = (await chrome.storage.sync.get('defaults')) as DefaultsStorage;
	if (!defaults?.enabled) return null;
	return defaults.playbackRate ?? 1;
}

/** Apply the default playback rate (if enabled) to the given videos and report it; resolves whether it was applied. */
export async function applyDefaultPlaybackRate(
	videos: ArrayLike<HTMLVideoElement> = document.querySelectorAll('video')
): Promise<boolean> {
	if (videos.length === 0) return false;
	const playbackRate = await getDefaultPlaybackRate();
	if (playbackRate === null) return false;

	for (const video of Array.from(videos)) {
		video.playbackRate = playbackRate;
	}
	sendMessageSafe({ action: MessagingAction.UPDATE_UI, playbackRate });
	return true;
}

/**
 * Sets up listeners for a video element:
 * - ratechange: Syncs rate to storage/badge/context menu (via the service worker)
 * - loadstart: Re-applies default speed when video source changes (SPA navigation like YouTube resets the rate)
 *
 * Uses a Symbol marker to prevent duplicate listeners when a video is re-added to the DOM.
 */
function setupVideoListeners(video: TrackedVideo): void {
	if (video[LISTENER_ATTACHED]) return;
	video[LISTENER_ATTACHED] = true;

	video.addEventListener('ratechange', () => {
		sendMessageSafe({ action: MessagingAction.UPDATE_UI, playbackRate: video.playbackRate });
	});
	video.addEventListener('loadstart', () => applyDefaultPlaybackRate([video]));
}

/** Track videos inside a node added to the DOM and apply the default rate to them. */
function handleAddedNode(node: Node): void {
	let videos: HTMLVideoElement[] = [];
	if (node instanceof HTMLVideoElement) {
		videos = [node];
	} else if (node instanceof Element) {
		videos = Array.from(node.querySelectorAll('video'));
	}
	videos.forEach((video) => setupVideoListeners(video));
	applyDefaultPlaybackRate(videos);
}

/** Initialize content script functionality. */
export async function initContentScript(): Promise<void> {
	// Defensive cleanup in case initContentScript is called multiple times
	videoObserver?.disconnect();

	const existingVideos = document.querySelectorAll('video');
	existingVideos.forEach((video) => setupVideoListeners(video));
	const appliedDefault = await applyDefaultPlaybackRate(existingVideos);

	// Without a default, report the current rate so the badge and context menu still match the page
	const [firstVideo] = existingVideos;
	if (firstVideo && !appliedDefault) {
		sendMessageSafe({ action: MessagingAction.UPDATE_UI, playbackRate: firstVideo.playbackRate });
	}

	videoObserver = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			mutation.addedNodes.forEach((node) => handleAddedNode(node));
		}
	});
	videoObserver.observe(document.documentElement, { childList: true, subtree: true });

	// Keep the context menu radio in sync with the video that was right-clicked
	document.addEventListener('contextmenu', (event) => {
		const video = event.target instanceof Element ? event.target.closest('video') : null;
		if (video) {
			sendMessageSafe({ action: MessagingAction.UPDATE_CONTEXT_MENU, playbackRate: video.playbackRate });
		}
	});
}

if (import.meta.env.MODE !== 'test') {
	await initContentScript();
}
