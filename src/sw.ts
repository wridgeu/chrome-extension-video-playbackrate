import { ChromeMessagingRequestAction, ContextMenuOption, ContextMenuStorage } from './types';

try {
	// on page change
	chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
		if (changeInfo.status == 'complete') {
			chrome.scripting.executeScript({
				target: { tabId: tabId },
				files: ['/js/contentscript.js']
			});
		}
	});

	// initialize context menu
	chrome.runtime.onInstalled.addListener(() => {
		const contextMenuOptions = [
			{
				id: '1',
				title: 'Slo-mo (0.25x)',
				playbackRate: 0.25
			},
			{
				id: '2',
				title: 'Slower (0.5x)',
				playbackRate: 0.5
			},
			{
				id: '3',
				title: 'Normal',
				playbackRate: 1,
				default: true
			},
			{
				id: '4',
				title: 'Faster (1.25x)',
				playbackRate: 1.25
			},
			{
				id: '5',
				title: 'High Speed (1.5x)',
				playbackRate: 1.5
			},
			{
				id: '6',
				title: 'Ludicrous Speed (2x)',
				playbackRate: 2
			},
			{
				id: '7',
				title: 'Ludicrous Speed (2.25x)',
				playbackRate: 2.25
			},
			{
				id: '8',
				title: 'Ludicrous Speed (2.5x)',
				playbackRate: 2.5
			},
			{
				id: '9',
				title: 'Ludicrous Speed (3x)',
				playbackRate: 3
			},
			{
				id: '10',
				title: 'Ludicrous Speed (3.25x)',
				playbackRate: 3.25
			},
			{
				id: '11',
				title: 'Ludicrous Speed (3.5x)',
				playbackRate: 3.5
			},
			{
				id: '12',
				title: 'Ludicrous Speed (4x)',
				playbackRate: 4
			}
		];
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

	// react on context menu clicks
	chrome.contextMenus.onClicked.addListener(async (itemData, tab) => {
		const { contextMenuOptions } = <ContextMenuStorage>await chrome.storage.local.get(['contextMenuOptions']);
		const menuItem = contextMenuOptions.find((item: ContextMenuOption) => item.id === itemData.menuItemId);
		if (menuItem) {
			chrome.tabs.sendMessage(<number>tab?.id, {
				action: ChromeMessagingRequestAction.SETSPECIFIC,
				videoElementSrcAttributeValue: itemData.srcUrl,
				playbackRate: menuItem.playbackRate
			});
		}
	});
} catch (e) {
	console.error(`ERROR: ${e}`);
}
