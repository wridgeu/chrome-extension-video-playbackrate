// export const, to prevent code generation and directly replace enum usage with it's value (0,1,2)
// dynamic import of enum causes some issues
// https://stackoverflow.com/questions/48104433/how-to-import-es6-modules-in-content-script-for-chrome-extension
export const enum MessagingAction {
	SET = 0,
	SETSPECIFIC = 1,
	RETRIEVE = 2,
	UPDATE_CONTEXT_MENU = 3
}

type SetSpecificActionPayload = {
	action: MessagingAction.SETSPECIFIC;
	playbackRate: number;
	videoElementSrcAttributeValue: string;
};

type SetActionPayload = {
	action: MessagingAction.SET;
	playbackRate: number;
};

type RetrieveActionPayload = {
	action: MessagingAction.RETRIEVE;
};

type UpdateContextMenuPayload = {
	action: MessagingAction.UPDATE_CONTEXT_MENU;
	playbackRate: number;
};

/**
 * Discriminated Union, discriminator: action
 */
export type MessagingRequestPayload =
	| SetSpecificActionPayload
	| SetActionPayload
	| RetrieveActionPayload
	| UpdateContextMenuPayload;

export type RetrieveResponse = {
	playbackRate: number;
};

/**
 * Default configuration
 */
export type Defaults = {
	defaults: {
		enabled?: boolean;
		playbackRate?: number;
	};
};

// set playbackrate defaults
(async () => {
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
})();

/**
 * Find a video element by its src attribute.
 * Uses CSS.escape() to sanitize the input for use in a CSS selector.
 * @param {string} srcUrl - The src URL to match against video elements
 * @returns {HTMLVideoElement | null} The matching video element or null if not found
 */
function findVideoElementBySrc(srcUrl: string): HTMLVideoElement | null {
	return document.querySelector(`video[src='${CSS.escape(srcUrl)}']`);
}

// https://developer.chrome.com/docs/extensions/mv3/messaging/
chrome.runtime.onMessage.addListener((request: MessagingRequestPayload, _, sendResponse) => {
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
			if (!firstVideoElement) {
				sendResponse({ playbackRate: 1 });
			} else {
				sendResponse({ playbackRate: firstVideoElement.playbackRate });
			}
			break;
		default:
			break;
	}
});

/**
 * Updates context menu checked state when right-clicking on a video.
 */
document.addEventListener('contextmenu', (event) => {
	const target = event.target as HTMLElement;
	const video = target.closest('video') || (target.tagName === 'VIDEO' ? target : null);

	if (video) {
		const playbackRate = (video as HTMLVideoElement).playbackRate;
		chrome.runtime.sendMessage({
			action: MessagingAction.UPDATE_CONTEXT_MENU,
			playbackRate
		});
	}
});

/**
 * Listens for playback rate changes on video elements and stores the current rate
 * with the tab ID. This allows the popup slider to stay in sync when the rate
 * changes via native video controls or context menu.
 */
function setupRateChangeListener(video: HTMLVideoElement) {
	video.addEventListener('ratechange', async () => {
		const tabId = await getTabId();
		if (tabId !== undefined) {
			chrome.storage.local.set({ [`playbackRate_${tabId}`]: video.playbackRate });
		}
	});
}

/** Cache the tab ID to avoid repeated async calls */
let cachedTabId: number | undefined;

/**
 * Gets the current tab ID from the service worker.
 */
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

// Set up ratechange listeners for existing videos
document.querySelectorAll('video').forEach(setupRateChangeListener);

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
