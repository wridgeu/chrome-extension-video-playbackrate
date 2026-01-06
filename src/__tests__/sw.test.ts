import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
	chromeContextMenusMock,
	chromeRuntimeMock,
	chromeStorageMock,
	chromeTabsMock,
	resetChromeMocks
} from './setup';
import contextMenuOptions from '../ContextMenuOptions';
import { MessagingAction } from '../contentscript';

describe('Service Worker', () => {
	let onInstalledCallback: ((details: { reason: string }) => void) | undefined;
	let onClickedCallback:
		| ((itemData: { menuItemId: string; srcUrl: string }, tab: { id: number }) => Promise<void>)
		| undefined;
	let onUpdatedCallback: ((tabId: number, changeInfo: { status?: string }) => void) | undefined;

	beforeAll(async () => {
		vi.resetModules();
		resetChromeMocks();
		await import('../sw');

		onInstalledCallback = chromeRuntimeMock.onInstalled.addListener.mock.calls[0]?.[0];
		onClickedCallback = chromeContextMenusMock.onClicked.addListener.mock.calls[0]?.[0];
		onUpdatedCallback = chromeTabsMock.onUpdated.addListener.mock.calls[0]?.[0];
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

			const createCalls = chromeContextMenusMock.create.mock.calls as Array<[{ checked: boolean; title: string }]>;
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
});
