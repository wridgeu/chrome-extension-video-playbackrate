import { default as contextMenuOptions } from './ContextMenuOptions.js';
import { MessagingAction, MessagingRequestPayload } from './contentscript.js';

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
 * Initalize the context menu & fill it with data
 */
chrome.runtime.onInstalled.addListener(() => {
	contextMenuOptions.forEach((option) => {
		chrome.contextMenus.create({
			id: option.id,
			type: 'radio',
			title: option.title,
			contexts: ['video'],
			checked: option.default ? true : false
		});
	});
	chrome.storage.local.set({ contextMenuOptions: contextMenuOptions });
});

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (itemData, tab) => {
	const { contextMenuOptions } = <ContextMenuStorage>await chrome.storage.local.get(['contextMenuOptions']);
	const menuItem = contextMenuOptions.find((item: ContextMenuOption) => item.id === itemData.menuItemId);
	if (menuItem) {
		chrome.tabs.sendMessage(
			<number>tab?.id,
			<MessagingRequestPayload>{
				action: MessagingAction.SETSPECIFIC,
				videoElementSrcAttributeValue: itemData.srcUrl,
				playbackRate: menuItem.playbackRate
			}
		);
	}
});

/**
 * Execute our contentscript whenever the page within a tab changes
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status == 'complete') {
		chrome.scripting.executeScript(
			{
				target: { tabId: tabId },
				files: ['/js/contentscript.js']
			},
			() => {
				if (chrome.runtime.lastError) {
					console.warn('Error occured when trying to insert/execute the contentscript!', [
						chrome.runtime.lastError?.message
					]);
				}
			}
		);
	}
});
