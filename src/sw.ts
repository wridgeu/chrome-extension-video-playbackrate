import { default as contextMenuOptions } from '@src/ContextMenuOptions';
import { MessagingAction, type MessagingRequestPayload } from '@src/types';
import { findClosestOption, formatBadgeText, type PlaybackOption } from '@src/util/playback';

// Re-export for backwards compatibility
export { findClosestOption, formatBadgeText };
export type { PlaybackOption as ContextMenuOption };

/** Badge background color - matches the icon's golden yellow */
const BADGE_BACKGROUND_COLOR = '#F7B731';
/** Badge text color - black for contrast */
const BADGE_TEXT_COLOR = '#000000';

// Track tabs where content script has been injected to prevent duplicates
const injectedTabs = new Set<number>();

/** Update badge text, background color, and text color for a specific tab. */
function updateBadge(text: string, tabId: number | undefined): void {
	chrome.action.setBadgeText({ text, tabId });
	chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR, tabId });
	chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR, tabId });
}

/** Inject content script into a tab and track injection status. */
function injectContentScript(tabId: number): void {
	chrome.scripting.executeScript(
		{
			target: { tabId, allFrames: true },
			files: ['/js/contentscript-loader.js']
		},
		() => {
			if (chrome.runtime.lastError) {
				if (import.meta.env?.DEV) {
					console.warn('Content script injection failed:', chrome.runtime.lastError.message);
				}
			} else {
				injectedTabs.add(tabId);
			}
		}
	);
}

/** Handle badge update request, checking if badge is enabled. */
function handleBadgeUpdate(playbackRate: number, tabId: number | undefined): void {
	chrome.storage.sync.get('badgeEnabled').then(({ badgeEnabled }) => {
		if (badgeEnabled === false) {
			chrome.action.setBadgeText({ text: '', tabId });
			return;
		}
		updateBadge(formatBadgeText(playbackRate), tabId);
	});
}

type ContextMenuStorage = {
	contextMenuOptions: PlaybackOption[];
};

/** Initialize context menu with playback rate options and inject content script into existing tabs. */
chrome.runtime.onInstalled.addListener(async () => {
	contextMenuOptions.forEach((option) => {
		chrome.contextMenus.create({
			id: option.id,
			type: 'radio',
			title: option.title,
			contexts: ['video'],
			checked: !!option.default
		});
	});
	chrome.storage.local.set({ contextMenuOptions: contextMenuOptions });

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
	// Guard against missing tab ID
	if (!tab?.id) return;

	const { contextMenuOptions } = <ContextMenuStorage>await chrome.storage.local.get(['contextMenuOptions']);
	const menuItem = contextMenuOptions.find((item: PlaybackOption) => item.id === itemData.menuItemId);
	if (menuItem && itemData.srcUrl) {
		// Use executeScript to set playback rate directly, avoiding content script dependency
		chrome.scripting.executeScript({
			target: { tabId: tab.id, allFrames: true },
			func: (srcUrl: string, rate: number) => {
				// Find video by src attribute or currentSrc (for videos using <source> elements)
				const videos = document.querySelectorAll('video');
				for (const video of videos) {
					if (video.src === srcUrl || video.currentSrc === srcUrl) {
						video.playbackRate = rate;
						break;
					}
				}
			},
			args: [itemData.srcUrl, menuItem.playbackRate]
		});
		// Update badge after setting playback rate
		const { badgeEnabled } = await chrome.storage.sync.get('badgeEnabled');
		if (badgeEnabled !== false) {
			updateBadge(formatBadgeText(menuItem.playbackRate), tab.id);
		}
		// Store rate for popup sync
		chrome.storage.local.set({ [`playbackRate_${tab.id}`]: menuItem.playbackRate });
	}
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
	chrome.storage.local.remove(`playbackRate_${tabId}`);
});

chrome.webNavigation?.onBeforeNavigate?.addListener((details) => {
	// Only clear for main frame navigations
	if (details.frameId === 0) {
		injectedTabs.delete(details.tabId);
		// Clear badge when navigating away
		chrome.action.setBadgeText({ text: '', tabId: details.tabId });
	}
});

/** Handle messages from content script for context menu sync, badge updates, and tab ID requests. */
chrome.runtime.onMessage.addListener((request: MessagingRequestPayload, sender, sendResponse) => {
	if (request.action === MessagingAction.UPDATE_CONTEXT_MENU) {
		const closestOption = findClosestOption(request.playbackRate, contextMenuOptions);
		if (closestOption) {
			chrome.contextMenus.update(closestOption.id, { checked: true });
		}
	} else if (request.action === MessagingAction.UPDATE_BADGE) {
		handleBadgeUpdate(request.playbackRate, request.tabId ?? sender.tab?.id);
	} else if (request.action === MessagingAction.GET_TAB_ID) {
		sendResponse({ tabId: sender.tab?.id });
		return true;
	}
});

/** Clear badges on all tabs when user disables badge in options. */
chrome.storage.onChanged.addListener(async (changes, areaName) => {
	if (areaName === 'sync' && changes.badgeEnabled?.newValue === false) {
		const tabs = await chrome.tabs.query({});
		tabs.forEach((tab) => {
			if (tab.id) {
				chrome.action.setBadgeText({ text: '', tabId: tab.id });
			}
		});
	}
});
