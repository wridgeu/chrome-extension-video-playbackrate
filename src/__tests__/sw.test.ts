import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { chromeContextMenusMock, chromeRuntimeMock, chromeStorageMock, chromeTabsMock, resetChromeMocks } from './setup';
import contextMenuOptions from '../ContextMenuOptions';
import { MessagingAction } from '../contentscript';

describe('Service Worker', () => {
	// Store callbacks captured during module import
	let onInstalledCallback: ((details: { reason: string }) => void) | undefined;
	let onClickedCallback:
		| ((itemData: { menuItemId: string; srcUrl: string }, tab: { id: number }) => Promise<void>)
		| undefined;
	let onUpdatedCallback: ((tabId: number, changeInfo: { status?: string }) => void) | undefined;

	beforeAll(async () => {
		// Reset modules to ensure fresh import
		vi.resetModules();
		resetChromeMocks();

		// Import the service worker - this registers all listeners
		await import('../sw');

		// Capture the registered callbacks
		onInstalledCallback = chromeRuntimeMock.onInstalled.addListener.mock.calls[0]?.[0];
		onClickedCallback = chromeContextMenusMock.onClicked.addListener.mock.calls[0]?.[0];
		onUpdatedCallback = chromeTabsMock.onUpdated.addListener.mock.calls[0]?.[0];
	});

	beforeEach(() => {
		// Clear call counts but keep the callbacks
		chromeContextMenusMock.create.mockClear();
		chromeStorageMock.local.set.mockClear();
		chromeStorageMock.local.get.mockClear();
		chromeTabsMock.sendMessage.mockClear();
	});

	describe('onInstalled - Context Menu Creation', () => {
		it('should register onInstalled listener', () => {
			expect(chromeRuntimeMock.onInstalled.addListener).toHaveBeenCalled();
			expect(onInstalledCallback).toBeDefined();
		});

		it('should create context menu items for video elements only', () => {
			// Simulate extension installation
			onInstalledCallback!({ reason: 'install' });

			// Verify context menu items were created
			expect(chromeContextMenusMock.create).toHaveBeenCalledTimes(contextMenuOptions.length);

			// Verify each item is created with contexts: ['video']
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

		it('should create all 12 playback rate options', () => {
			onInstalledCallback!({ reason: 'install' });

			// Verify all 12 options are created
			expect(chromeContextMenusMock.create).toHaveBeenCalledTimes(12);

			// Verify the titles include the expected speed options
			const createCalls = chromeContextMenusMock.create.mock.calls;
			const titles = createCalls.map((call: [{ title: string }]) => call[0].title);

			expect(titles).toContain('Slo-mo (0.25x)');
			expect(titles).toContain('Normal');
			expect(titles).toContain('Ludicrous Speed (4x)');
		});

		it('should set Normal (1x) as the default checked option', () => {
			onInstalledCallback!({ reason: 'install' });

			const createCalls = chromeContextMenusMock.create.mock.calls;
			const checkedItems = createCalls.filter((call: [{ checked: boolean }]) => call[0].checked === true);

			// Only one item should be checked (Normal)
			expect(checkedItems.length).toBe(1);
			expect(checkedItems[0][0].title).toBe('Normal');
			expect(checkedItems[0][0].id).toBe('3');
		});

		it('should store context menu options in local storage', () => {
			onInstalledCallback!({ reason: 'install' });

			expect(chromeStorageMock.local.set).toHaveBeenCalledWith({
				contextMenuOptions: contextMenuOptions
			});
		});

		it('should create menu items with type radio for mutually exclusive selection', () => {
			onInstalledCallback!({ reason: 'install' });

			const createCalls = chromeContextMenusMock.create.mock.calls;

			// All items should be radio type
			createCalls.forEach((call: [{ type: string }]) => {
				expect(call[0].type).toBe('radio');
			});
		});
	});

	describe('onClicked - Context Menu Click Handler', () => {
		it('should register onClicked listener', () => {
			expect(chromeContextMenusMock.onClicked.addListener).toHaveBeenCalled();
			expect(onClickedCallback).toBeDefined();
		});

		it('should send correct message when context menu item is clicked', async () => {
			// Setup: Mock storage to return context menu options
			chromeStorageMock.local.get.mockResolvedValue({
				contextMenuOptions: contextMenuOptions
			});

			// Simulate clicking on "Ludicrous Speed (2x)" menu item
			const mockItemData = {
				menuItemId: '6', // ID for 2x speed
				srcUrl: 'https://example.com/video.mp4'
			};
			const mockTab = { id: 123 };

			await onClickedCallback!(mockItemData, mockTab);

			// Verify the correct message was sent to the tab
			expect(chromeTabsMock.sendMessage).toHaveBeenCalledWith(123, {
				action: MessagingAction.SETSPECIFIC,
				videoElementSrcAttributeValue: 'https://example.com/video.mp4',
				playbackRate: 2
			});
		});

		it('should send correct playback rate for each menu option', async () => {
			chromeStorageMock.local.get.mockResolvedValue({
				contextMenuOptions: contextMenuOptions
			});

			const mockTab = { id: 456 };

			// Test a few different options
			const testCases = [
				{ menuItemId: '1', expectedRate: 0.25 }, // Slo-mo
				{ menuItemId: '3', expectedRate: 1 }, // Normal
				{ menuItemId: '5', expectedRate: 1.5 }, // High Speed
				{ menuItemId: '12', expectedRate: 4 } // Max speed
			];

			for (const testCase of testCases) {
				chromeTabsMock.sendMessage.mockClear();

				await onClickedCallback!(
					{ menuItemId: testCase.menuItemId, srcUrl: 'https://test.com/video.mp4' },
					mockTab
				);

				expect(chromeTabsMock.sendMessage).toHaveBeenCalledWith(456, {
					action: MessagingAction.SETSPECIFIC,
					videoElementSrcAttributeValue: 'https://test.com/video.mp4',
					playbackRate: testCase.expectedRate
				});
			}
		});

		it('should not send message if menu item is not found', async () => {
			chromeStorageMock.local.get.mockResolvedValue({
				contextMenuOptions: contextMenuOptions
			});

			// Use an invalid menu item ID
			await onClickedCallback!({ menuItemId: 'invalid-id', srcUrl: 'https://test.com/video.mp4' }, { id: 789 });

			expect(chromeTabsMock.sendMessage).not.toHaveBeenCalled();
		});

		it('should pass the video src URL to the content script', async () => {
			chromeStorageMock.local.get.mockResolvedValue({
				contextMenuOptions: contextMenuOptions
			});

			const videoSrcUrl = 'https://cdn.example.com/videos/my-video.mp4';

			await onClickedCallback!({ menuItemId: '3', srcUrl: videoSrcUrl }, { id: 100 });

			expect(chromeTabsMock.sendMessage).toHaveBeenCalledWith(
				100,
				expect.objectContaining({
					videoElementSrcAttributeValue: videoSrcUrl
				})
			);
		});
	});

	describe('tabs.onUpdated - Content Script Injection', () => {
		it('should register onUpdated listener', () => {
			expect(chromeTabsMock.onUpdated.addListener).toHaveBeenCalled();
			expect(onUpdatedCallback).toBeDefined();
		});

		it('should inject content script when tab status is complete', () => {
			const mockScripting = vi.spyOn(chrome.scripting, 'executeScript');
			mockScripting.mockClear();

			onUpdatedCallback!(123, { status: 'complete' });

			expect(mockScripting).toHaveBeenCalledWith(
				{
					target: { tabId: 123 },
					files: ['/js/contentscript.js']
				},
				expect.any(Function)
			);
		});

		it('should not inject content script when status is loading', () => {
			const mockScripting = vi.spyOn(chrome.scripting, 'executeScript');
			mockScripting.mockClear();

			onUpdatedCallback!(123, { status: 'loading' });

			expect(mockScripting).not.toHaveBeenCalled();
		});

		it('should not inject content script when status is undefined', () => {
			const mockScripting = vi.spyOn(chrome.scripting, 'executeScript');
			mockScripting.mockClear();

			onUpdatedCallback!(123, {});

			expect(mockScripting).not.toHaveBeenCalled();
		});
	});
});
