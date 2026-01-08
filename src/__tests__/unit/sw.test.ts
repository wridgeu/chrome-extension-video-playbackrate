import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { chromeMock, resetChromeMocks } from './setup';
import contextMenuOptions from '@src/ContextMenuOptions';
import { findClosestOption, formatBadgeText, type ContextMenuOption } from '@src/sw';
import { MessagingAction } from '@src/types';

describe('Service Worker', () => {
	let onInstalledCallback: ((details: { reason: string }) => void) | undefined;
	let onClickedCallback:
		| ((itemData: { menuItemId: string; srcUrl: string }, tab: { id: number }) => Promise<void>)
		| undefined;
	let onUpdatedCallback: ((tabId: number, changeInfo: { status?: string }) => void) | undefined;
	let onMessageCallback:
		| ((
				request: { action: number; playbackRate?: number; tabId?: number },
				sender: { tab?: { id: number } },
				sendResponse: () => void
		  ) => void)
		| undefined;
	let onStorageChangedCallback:
		| ((changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, areaName: string) => void)
		| undefined;
	let onRemovedCallback: ((tabId: number) => void) | undefined;
	let onBeforeNavigateCallback: ((details: { tabId: number; frameId: number }) => void) | undefined;

	// Track if listeners were registered (captured before mocks are cleared)
	let listenersRegistered = {
		onInstalled: false,
		onClicked: false,
		onUpdated: false,
		onMessage: false,
		onStorageChanged: false,
		onRemoved: false,
		onBeforeNavigate: false
	};

	beforeAll(async () => {
		vi.resetModules();
		resetChromeMocks();
		await import('@src/sw');

		// Capture callbacks and track registration before mocks are cleared
		onInstalledCallback = chromeMock.runtime.onInstalled.addListener.mock.calls[0]?.[0];
		onClickedCallback = chromeMock.contextMenus.onClicked.addListener.mock.calls[0]?.[0];
		onUpdatedCallback = chromeMock.tabs.onUpdated.addListener.mock.calls[0]?.[0];
		onMessageCallback = chromeMock.runtime.onMessage.addListener.mock.calls[0]?.[0];
		onStorageChangedCallback = chromeMock.storage.onChanged.addListener.mock.calls[0]?.[0];
		onRemovedCallback = chromeMock.tabs.onRemoved.addListener.mock.calls[0]?.[0];
		onBeforeNavigateCallback = chromeMock.webNavigation.onBeforeNavigate.addListener.mock.calls[0]?.[0];

		listenersRegistered = {
			onInstalled: chromeMock.runtime.onInstalled.addListener.mock.calls.length > 0,
			onClicked: chromeMock.contextMenus.onClicked.addListener.mock.calls.length > 0,
			onUpdated: chromeMock.tabs.onUpdated.addListener.mock.calls.length > 0,
			onMessage: chromeMock.runtime.onMessage.addListener.mock.calls.length > 0,
			onStorageChanged: chromeMock.storage.onChanged.addListener.mock.calls.length > 0,
			onRemoved: chromeMock.tabs.onRemoved.addListener.mock.calls.length > 0,
			onBeforeNavigate: chromeMock.webNavigation.onBeforeNavigate.addListener.mock.calls.length > 0
		};
	});

	beforeEach(() => {
		chromeMock.contextMenus.create.mockClear();
		chromeMock.storage.local.set.mockClear();
		chromeMock.storage.local.get.mockClear();
		chromeMock.tabs.sendMessage.mockClear();
	});

	describe('context menu creation', () => {
		it('registers onInstalled listener', () => {
			expect(listenersRegistered.onInstalled).toBe(true);
			expect(onInstalledCallback).toBeDefined();
		});

		it('creates menu items for video context only', () => {
			onInstalledCallback!({ reason: 'install' });

			expect(chromeMock.contextMenus.create).toHaveBeenCalledTimes(contextMenuOptions.length);

			contextMenuOptions.forEach((option, index) => {
				expect(chromeMock.contextMenus.create).toHaveBeenNthCalledWith(index + 1, {
					id: option.id,
					type: 'radio',
					title: option.title,
					contexts: ['video'],
					checked: !!option.default
				});
			});
		});

		it('sets Normal as default checked option', () => {
			onInstalledCallback!({ reason: 'install' });

			type CreateCall = [{ checked: boolean; title: string }];
			const createCalls = chromeMock.contextMenus.create.mock.calls as Array<CreateCall>;
			const checkedItems = createCalls.filter((call) => call[0].checked === true);

			expect(checkedItems).toHaveLength(1);
			expect(checkedItems[0][0].title).toBe('Normal');
		});

		it('stores options in local storage', () => {
			onInstalledCallback!({ reason: 'install' });

			expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
				contextMenuOptions: contextMenuOptions
			});
		});

		it('injects content script into existing tabs on install', async () => {
			const existingTabs = [
				{ id: 1, url: 'https://example.com' },
				{ id: 2, url: 'https://test.com' },
				{ id: 3, url: 'https://other.com' }
			];
			chromeMock.tabs.query.mockResolvedValue(existingTabs);
			const executeScriptSpy = vi.spyOn(chrome.scripting, 'executeScript').mockClear();

			await onInstalledCallback!({ reason: 'install' });

			// Wait for async operations
			await new Promise((r) => setTimeout(r, 10));

			expect(chromeMock.tabs.query).toHaveBeenCalledWith({ url: ['http://*/*', 'https://*/*'] });
			expect(executeScriptSpy).toHaveBeenCalledTimes(3);
			existingTabs.forEach((tab) => {
				expect(executeScriptSpy).toHaveBeenCalledWith(
					{
						target: { tabId: tab.id, allFrames: true },
						files: ['/js/contentscript.js']
					},
					expect.any(Function)
				);
			});
		});

		it('skips tabs without id during batch injection', async () => {
			const existingTabs = [{ id: 1 }, { id: undefined }, { id: 3 }];
			chromeMock.tabs.query.mockResolvedValue(existingTabs);
			const executeScriptSpy = vi.spyOn(chrome.scripting, 'executeScript').mockClear();

			await onInstalledCallback!({ reason: 'install' });
			await new Promise((r) => setTimeout(r, 10));

			// Should only inject into tabs with valid id
			expect(executeScriptSpy).toHaveBeenCalledTimes(2);
		});
	});

	describe('context menu click handler', () => {
		let executeScriptSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			chromeMock.storage.local.get.mockResolvedValue({ contextMenuOptions });
			executeScriptSpy = vi.spyOn(chrome.scripting, 'executeScript').mockClear();
		});

		it('registers onClicked listener', () => {
			expect(listenersRegistered.onClicked).toBe(true);
			expect(onClickedCallback).toBeDefined();
		});

		it('executes script to set playback rate on click', async () => {
			await onClickedCallback!({ menuItemId: '6', srcUrl: 'https://example.com/video.mp4' }, { id: 123 });

			expect(executeScriptSpy).toHaveBeenCalledWith({
				target: { tabId: 123, allFrames: true },
				func: expect.any(Function),
				args: ['https://example.com/video.mp4', 2]
			});
		});

		it('maps menu item ids to correct playback rates', async () => {
			const testCases = [
				{ menuItemId: '1', expectedRate: 0.25 },
				{ menuItemId: '3', expectedRate: 1 },
				{ menuItemId: '12', expectedRate: 4 }
			];

			for (const { menuItemId, expectedRate } of testCases) {
				executeScriptSpy.mockClear();
				await onClickedCallback!({ menuItemId, srcUrl: 'https://test.com/video.mp4' }, { id: 1 });

				expect(executeScriptSpy).toHaveBeenCalledWith({
					target: { tabId: 1, allFrames: true },
					func: expect.any(Function),
					args: ['https://test.com/video.mp4', expectedRate]
				});
			}
		});

		it('ignores unknown menu item ids', async () => {
			await onClickedCallback!({ menuItemId: 'invalid', srcUrl: 'https://test.com/video.mp4' }, { id: 1 });

			expect(executeScriptSpy).not.toHaveBeenCalled();
		});

		it('updates badge after setting playback rate', async () => {
			chromeMock.storage.sync.get.mockImplementation(
				(_: unknown, callback?: (result: { badgeEnabled?: boolean }) => void) => {
					const result = { badgeEnabled: true };
					if (callback) callback(result);
					return Promise.resolve(result);
				}
			);
			chromeMock.action.setBadgeText.mockClear();

			await onClickedCallback!({ menuItemId: '6', srcUrl: 'https://example.com/video.mp4' }, { id: 123 });

			// Wait for async storage.sync.get callback
			await new Promise((r) => setTimeout(r, 10));

			expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId: 123 });
			expect(chromeMock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
				color: '#F7B731',
				tabId: 123
			});
			expect(chromeMock.action.setBadgeTextColor).toHaveBeenCalledWith({ color: '#000000', tabId: 123 });
		});

		it('stores playback rate for popup sync after click', async () => {
			chromeMock.storage.sync.get.mockImplementation(
				(_: unknown, callback?: (result: { badgeEnabled?: boolean }) => void) => {
					const result = { badgeEnabled: true };
					if (callback) callback(result);
					return Promise.resolve(result);
				}
			);

			await onClickedCallback!({ menuItemId: '5', srcUrl: 'https://example.com/video.mp4' }, { id: 456 });

			expect(chromeMock.storage.local.set).toHaveBeenCalledWith({ playbackRate_456: 1.5 });
		});

		it('does not update badge when badgeEnabled is false', async () => {
			chromeMock.storage.sync.get.mockImplementation(
				(_: unknown, callback?: (result: { badgeEnabled?: boolean }) => void) => {
					const result = { badgeEnabled: false };
					if (callback) callback(result);
					return Promise.resolve(result);
				}
			);
			chromeMock.action.setBadgeText.mockClear();

			await onClickedCallback!({ menuItemId: '6', srcUrl: 'https://example.com/video.mp4' }, { id: 123 });

			await new Promise((r) => setTimeout(r, 10));

			expect(chromeMock.action.setBadgeText).not.toHaveBeenCalled();
		});
	});

	describe('content script injection', () => {
		it('registers onUpdated listener', () => {
			expect(listenersRegistered.onUpdated).toBe(true);
			expect(onUpdatedCallback).toBeDefined();
		});

		it('injects script when tab load completes', () => {
			const executeSpy = vi.spyOn(chrome.scripting, 'executeScript').mockClear();

			onUpdatedCallback!(123, { status: 'complete' });

			expect(executeSpy).toHaveBeenCalledWith(
				{ target: { tabId: 123, allFrames: true }, files: ['/js/contentscript.js'] },
				expect.any(Function)
			);
		});

		it('skips injection for non-complete status', () => {
			const executeSpy = vi.spyOn(chrome.scripting, 'executeScript').mockClear();

			onUpdatedCallback!(123, { status: 'loading' });
			onUpdatedCallback!(456, {});

			expect(executeSpy).not.toHaveBeenCalled();
		});
	});

	describe('badge toggle behavior', () => {
		beforeEach(() => {
			chromeMock.action.setBadgeText.mockClear();
			chromeMock.storage.sync.get.mockClear();
		});

		it('registers message listener for badge updates', () => {
			expect(onMessageCallback).toBeDefined();
			expect(typeof onMessageCallback).toBe('function');
		});

		it('registers storage change listener', () => {
			expect(onStorageChangedCallback).toBeDefined();
			expect(typeof onStorageChangedCallback).toBe('function');
		});

		it('clears all badges when badgeEnabled changes to false', async () => {
			chromeMock.tabs.query.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

			await onStorageChangedCallback!({ badgeEnabled: { newValue: false, oldValue: true } }, 'sync');

			expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
			expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 2 });
			expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 3 });
		});

		it('does not clear badges when badgeEnabled changes to true', async () => {
			chromeMock.tabs.query.mockResolvedValue([{ id: 1 }]);

			onStorageChangedCallback!({ badgeEnabled: { newValue: true, oldValue: false } }, 'sync');

			await new Promise((r) => setTimeout(r, 10));

			expect(chromeMock.action.setBadgeText).not.toHaveBeenCalled();
		});

		it('uses tabId from request payload when provided (from popup)', async () => {
			chromeMock.storage.sync.get.mockImplementation(
				(_: unknown, callback?: (result: { badgeEnabled?: boolean }) => void) => {
					const result = { badgeEnabled: true };
					if (callback) callback(result);
					return Promise.resolve(result);
				}
			);
			chromeMock.action.setBadgeText.mockClear();

			// Popup sends tabId in request, sender.tab is undefined
			onMessageCallback!(
				{ action: MessagingAction.UPDATE_BADGE, playbackRate: 1.5, tabId: 789 },
				{}, // No sender.tab (message from popup)
				() => {}
			);

			await new Promise((r) => setTimeout(r, 10));

			expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '1.5', tabId: 789 });
		});

		it('falls back to sender.tab.id when request.tabId is not provided (from content script)', async () => {
			chromeMock.storage.sync.get.mockImplementation(
				(_: unknown, callback?: (result: { badgeEnabled?: boolean }) => void) => {
					const result = { badgeEnabled: true };
					if (callback) callback(result);
					return Promise.resolve(result);
				}
			);
			chromeMock.action.setBadgeText.mockClear();

			// Content script sends without tabId, has sender.tab
			onMessageCallback!(
				{ action: MessagingAction.UPDATE_BADGE, playbackRate: 2 },
				{ tab: { id: 456 } }, // sender.tab from content script
				() => {}
			);

			await new Promise((r) => setTimeout(r, 10));

			expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId: 456 });
		});

		it('updates context menu when UPDATE_CONTEXT_MENU message received', () => {
			chromeMock.contextMenus.update.mockClear();

			onMessageCallback!(
				{ action: MessagingAction.UPDATE_CONTEXT_MENU, playbackRate: 2 },
				{ tab: { id: 123 } },
				() => {}
			);

			// Menu item '6' has playbackRate 2
			expect(chromeMock.contextMenus.update).toHaveBeenCalledWith('6', { checked: true });
		});
	});

	describe('tab cleanup on close', () => {
		it('registers onRemoved listener', () => {
			expect(listenersRegistered.onRemoved).toBe(true);
			expect(onRemovedCallback).toBeDefined();
		});

		it('clears playback rate storage when tab is closed', () => {
			chromeMock.storage.local.remove.mockClear();

			onRemovedCallback!(123);

			expect(chromeMock.storage.local.remove).toHaveBeenCalledWith('playbackRate_123');
		});
	});

	describe('navigation event handling', () => {
		it('registers onBeforeNavigate listener', () => {
			expect(listenersRegistered.onBeforeNavigate).toBe(true);
			expect(onBeforeNavigateCallback).toBeDefined();
		});

		it('clears badge on main frame navigation', () => {
			chromeMock.action.setBadgeText.mockClear();

			onBeforeNavigateCallback!({ tabId: 456, frameId: 0 });

			expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 456 });
		});

		it('does not clear badge on subframe navigation', () => {
			chromeMock.action.setBadgeText.mockClear();

			onBeforeNavigateCallback!({ tabId: 456, frameId: 1 });

			expect(chromeMock.action.setBadgeText).not.toHaveBeenCalled();
		});
	});
});

describe('findClosestOption', () => {
	const testOptions: ContextMenuOption[] = [
		{ id: '1', title: 'Slow', playbackRate: 0.5, default: false },
		{ id: '2', title: 'Normal', playbackRate: 1, default: true },
		{ id: '3', title: 'Fast', playbackRate: 1.5, default: false },
		{ id: '4', title: 'Faster', playbackRate: 2, default: false }
	];

	it('returns exact match when available', () => {
		const result = findClosestOption(1.5, testOptions);
		expect(result?.id).toBe('3');
		expect(result?.playbackRate).toBe(1.5);
	});

	it('returns closest option when no exact match (rounds down)', () => {
		const result = findClosestOption(1.2, testOptions);
		expect(result?.id).toBe('2');
		expect(result?.playbackRate).toBe(1);
	});

	it('returns closest option when no exact match (rounds up)', () => {
		const result = findClosestOption(1.3, testOptions);
		expect(result?.id).toBe('3');
		expect(result?.playbackRate).toBe(1.5);
	});

	it('handles edge case at boundary', () => {
		const result = findClosestOption(1.25, testOptions);
		// 1.25 is equidistant from 1 and 1.5, should return the first one found (1)
		expect(result?.playbackRate).toBe(1);
	});

	it('returns undefined for empty options array', () => {
		const result = findClosestOption(1.5, []);
		expect(result).toBeUndefined();
	});

	it('handles values below minimum option', () => {
		const result = findClosestOption(0.1, testOptions);
		expect(result?.id).toBe('1');
		expect(result?.playbackRate).toBe(0.5);
	});

	it('handles values above maximum option', () => {
		const result = findClosestOption(10, testOptions);
		expect(result?.id).toBe('4');
		expect(result?.playbackRate).toBe(2);
	});

	it('works with real context menu options', () => {
		const result = findClosestOption(1.8, contextMenuOptions);
		// 1.8 is between 1.5 and 2, closer to 2
		expect(result?.playbackRate).toBe(2);
	});
});

describe('formatBadgeText', () => {
	it('converts playback rates to string format', () => {
		// Integers
		expect(formatBadgeText(1)).toBe('1');
		expect(formatBadgeText(2)).toBe('2');
		// Decimals
		expect(formatBadgeText(0.75)).toBe('0.75');
		expect(formatBadgeText(1.5)).toBe('1.5');
	});

	it('handles very small decimal values', () => {
		expect(formatBadgeText(0.25)).toBe('0.25');
		expect(formatBadgeText(0.1)).toBe('0.1');
	});

	it('handles very large values', () => {
		expect(formatBadgeText(4)).toBe('4');
		expect(formatBadgeText(16)).toBe('16');
	});

	it('handles zero value', () => {
		expect(formatBadgeText(0)).toBe('0');
	});

	it('handles values with many decimal places', () => {
		expect(formatBadgeText(0.33)).toBe('0.33');
		expect(formatBadgeText(1.25)).toBe('1.25');
	});
});
