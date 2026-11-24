import { MessagingAction, type MessagingRequestPayload, type DefaultsStorage } from '@src/types';

/** Shared Symbol so re-injection into the same frame never attaches duplicate listeners. */
const LISTENER_ATTACHED = Symbol.for('vpr.listenerAttached');
/** Shared Symbol exposing the init promise in the isolated world (also guards against double auto-init). */
const READY_PROMISE = Symbol.for('vpr.ready');

type TrackedVideo = HTMLVideoElement & { [LISTENER_ATTACHED]?: true };
type IsolatedGlobal = typeof globalThis & { [READY_PROMISE]?: Promise<void> };

/** References to active observer and contextmenu listener for cleanup */
let videoObserver: MutationObserver | null = null;
let contextMenuListener: ((event: MouseEvent) => void) | null = null;

/** Send a message to the service worker, logging errors in development mode only. */
function sendMessageSafe(message: MessagingRequestPayload): void {
	chrome.runtime.sendMessage(message).catch((error) => {
		if (import.meta.env.DEV) {
			console.warn('Message send failed:', error);
		}
	});
}

/** Load default playback rate from storage, or null if defaults are disabled or context was invalidated. */
async function getDefaultPlaybackRate(): Promise<number | null> {
	try {
		const { defaults } = (await chrome.storage.sync.get('defaults')) as DefaultsStorage;
		if (!defaults?.enabled) return null;
		return defaults.playbackRate ?? 1;
	} catch {
		// Extension context invalidated after an extension reload/update
		return null;
	}
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
 * Uses a shared Symbol marker to prevent duplicate listeners when a video is re-added to the DOM.
 */
function setupVideoListeners(video: TrackedVideo): void {
	if (video[LISTENER_ATTACHED]) return;
	video[LISTENER_ATTACHED] = true;

	video.addEventListener('ratechange', () => {
		sendMessageSafe({ action: MessagingAction.UPDATE_UI, playbackRate: video.playbackRate });
	});
	video.addEventListener('loadstart', () => {
		void applyDefaultPlaybackRate([video]);
	});
}

/** Attach listeners, apply default speed, or report the first video's current rate if defaults are off. */
async function registerVideos(videos: ArrayLike<HTMLVideoElement>): Promise<void> {
	const list = Array.from(videos);
	if (list.length === 0) return;

	list.forEach((video) => setupVideoListeners(video));
	const appliedDefault = await applyDefaultPlaybackRate(list);
	const [firstVideo] = list;
	if (firstVideo && !appliedDefault) {
		sendMessageSafe({ action: MessagingAction.UPDATE_UI, playbackRate: firstVideo.playbackRate });
	}
}

/** Collect any video elements inside a newly added DOM node. */
function collectVideos(node: Node, target: HTMLVideoElement[]): void {
	if (node instanceof HTMLVideoElement) {
		target.push(node);
	} else if (node instanceof Element) {
		target.push(...node.querySelectorAll('video'));
	}
}

/** Handle a batch of MutationObserver records, skipping work when no videos were added. */
function handleMutations(mutations: MutationRecord[]): void {
	const addedVideos: HTMLVideoElement[] = [];
	for (const mutation of mutations) {
		mutation.addedNodes.forEach((node) => collectVideos(node, addedVideos));
	}
	if (addedVideos.length > 0) {
		void registerVideos(addedVideos);
	}
}

/** Initialize content script functionality. */
export async function initContentScript(): Promise<void> {
	// Defensive cleanup in case initContentScript is called multiple times
	videoObserver?.disconnect();
	if (contextMenuListener) {
		document.removeEventListener('contextmenu', contextMenuListener);
	}

	await registerVideos(document.querySelectorAll('video'));

	videoObserver = new MutationObserver(handleMutations);
	videoObserver.observe(document.documentElement, { childList: true, subtree: true });

	// Keep the context menu radio in sync with the video that was right-clicked
	contextMenuListener = (event) => {
		const video = event.target instanceof Element ? event.target.closest('video') : null;
		if (video) {
			sendMessageSafe({ action: MessagingAction.UPDATE_CONTEXT_MENU, playbackRate: video.playbackRate });
		}
	};
	document.addEventListener('contextmenu', contextMenuListener);
}

if (import.meta.env.MODE !== 'test') {
	const isolatedGlobal = globalThis as IsolatedGlobal;
	// oxlint-disable-next-line unicorn/prefer-top-level-await -- bundled as a classic IIFE content script
	isolatedGlobal[READY_PROMISE] ??= initContentScript();
}
