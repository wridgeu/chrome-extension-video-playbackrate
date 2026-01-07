import { Defaults, MessagingAction, MessagingRequestPayload } from './types';

/** Apply default playback rate to all video elements on the page. */
export async function applyDefaultPlaybackRate() {
	const { defaults } = <Defaults>await chrome.storage.sync.get('defaults');
	if (!defaults?.enabled) return;

	const playbackRate = defaults.playbackRate || 1;

	const videoElements = document.querySelectorAll('video');
	if (videoElements.length === 0) return;

	// Apply to all video elements on the page
	videoElements.forEach((videoElement) => {
		videoElement.playbackRate = playbackRate;

		const mutObserver = new MutationObserver((mutationList: MutationRecord[]) => {
			for (const mutation of mutationList) {
				if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
					videoElement.playbackRate = playbackRate;
				}
			}
		});

		// Add ratechange listener once, outside the MutationObserver callback
		videoElement.addEventListener('ratechange', () => mutObserver.disconnect(), { once: true });

		mutObserver.observe(videoElement, {
			attributes: true,
			attributeFilter: ['src']
		});
	});
}

/** Find a video element by its src attribute. Uses CSS.escape() to sanitize the selector. */
export function findVideoElementBySrc(srcUrl: string): HTMLVideoElement | null {
	return document.querySelector(`video[src='${CSS.escape(srcUrl)}']`);
}

/** Handle incoming messages from the extension. */
export function handleMessage(
	request: MessagingRequestPayload,
	sender: chrome.runtime.MessageSender,
	sendResponse: (response?: unknown) => void
) {
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
 * Sets up a listener for playback rate changes on a video element.
 * Stores the rate in storage (for popup sync) and updates the extension badge.
 */
export function setupRateChangeListener(video: HTMLVideoElement) {
	video.addEventListener('ratechange', async () => {
		const tabId = await getTabId();
		if (tabId !== undefined) {
			chrome.storage.local.set({ [`playbackRate_${tabId}`]: video.playbackRate });
		}
		// Update both badge and context menu when rate changes
		const payload = { playbackRate: video.playbackRate };
		chrome.runtime.sendMessage({ action: MessagingAction.UPDATE_BADGE, ...payload }).catch(() => {});
		chrome.runtime.sendMessage({ action: MessagingAction.UPDATE_CONTEXT_MENU, ...payload }).catch(() => {});
	});
}

/** Cache the tab ID to avoid repeated async calls */
let cachedTabId: number | undefined;

/** Gets the current tab ID from the service worker. */
export async function getTabId(): Promise<number | undefined> {
	if (cachedTabId !== undefined) return cachedTabId;
	try {
		const response = await chrome.runtime.sendMessage({ action: 'getTabId' });
		cachedTabId = response?.tabId;
		return cachedTabId;
	} catch {
		return undefined;
	}
}

/** Reset cached tab ID (useful for testing). */
export function resetCachedTabId() {
	cachedTabId = undefined;
}

/** Initialize content script functionality. */
export function initContentScript() {
	// Apply default playback rate
	applyDefaultPlaybackRate();

	// Register message listener
	chrome.runtime.onMessage.addListener(handleMessage);

	// Set up ratechange listeners for existing videos and update badge with initial rate
	const existingVideos = document.querySelectorAll('video');
	existingVideos.forEach(setupRateChangeListener);

	// Send initial badge update if there are videos on the page
	if (existingVideos.length > 0) {
		chrome.runtime
			.sendMessage({
				action: MessagingAction.UPDATE_BADGE,
				playbackRate: existingVideos[0].playbackRate
			})
			.catch(() => {});
	}

	// Observe for dynamically added videos
	const videoObserver = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node instanceof HTMLVideoElement) {
					setupRateChangeListener(node);
				} else if (node instanceof Element) {
					node.querySelectorAll('video').forEach(setupRateChangeListener);
				}
			}
		}
	});

	videoObserver.observe(document.body, { childList: true, subtree: true });

	// Set up context menu sync
	document.addEventListener('contextmenu', (event) => {
		const target = event.target as HTMLElement;
		const video = target.closest('video') || (target.tagName === 'VIDEO' ? target : null);

		if (video) {
			const playbackRate = (video as HTMLVideoElement).playbackRate;
			chrome.runtime
				.sendMessage({
					action: MessagingAction.UPDATE_CONTEXT_MENU,
					playbackRate
				})
				.catch(() => {});
		}
	});
}

// Auto-initialize when loaded (not in test environment)
if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && typeof process === 'undefined') {
	initContentScript();
}
