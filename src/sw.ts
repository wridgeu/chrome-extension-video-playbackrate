import { MessagingAction, type MessagingRequestPayload } from '@src/types';
import { PLAYBACK_RATES, findClosestRate, formatRate, getPlaybackRateStorageKey } from '@src/util/playback';

/** Badge background color - matches the icon's golden yellow */
const BADGE_BACKGROUND_COLOR = '#F7B731';
/** Badge text color - black for contrast */
const BADGE_TEXT_COLOR = '#000000';

// Track tabs where content script has been injected to prevent duplicates
const injectedTabs = new Set<number>();

/** Inject content script into a tab and track injection status. */
function injectContentScript(tabId: number): void {
	// Add to set immediately to prevent race condition with onUpdated
	injectedTabs.add(tabId);
	chrome.scripting.executeScript(
		{
			target: { tabId, allFrames: true },
			files: ['/js/contentscript-loader.js']
		},
		() => {
			if (chrome.runtime.lastError) {
				// Remove from set on failure so retry is possible
				injectedTabs.delete(tabId);
				if (import.meta.env.DEV) {
					console.warn('Content script injection failed:', chrome.runtime.lastError.message);
				}
			}
		}
	);
}

/** Check the context menu entry (id = the rate) closest to the given playback rate. */
function updateContextMenu(playbackRate: number): void {
	// Callback handles case where menu item doesn't exist after service worker restart
	chrome.contextMenus.update(String(findClosestRate(playbackRate)), { checked: true }, () => {
		if (chrome.runtime.lastError && import.meta.env.DEV) {
			console.warn('Context menu update skipped:', chrome.runtime.lastError.message);
		}
	});
}

/** Sync the badge (unless disabled), the context menu and the per-tab rate the popup listens to. */
async function handleRateUpdate(playbackRate: number, tabId: number | undefined): Promise<void> {
	updateContextMenu(playbackRate);
	if (tabId === undefined) return;

	chrome.storage.local.set({ [getPlaybackRateStorageKey(tabId)]: playbackRate });

	const { badgeEnabled } = await chrome.storage.sync.get('badgeEnabled');
	setBadge(badgeEnabled === false ? undefined : playbackRate, tabId);
}

/** Show `playbackRate` on the tab's badge, or clear the badge when it is undefined. */
function setBadge(playbackRate: number | undefined, tabId: number): void {
	if (playbackRate === undefined) {
		chrome.action.setBadgeText({ text: '', tabId });
		return;
	}
	chrome.action.setBadgeText({ text: String(playbackRate), tabId });
	chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR, tabId });
	chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR, tabId });
}

/**
 * Injected into the page by the context menu: sets the rate of the video playing `srcUrl`.
 * Matches `currentSrc` too, for videos using `<source>` children. Must stay self-contained (it is serialized).
 */
export function setRateOfVideoWithSrc(srcUrl: string, rate: number): void {
	const video = Array.from(document.querySelectorAll('video')).find((v) => v.src === srcUrl || v.currentSrc === srcUrl);
	if (video) video.playbackRate = rate;
}

/** Initialize context menu with playback rate options and inject content script into existing tabs. */
chrome.runtime.onInstalled.addListener(async () => {
	// Menu items survive extension updates; start fresh so renamed or removed entries don't linger
	await chrome.contextMenus.removeAll();
	PLAYBACK_RATES.forEach((rate) => {
		chrome.contextMenus.create({
			id: String(rate),
			type: 'radio',
			title: formatRate(rate),
			contexts: ['video'],
			checked: rate === 1
		});
	});

	// Inject content script into all existing tabs so extension works without requiring a page refresh
	const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
	for (const tab of tabs) {
		if (tab.id) {
			injectContentScript(tab.id);
		}
	}
});

/** Set playback rate when context menu item is clicked. */
chrome.contextMenus.onClicked.addListener(async (itemData, tab) => {
	const rate = Number(itemData.menuItemId);
	if (!tab?.id || !PLAYBACK_RATES.includes(rate) || !itemData.srcUrl) return;

	// Use executeScript to set playback rate directly, avoiding content script dependency
	chrome.scripting.executeScript({
		target: { tabId: tab.id, allFrames: true },
		func: setRateOfVideoWithSrc,
		args: [itemData.srcUrl, rate]
	});
	await handleRateUpdate(rate, tab.id);
});

/** Inject content script when a tab finishes loading. */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
	if (changeInfo.status === 'complete' && !injectedTabs.has(tabId)) {
		injectContentScript(tabId);
	}
});

// Clean up tracking and storage when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
	injectedTabs.delete(tabId);
	chrome.storage.local.remove(getPlaybackRateStorageKey(tabId));
});

// A main frame navigation needs a fresh injection (Chrome resets the tab's badge itself)
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
	if (details.frameId === 0) {
		injectedTabs.delete(details.tabId);
	}
});

/** Handle rate updates from content scripts and the popup. */
chrome.runtime.onMessage.addListener((request: MessagingRequestPayload, sender) => {
	if (typeof request.playbackRate !== 'number') return;

	if (request.action === MessagingAction.UPDATE_CONTEXT_MENU) {
		updateContextMenu(request.playbackRate);
	} else if (request.action === MessagingAction.UPDATE_UI) {
		// Prefer the browser-provided sender tab; only the popup (which has no sender tab) names a tab itself
		handleRateUpdate(request.playbackRate, sender.tab?.id ?? request.tabId);
	}
});

/** Apply the badge setting to all open tabs right away: clear the badges, or restore them from the stored rates. */
chrome.storage.onChanged.addListener(async (changes, areaName) => {
	if (areaName !== 'sync' || !changes.badgeEnabled) return;

	const enabled = changes.badgeEnabled.newValue !== false;
	const tabIds = (await chrome.tabs.query({})).flatMap((tab) => (tab.id ? [tab.id] : []));
	const storedRates = await chrome.storage.local.get(tabIds.map((tabId) => getPlaybackRateStorageKey(tabId)));
	for (const tabId of tabIds) {
		const rate = storedRates[getPlaybackRateStorageKey(tabId)];
		setBadge(enabled && typeof rate === 'number' ? rate : undefined, tabId);
	}
});
