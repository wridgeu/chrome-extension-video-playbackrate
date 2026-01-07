import { default as contextMenuOptions } from './ContextMenuOptions.js';
import { MessagingAction, type MessagingRequestPayload } from './types';
import { findClosestOption, formatBadgeText, type PlaybackOption } from './util/playback.js';

// Re-export for backwards compatibility
export { findClosestOption, formatBadgeText };
export type { PlaybackOption as ContextMenuOption };

/** Badge background color - matches the icon's golden yellow */
const BADGE_BACKGROUND_COLOR = '#F7B731';
/** Badge text color - black for contrast */
const BADGE_TEXT_COLOR = '#000000';

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
			chrome.scripting.executeScript(
				{
					target: { tabId: tab.id, allFrames: true },
					files: ['/js/contentscript.js']
				},
				() => {
					if (!chrome.runtime.lastError) {
						injectedTabs.add(tab.id!);
					}
				}
			);
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
		chrome.storage.sync.get('badgeEnabled', ({ badgeEnabled }) => {
			if (badgeEnabled === false) return;
			const badgeText = formatBadgeText(menuItem.playbackRate);
			chrome.action.setBadgeText({ text: badgeText, tabId: tab.id });
			chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR, tabId: tab.id });
			chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR, tabId: tab.id });
		});
		// Store rate for popup sync
		chrome.storage.local.set({ [`playbackRate_${tab.id}`]: menuItem.playbackRate });
	}
});

// Track tabs where content script has been injected to prevent duplicates
const injectedTabs = new Set<number>();

/** Inject content script when a tab finishes loading. */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
	if (changeInfo.status === 'complete') {
		// Prevent duplicate injections by checking if already injected
		if (injectedTabs.has(tabId)) return;

		chrome.scripting.executeScript(
			{
				target: { tabId: tabId, allFrames: true },
				files: ['/js/contentscript.js']
			},
			() => {
				if (chrome.runtime.lastError) {
					console.warn('Error occurred when trying to insert/execute the contentscript!', [
						chrome.runtime.lastError?.message
					]);
				} else {
					injectedTabs.add(tabId);
				}
			}
		);
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

type GetTabIdPayload = {
	action: 'getTabId';
};

type IncomingMessage = MessagingRequestPayload | GetTabIdPayload;

/** Handle messages from content script for context menu sync, badge updates, and tab ID requests. */
chrome.runtime.onMessage.addListener((request: IncomingMessage, sender, sendResponse) => {
	if (request.action === MessagingAction.UPDATE_CONTEXT_MENU) {
		const closestOption = findClosestOption(request.playbackRate, contextMenuOptions);
		if (closestOption) {
			chrome.contextMenus.update(closestOption.id, { checked: true });
		}
	} else if (request.action === MessagingAction.UPDATE_BADGE) {
		const tabId = request.tabId ?? sender.tab?.id;
		// Check if badge is enabled (default: true)
		chrome.storage.sync.get('badgeEnabled', ({ badgeEnabled }) => {
			if (badgeEnabled === false) {
				// Clear badge if disabled
				chrome.action.setBadgeText({ text: '', tabId });
				return;
			}
			const badgeText = formatBadgeText(request.playbackRate);
			chrome.action.setBadgeText({ text: badgeText, tabId });
			chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR, tabId });
			chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR, tabId });
		});
	} else if (request.action === 'getTabId') {
		sendResponse({ tabId: sender.tab?.id });
		return true;
	}
});

/** Clear badges on all tabs when user disables badge in options. */
chrome.storage.onChanged.addListener((changes, areaName) => {
	if (areaName === 'sync' && changes.badgeEnabled) {
		if (changes.badgeEnabled.newValue === false) {
			// Clear badge on all tabs when disabled
			chrome.tabs.query({}, (tabs) => {
				tabs.forEach((tab) => {
					if (tab.id) {
						chrome.action.setBadgeText({ text: '', tabId: tab.id });
					}
				});
			});
		}
	}
});
