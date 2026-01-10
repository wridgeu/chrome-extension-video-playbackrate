import { MessagingAction, type MessagingRequestPayload, type Defaults } from '@src/types';

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
	return defaults.playbackRate || 1;
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

/** Handle incoming messages from the extension. */
function handleMessage(request: MessagingRequestPayload, sendResponse: (response?: unknown) => void) {
	const videoElements = document.querySelectorAll('video');
	const [firstVideoElement] = videoElements;

	switch (request.action) {
		case MessagingAction.SET:
			if (!firstVideoElement) return;
			// Apply to all video elements on the page
			videoElements.forEach((video) => {
				video.playbackRate = request.playbackRate;
			});
			break;
		case MessagingAction.SETSPECIFIC: {
			const targetVideo = findVideoElementBySrc(request.videoElementSrcAttributeValue);
			if (targetVideo) {
				targetVideo.playbackRate = request.playbackRate;
			}
			break;
		}
		case MessagingAction.RETRIEVE:
			sendResponse({
				playbackRate: firstVideoElement?.playbackRate ?? 1,
				videoCount: videoElements.length
			});
			break;
		default:
			break;
	}
}

/**
 * Sets up listeners for a video element:
 * - ratechange: Syncs rate to storage/badge/context menu
 * - loadstart: Re-applies default speed when video source changes (SPA navigation fix)
 */
function setupVideoListeners(video: HTMLVideoElement) {
	// Sync rate changes to storage, badge, and context menu
	video.addEventListener('ratechange', async () => {
		const tabId = await getTabId();
		if (tabId !== undefined) {
			chrome.storage.local.set({ [`playbackRate_${tabId}`]: video.playbackRate });
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
	// Register message listener first (needed immediately for popup/context menu)
	chrome.runtime.onMessage.addListener((request, sender, sendResponse) => handleMessage(request, sendResponse));

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
	const videoObserver = new MutationObserver((mutations) => {
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

	videoObserver.observe(document.body, { childList: true, subtree: true });

	// Clean up observer on page unload to prevent memory leaks
	window.addEventListener('unload', () => {
		videoObserver.disconnect();
	});

	// Set up context menu sync
	document.addEventListener('contextmenu', (event) => {
		const target = event.target as HTMLElement;
		const video = target.closest('video') || (target.tagName === 'VIDEO' ? target : null);

		if (video) {
			const playbackRate = (video as HTMLVideoElement).playbackRate;
			sendMessageSafe({ action: MessagingAction.UPDATE_CONTEXT_MENU, playbackRate });
		}
	});
}

// Auto-initialize when loaded in browser context
// @ts-expect-error - import.meta.vitest is added by vitest for in-source testing
// Vite's define config replaces this with undefined in production builds
if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && !import.meta.vitest) {
	initContentScript();
}
