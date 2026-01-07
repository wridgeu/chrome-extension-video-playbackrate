import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
	chromeContextMenusMock,
	chromeRuntimeMock,
	chromeStorageMock,
	chromeTabsMock,
	chromeActionMock,
	resetChromeMocks
} from './setup';
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

	beforeAll(async () => {
		vi.resetModules();
		resetChromeMocks();
		await import('@src/sw');

		onInstalledCallback = chromeRuntimeMock.onInstalled.addListener.mock.calls[0]?.[0];
		onClickedCallback = chromeContextMenusMock.onClicked.addListener.mock.calls[0]?.[0];
		onUpdatedCallback = chromeTabsMock.onUpdated.addListener.mock.calls[0]?.[0];
		onMessageCallback = chromeRuntimeMock.onMessage.addListener.mock.calls[0]?.[0];
		onStorageChangedCallback = chromeStorageMock.onChanged.addListener.mock.calls[0]?.[0];
	});

	beforeEach(() => {
		chromeContextMenusMock.create.mockClear();
		chromeStorageMock.local.set.mockClear();
		chromeStorageMock.local.get.mockClear();
		chromeTabsMock.sendMessage.mockClear();
	});

	describe('context menu creation', () => {
		it('registers onInstalled listener', () => {
			expect(chromeRuntimeMock.onInstalled.addListener).toHaveBeenCalled();
			expect(onInstalledCallback).toBeDefined();
		});

		it('creates menu items for video context only', () => {
			onInstalledCallback!({ reason: 'install' });

			expect(chromeContextMenusMock.create).toHaveBeenCalledTimes(contextMenuOptions.length);

			contextMenuOptions.forEach((option, index) => {
				expect(chromeContextMenusMock.create).toHaveBeenNthCalledWith(index + 1, {
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
			const createCalls = chromeContextMenusMock.create.mock.calls as Array<CreateCall>;
			const checkedItems = createCalls.filter((call) => call[0].checked === true);

			expect(checkedItems).toHaveLength(1);
			expect(checkedItems[0][0].title).toBe('Normal');
		});

		it('stores options in local storage', () => {
			onInstalledCallback!({ reason: 'install' });

			expect(chromeStorageMock.local.set).toHaveBeenCalledWith({
				contextMenuOptions: contextMenuOptions
			});
		});
	});

	describe('context menu click handler', () => {
		let executeScriptSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			chromeStorageMock.local.get.mockResolvedValue({ contextMenuOptions });
			executeScriptSpy = vi.spyOn(chrome.scripting, 'executeScript').mockClear();
		});

		it('registers onClicked listener', () => {
			expect(chromeContextMenusMock.onClicked.addListener).toHaveBeenCalled();
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
			chromeStorageMock.sync.get.mockImplementation(
				(_: unknown, callback?: (result: { badgeEnabled?: boolean }) => void) => {
					const result = { badgeEnabled: true };
					if (callback) callback(result);
					return Promise.resolve(result);
				}
			);
			chromeActionMock.setBadgeText.mockClear();

			await onClickedCallback!({ menuItemId: '6', srcUrl: 'https://example.com/video.mp4' }, { id: 123 });

			// Wait for async storage.sync.get callback
			await new Promise((r) => setTimeout(r, 10));

			expect(chromeActionMock.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId: 123 });
			expect(chromeActionMock.setBadgeBackgroundColor).toHaveBeenCalledWith({
				color: '#F7B731',
				tabId: 123
			});
			expect(chromeActionMock.setBadgeTextColor).toHaveBeenCalledWith({ color: '#000000', tabId: 123 });
		});

		it('stores playback rate for popup sync after click', async () => {
			chromeStorageMock.sync.get.mockImplementation(
				(_: unknown, callback?: (result: { badgeEnabled?: boolean }) => void) => {
					const result = { badgeEnabled: true };
					if (callback) callback(result);
					return Promise.resolve(result);
				}
			);

			await onClickedCallback!({ menuItemId: '5', srcUrl: 'https://example.com/video.mp4' }, { id: 456 });

			expect(chromeStorageMock.local.set).toHaveBeenCalledWith({ playbackRate_456: 1.5 });
		});

		it('does not update badge when badgeEnabled is false', async () => {
			chromeStorageMock.sync.get.mockImplementation(
				(_: unknown, callback?: (result: { badgeEnabled?: boolean }) => void) => {
					const result = { badgeEnabled: false };
					if (callback) callback(result);
					return Promise.resolve(result);
				}
			);
			chromeActionMock.setBadgeText.mockClear();

			await onClickedCallback!({ menuItemId: '6', srcUrl: 'https://example.com/video.mp4' }, { id: 123 });

			await new Promise((r) => setTimeout(r, 10));

			expect(chromeActionMock.setBadgeText).not.toHaveBeenCalled();
		});
	});

	describe('content script injection', () => {
		it('registers onUpdated listener', () => {
			expect(chromeTabsMock.onUpdated.addListener).toHaveBeenCalled();
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
			chromeActionMock.setBadgeText.mockClear();
			chromeStorageMock.sync.get.mockClear();
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
			chromeTabsMock.query.mockImplementation((_: unknown, callback: (tabs: Array<{ id: number }>) => void) => {
				callback([{ id: 1 }, { id: 2 }, { id: 3 }]);
			});

			onStorageChangedCallback!({ badgeEnabled: { newValue: false, oldValue: true } }, 'sync');

			await new Promise((r) => setTimeout(r, 10));

			expect(chromeActionMock.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
			expect(chromeActionMock.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 2 });
			expect(chromeActionMock.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 3 });
		});

		it('does not clear badges when badgeEnabled changes to true', async () => {
			chromeTabsMock.query.mockImplementation((_: unknown, callback: (tabs: Array<{ id: number }>) => void) => {
				callback([{ id: 1 }]);
			});

			onStorageChangedCallback!({ badgeEnabled: { newValue: true, oldValue: false } }, 'sync');

			await new Promise((r) => setTimeout(r, 10));

			expect(chromeActionMock.setBadgeText).not.toHaveBeenCalled();
		});

		it('uses tabId from request payload when provided (from popup)', async () => {
			chromeStorageMock.sync.get.mockImplementation(
				(_: unknown, callback?: (result: { badgeEnabled?: boolean }) => void) => {
					const result = { badgeEnabled: true };
					if (callback) callback(result);
					return Promise.resolve(result);
				}
			);
			chromeActionMock.setBadgeText.mockClear();

			// Popup sends tabId in request, sender.tab is undefined
			onMessageCallback!(
				{ action: MessagingAction.UPDATE_BADGE, playbackRate: 1.5, tabId: 789 },
				{}, // No sender.tab (message from popup)
				() => {}
			);

			await new Promise((r) => setTimeout(r, 10));

			expect(chromeActionMock.setBadgeText).toHaveBeenCalledWith({ text: '1.5', tabId: 789 });
		});

		it('falls back to sender.tab.id when request.tabId is not provided (from content script)', async () => {
			chromeStorageMock.sync.get.mockImplementation(
				(_: unknown, callback?: (result: { badgeEnabled?: boolean }) => void) => {
					const result = { badgeEnabled: true };
					if (callback) callback(result);
					return Promise.resolve(result);
				}
			);
			chromeActionMock.setBadgeText.mockClear();

			// Content script sends without tabId, has sender.tab
			onMessageCallback!(
				{ action: MessagingAction.UPDATE_BADGE, playbackRate: 2 },
				{ tab: { id: 456 } }, // sender.tab from content script
				() => {}
			);

			await new Promise((r) => setTimeout(r, 10));

			expect(chromeActionMock.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId: 456 });
		});

		it('updates context menu when UPDATE_CONTEXT_MENU message received', () => {
			chromeContextMenusMock.update.mockClear();

			onMessageCallback!(
				{ action: MessagingAction.UPDATE_CONTEXT_MENU, playbackRate: 2 },
				{ tab: { id: 123 } },
				() => {}
			);

			// Menu item '6' has playbackRate 2
			expect(chromeContextMenusMock.update).toHaveBeenCalledWith('6', { checked: true });
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
	it('formats integer rates without decimals', () => {
		expect(formatBadgeText(1)).toBe('1');
		expect(formatBadgeText(2)).toBe('2');
		expect(formatBadgeText(4)).toBe('4');
	});

	it('formats decimal rates with one decimal place', () => {
		expect(formatBadgeText(1.5)).toBe('1.5');
		expect(formatBadgeText(0.5)).toBe('0.5');
		expect(formatBadgeText(2.25)).toBe('2.3'); // toFixed rounds
	});

	it('handles zero', () => {
		expect(formatBadgeText(0)).toBe('0');
	});

	it('handles edge case decimal values', () => {
		expect(formatBadgeText(0.25)).toBe('0.3'); // toFixed rounds
		expect(formatBadgeText(3.5)).toBe('3.5');
	});
});
