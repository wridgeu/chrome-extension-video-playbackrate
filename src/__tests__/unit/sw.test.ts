import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
	chromeContextMenusMock,
	chromeRuntimeMock,
	chromeStorageMock,
	chromeTabsMock,
	chromeActionMock,
	resetChromeMocks,
	mockStorage
} from './setup';
import contextMenuOptions from '@src/ContextMenuOptions';
import { MessagingAction } from '@src/contentscript';
import { findClosestOption, formatBadgeText, type ContextMenuOption } from '@src/sw';

describe('Service Worker', () => {
	let onInstalledCallback: ((details: { reason: string }) => void) | undefined;
	let onClickedCallback:
		| ((itemData: { menuItemId: string; srcUrl: string }, tab: { id: number }) => Promise<void>)
		| undefined;
	let onUpdatedCallback: ((tabId: number, changeInfo: { status?: string }) => void) | undefined;
	let onMessageCallback:
		| ((
				request: { action: number; playbackRate?: number },
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
		beforeEach(() => {
			chromeStorageMock.local.get.mockResolvedValue({ contextMenuOptions });
		});

		it('registers onClicked listener', () => {
			expect(chromeContextMenusMock.onClicked.addListener).toHaveBeenCalled();
			expect(onClickedCallback).toBeDefined();
		});

		it('sends playback rate message on click', async () => {
			await onClickedCallback!({ menuItemId: '6', srcUrl: 'https://example.com/video.mp4' }, { id: 123 });

			expect(chromeTabsMock.sendMessage).toHaveBeenCalledWith(123, {
				action: MessagingAction.SETSPECIFIC,
				videoElementSrcAttributeValue: 'https://example.com/video.mp4',
				playbackRate: 2
			});
		});

		it('maps menu item ids to correct playback rates', async () => {
			const testCases = [
				{ menuItemId: '1', expectedRate: 0.25 },
				{ menuItemId: '3', expectedRate: 1 },
				{ menuItemId: '12', expectedRate: 4 }
			];

			for (const { menuItemId, expectedRate } of testCases) {
				chromeTabsMock.sendMessage.mockClear();
				await onClickedCallback!({ menuItemId, srcUrl: 'https://test.com/video.mp4' }, { id: 1 });

				expect(chromeTabsMock.sendMessage).toHaveBeenCalledWith(
					1,
					expect.objectContaining({ playbackRate: expectedRate })
				);
			}
		});

		it('ignores unknown menu item ids', async () => {
			await onClickedCallback!({ menuItemId: 'invalid', srcUrl: 'https://test.com/video.mp4' }, { id: 1 });

			expect(chromeTabsMock.sendMessage).not.toHaveBeenCalled();
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
				{ target: { tabId: 123 }, files: ['/js/contentscript.js'] },
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
			chromeTabsMock.query.mockImplementation(
				(_: unknown, callback: (tabs: Array<{ id: number }>) => void) => {
					callback([{ id: 1 }, { id: 2 }, { id: 3 }]);
				}
			);

			onStorageChangedCallback!({ badgeEnabled: { newValue: false, oldValue: true } }, 'sync');

			await new Promise((r) => setTimeout(r, 10));

			expect(chromeActionMock.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
			expect(chromeActionMock.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 2 });
			expect(chromeActionMock.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 3 });
		});

		it('does not clear badges when badgeEnabled changes to true', async () => {
			chromeTabsMock.query.mockImplementation(
				(_: unknown, callback: (tabs: Array<{ id: number }>) => void) => {
					callback([{ id: 1 }]);
				}
			);

			onStorageChangedCallback!({ badgeEnabled: { newValue: true, oldValue: false } }, 'sync');

			await new Promise((r) => setTimeout(r, 10));

			expect(chromeActionMock.setBadgeText).not.toHaveBeenCalled();
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

