import { default as contextMenuOptions } from './ContextMenuOptions.js';
import { MessagingAction, type MessagingRequestPayload } from './contentscript.js';

type ContextMenuStorage = {
	contextMenuOptions: ContextMenuOption[];
};

type ContextMenuOption = {
	id: string;
	title: string;
	playbackRate: number;
	default?: boolean;
};

/**
 * Find the context menu option with the closest playback rate
 */
export function findClosestOption(playbackRate: number, options: ContextMenuOption[]): ContextMenuOption | undefined {
	if (options.length === 0) return undefined;

	return options.reduce((closest, current) => {
		const closestDiff = Math.abs(closest.playbackRate - playbackRate);
		const currentDiff = Math.abs(current.playbackRate - playbackRate);
		return currentDiff < closestDiff ? current : closest;
	});
}

export type { ContextMenuOption };

/**
 * Initalize the context menu & fill it with data
 */
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

/**
 * Handle context menu clicks
 */
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

/**
 * Execute our contentscript whenever the page within a tab changes
 */
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

// Clean up tracking when tab is closed or navigates to new page
chrome.tabs.onRemoved.addListener((tabId) => {
	injectedTabs.delete(tabId);
});

chrome.webNavigation?.onBeforeNavigate?.addListener((details) => {
	// Only clear for main frame navigations
	if (details.frameId === 0) {
		injectedTabs.delete(details.tabId);
	}
});

type GetTabIdPayload = {
	action: 'getTabId';
};

type IncomingMessage = MessagingRequestPayload | GetTabIdPayload;

/**
 * Handle messages from content script to update context menu checked state
 * and respond with tab ID for rate change tracking.
 */
chrome.runtime.onMessage.addListener((request: IncomingMessage, sender, sendResponse) => {
	if (request.action === MessagingAction.UPDATE_CONTEXT_MENU) {
		const closestOption = findClosestOption(request.playbackRate, contextMenuOptions);
		if (closestOption) {
			chrome.contextMenus.update(closestOption.id, { checked: true });
		}
	} else if (request.action === 'getTabId') {
		sendResponse({ tabId: sender.tab?.id });
		return true;
	}
});
