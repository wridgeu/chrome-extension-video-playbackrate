import { MessagingAction, type MessagingRequestPayload, type Defaults } from '@src/types';
import { getPlaybackRateStorageKey } from '@src/util/playback';

/** Symbol to mark video elements that already have listeners attached */
const LISTENER_ATTACHED = Symbol('listenerAttached');

/** Reference to active MutationObserver for cleanup */
let videoObserver: MutationObserver | null = null;

/** Send a message to the service worker, logging errors in development mode only. */
function sendMessageSafe(message: MessagingRequestPayload): void {
	chrome.runtime.sendMessage(message).catch((error) => {
		if (import.meta.env?.DEV) {
			console.warn('Message send failed:', error);
		}
	});
}

/** Load default playback rate from storage, or null if defaults are disabled. */
async function getDefaultPlaybackRate(): Promise<number | null> {
	const { defaults } = (await chrome.storage.sync.get('defaults')) as Defaults;
	if (!defaults?.enabled) return null;
	return defaults.playbackRate ?? 1;
}

/** Apply default playback rate to a single video element and send updates */
function applyDefaultRateToVideo(video: HTMLVideoElement, playbackRate: number) {
	video.playbackRate = playbackRate;
	sendMessageSafe({ action: MessagingAction.UPDATE_UI, playbackRate });
}

/** Apply default playback rate to all video elements on the page. */
export async function applyDefaultPlaybackRate() {
	const playbackRate = await getDefaultPlaybackRate();
	if (playbackRate === null) return;

	const videoElements = document.querySelectorAll('video');
	videoElements.forEach((video) => applyDefaultRateToVideo(video, playbackRate));
}

/** Apply default rate to a dynamically added video if defaults are enabled */
async function applyDefaultRateIfEnabled(video: HTMLVideoElement) {
	const playbackRate = await getDefaultPlaybackRate();
	if (playbackRate !== null) {
		applyDefaultRateToVideo(video, playbackRate);
	}
}

/** Find a video element by its src attribute. Uses CSS.escape() to sanitize the selector. */
function findVideoElementBySrc(srcUrl: string): HTMLVideoElement | null {
	return document.querySelector(`video[src='${CSS.escape(srcUrl)}']`);
}

/** Handle incoming messages from the extension. Returns true if sendResponse will be called. */
function handleMessage(request: MessagingRequestPayload, sendResponse: (response?: unknown) => void): boolean {
	const videoElements = document.querySelectorAll('video');
	const [firstVideoElement] = videoElements;

	switch (request.action) {
		case MessagingAction.SET:
			if (!firstVideoElement) return false;
			// Apply to all video elements on the page
			videoElements.forEach((video) => {
				video.playbackRate = request.playbackRate;
			});
			return false;
		case MessagingAction.SETSPECIFIC: {
			const targetVideo = findVideoElementBySrc(request.videoElementSrcAttributeValue);
			if (targetVideo) {
				targetVideo.playbackRate = request.playbackRate;
			}
			return false;
		}
		case MessagingAction.RETRIEVE:
			sendResponse({
				playbackRate: firstVideoElement?.playbackRate ?? 1,
				videoCount: videoElements.length
			});
			return true;
		default:
			return false;
	}
}

/**
 * Sets up listeners for a video element:
 * - ratechange: Syncs rate to storage/badge/context menu
 * - loadstart: Re-applies default speed when video source changes (SPA navigation fix)
 *
 * Uses a Symbol marker to prevent duplicate listeners on re-injection.
 */
function setupVideoListeners(video: HTMLVideoElement) {
	// Prevent duplicate listeners if script is re-injected
	if ((video as unknown as Record<symbol, boolean>)[LISTENER_ATTACHED]) return;
	(video as unknown as Record<symbol, boolean>)[LISTENER_ATTACHED] = true;

	// Sync rate changes to storage, badge, and context menu
	video.addEventListener('ratechange', async () => {
		const tabId = await getTabId();
		if (tabId !== undefined) {
			chrome.storage.local.set({ [getPlaybackRateStorageKey(tabId)]: video.playbackRate });
		}
		sendMessageSafe({ action: MessagingAction.UPDATE_UI, playbackRate: video.playbackRate });
	});

	// Re-apply default speed when video source changes (fixes SPA navigation like YouTube)
	// When a video loads a new source, playbackRate resets to 1 - we need to re-apply defaults
	video.addEventListener('loadstart', () => {
		applyDefaultRateIfEnabled(video);
	});
}

/** Cache the tab ID to avoid repeated async calls */
let cachedTabId: number | undefined;

/** Gets the current tab ID from the service worker. */
async function getTabId(): Promise<number | undefined> {
	if (cachedTabId !== undefined) return cachedTabId;
	try {
		const response = await chrome.runtime.sendMessage({ action: MessagingAction.GET_TAB_ID });
		cachedTabId = response?.tabId;
		return cachedTabId;
	} catch {
		return undefined;
	}
}

/** Initialize content script functionality. */
export async function initContentScript() {
	// Clean up any existing observer from previous execution context
	if (videoObserver) {
		videoObserver.disconnect();
		videoObserver = null;
	}

	// Register message listener first (needed immediately for popup/context menu)
	// Return true to keep the message channel open when sendResponse is used
	chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
		return handleMessage(request, sendResponse);
	});

	// Set up ratechange listeners for existing videos
	const existingVideos = document.querySelectorAll('video');
	existingVideos.forEach(setupVideoListeners);

	// Apply default playback rate (this also sends badge/context menu updates)
	await applyDefaultPlaybackRate();

	// If defaults weren't enabled or no videos exist, send current state for any existing videos
	if (existingVideos.length > 0) {
		const playbackRate = existingVideos[0].playbackRate;
		sendMessageSafe({ action: MessagingAction.UPDATE_UI, playbackRate });
	}

	// Observe for dynamically added videos
	videoObserver = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node instanceof HTMLVideoElement) {
					setupVideoListeners(node);
					applyDefaultRateIfEnabled(node);
				} else if (node instanceof Element) {
					node.querySelectorAll('video').forEach((video) => {
						setupVideoListeners(video);
						applyDefaultRateIfEnabled(video);
					});
				}
			}
		}
	});

	videoObserver.observe(document.documentElement, { childList: true, subtree: true });

	// Clean up observer on page hide (pagehide is more reliable than unload for bfcache)
	// See: https://developer.chrome.com/docs/web-platform/deprecating-unload
	window.addEventListener('pagehide', () => {
		if (videoObserver) {
			videoObserver.disconnect();
			videoObserver = null;
		}
	});

	// Set up context menu sync
	document.addEventListener('contextmenu', (event) => {
		const video = (event.target as HTMLElement).closest('video');
		if (video) {
			sendMessageSafe({ action: MessagingAction.UPDATE_CONTEXT_MENU, playbackRate: video.playbackRate });
		}
	});
}

// Auto-initialize when loaded in browser context
// @ts-expect-error - import.meta.vitest is added by vitest for in-source testing
// Vite's define config replaces this with undefined in production builds
if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && !import.meta.vitest) {
	initContentScript();
}
