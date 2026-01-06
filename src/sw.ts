import { default as contextMenuOptions } from './ContextMenuOptions.js';
import { MessagingAction, type MessagingRequestPayload } from './contentscript.js';

/** Badge background color - matches the icon's golden yellow */
const BADGE_BACKGROUND_COLOR = '#F7B731';
/** Badge text color - black for contrast */
const BADGE_TEXT_COLOR = '#000000';

type ContextMenuStorage = {
	contextMenuOptions: ContextMenuOption[];
};

type ContextMenuOption = {
	id: string;
	title: string;
	playbackRate: number;
	default?: boolean;
};

/** Finds the context menu option with the closest playback rate. */
export function findClosestOption(playbackRate: number, options: ContextMenuOption[]): ContextMenuOption | undefined {
	if (options.length === 0) return undefined;

	return options.reduce((closest, current) => {
		const closestDiff = Math.abs(closest.playbackRate - playbackRate);
		const currentDiff = Math.abs(current.playbackRate - playbackRate);
		return currentDiff < closestDiff ? current : closest;
	});
}

export type { ContextMenuOption };

/** Initialize context menu with playback rate options. */
chrome.runtime.onInstalled.addListener(() => {
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
});

/** Send playback rate to content script when context menu item is clicked. */
chrome.contextMenus.onClicked.addListener(async (itemData, tab) => {
	// Guard against missing tab ID
	if (!tab?.id) return;

	const { contextMenuOptions } = <ContextMenuStorage>await chrome.storage.local.get(['contextMenuOptions']);
	const menuItem = contextMenuOptions.find((item: ContextMenuOption) => item.id === itemData.menuItemId);
	if (menuItem) {
		chrome.tabs.sendMessage(tab.id, <MessagingRequestPayload>{
			action: MessagingAction.SETSPECIFIC,
			videoElementSrcAttributeValue: itemData.srcUrl,
			playbackRate: menuItem.playbackRate
		});
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
				target: { tabId: tabId },
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

/**
 * Formats the playback rate for display in the badge.
 * Shows integers without decimals (e.g., "2"), decimals with one digit precision (e.g., "1.5").
 */
export function formatBadgeText(rate: number): string {
	return Number.isInteger(rate) ? rate.toString() : rate.toFixed(1);
}

/** Handle messages from content script for context menu sync, badge updates, and tab ID requests. */
chrome.runtime.onMessage.addListener((request: IncomingMessage, sender, sendResponse) => {
	if (request.action === MessagingAction.UPDATE_CONTEXT_MENU) {
		const closestOption = findClosestOption(request.playbackRate, contextMenuOptions);
		if (closestOption) {
			chrome.contextMenus.update(closestOption.id, { checked: true });
		}
	} else if (request.action === MessagingAction.UPDATE_BADGE) {
		const tabId = sender.tab?.id;
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
