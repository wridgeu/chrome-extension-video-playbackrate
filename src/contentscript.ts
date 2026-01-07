// Inline types to make content script self-contained
// chrome.scripting.executeScript doesn't reliably resolve ES module imports
const MessagingAction = {
	SET: 0,
	SETSPECIFIC: 1,
	RETRIEVE: 2,
	UPDATE_CONTEXT_MENU: 3,
	UPDATE_BADGE: 4
} as const;

type MessagingAction = (typeof MessagingAction)[keyof typeof MessagingAction];

type RetrieveActionPayload = {
	action: typeof MessagingAction.RETRIEVE;
};

type SetActionPayload = {
	action: typeof MessagingAction.SET;
	playbackRate: number;
};

type SetSpecificActionPayload = {
	action: typeof MessagingAction.SETSPECIFIC;
	playbackRate: number;
	videoElementSrcAttributeValue: string;
};

type UpdateBadgePayload = {
	action: typeof MessagingAction.UPDATE_BADGE;
	playbackRate: number;
	tabId?: number;
};

type UpdateContextMenuPayload = {
	action: typeof MessagingAction.UPDATE_CONTEXT_MENU;
	playbackRate: number;
};

type Defaults = {
	defaults: {
		enabled?: boolean;
		playbackRate?: number;
	};
};

type MessagingRequestPayload =
	| RetrieveActionPayload
	| SetActionPayload
	| SetSpecificActionPayload
	| UpdateBadgePayload
	| UpdateContextMenuPayload;

/** Load default settings from storage */
async function getDefaultSettings(): Promise<{ enabled: boolean; playbackRate: number } | null> {
	const { defaults } = <Defaults>await chrome.storage.sync.get('defaults');
	if (!defaults?.enabled) return null;

	return {
		enabled: true,
		playbackRate: defaults.playbackRate || 1
	};
}

/** Apply default playback rate to a single video element */
function applyDefaultRateToVideo(video: HTMLVideoElement, playbackRate: number) {
	video.playbackRate = playbackRate;

	// Watch for src changes and reapply rate
	const mutObserver = new MutationObserver((mutationList: MutationRecord[]) => {
		for (const mutation of mutationList) {
			if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
				video.playbackRate = playbackRate;
			}
		}
	});

	// Stop observing once user manually changes rate
	video.addEventListener('ratechange', () => mutObserver.disconnect(), { once: true });

	mutObserver.observe(video, {
		attributes: true,
		attributeFilter: ['src']
	});
}

/** Apply default playback rate to all video elements on the page. */
export async function applyDefaultPlaybackRate() {
	const settings = await getDefaultSettings();
	if (!settings) return;

	const videoElements = document.querySelectorAll('video');
	videoElements.forEach((video) => applyDefaultRateToVideo(video, settings.playbackRate));
}

/** Apply default rate to a dynamically added video if defaults are enabled */
async function applyDefaultRateIfEnabled(video: HTMLVideoElement) {
	const settings = await getDefaultSettings();
	if (settings) {
		applyDefaultRateToVideo(video, settings.playbackRate);
	}
}

/** Find a video element by its src attribute. Uses CSS.escape() to sanitize the selector. */
function findVideoElementBySrc(srcUrl: string): HTMLVideoElement | null {
	return document.querySelector(`video[src='${CSS.escape(srcUrl)}']`);
}

/** Handle incoming messages from the extension. */
function handleMessage(
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
function setupRateChangeListener(video: HTMLVideoElement) {
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
async function getTabId(): Promise<number | undefined> {
	if (cachedTabId !== undefined) return cachedTabId;
	try {
		const response = await chrome.runtime.sendMessage({ action: 'getTabId' });
		cachedTabId = response?.tabId;
		return cachedTabId;
	} catch {
		return undefined;
	}
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
					applyDefaultRateIfEnabled(node);
				} else if (node instanceof Element) {
					node.querySelectorAll('video').forEach((video) => {
						setupRateChangeListener(video);
						applyDefaultRateIfEnabled(video);
					});
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

// Auto-initialize when loaded in browser context
// @ts-expect-error - import.meta.vitest is added by vitest for in-source testing
// Vite's define config replaces this with undefined in production builds
if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && !import.meta.vitest) {
	initContentScript();
}
