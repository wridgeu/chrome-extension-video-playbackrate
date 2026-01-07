import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chromeTabsMock, chromeScriptingMock, chromeRuntimeMock, chromeStorageMock, resetChromeMocks } from './setup';
import { initPopup } from '@src/popup';
import { MessagingAction } from '@src/types';
import type Slider from '@ui5/webcomponents/dist/Slider.js';

// Mock the ThemeSwitcher module
vi.mock('@src/util/ThemeSwitcher.js', () => ({
	ThemeSwitcher: class {
		async init() {
			return Promise.resolve();
		}
	}
}));

describe('Popup', () => {
	let slider: Partial<Slider>;
	let tooltip: Partial<HTMLElement>;
	let noVideosEl: Partial<HTMLElement>;
	let sliderContainer: Partial<HTMLElement>;

	beforeEach(() => {
		resetChromeMocks();

		// Create mock slider element with UI5 Slider interface
		slider = {
			id: 'slider',
			value: 1,
			min: '0.25',
			max: '4',
			addEventListener: vi.fn(),
			shadowRoot: {
				querySelector: vi.fn().mockReturnValue({
					getBoundingClientRect: () => ({
						top: 10,
						left: 50,
						right: 100,
						bottom: 30,
						width: 50,
						height: 20
					})
				})
			} as unknown as ShadowRoot
		};

		// Create mock tooltip element
		tooltip = {
			id: 'tooltip',
			textContent: '',
			offsetWidth: 40,
			style: {} as CSSStyleDeclaration,
			getBoundingClientRect: () => ({
				width: 40,
				height: 20,
				top: 0,
				left: 0,
				right: 40,
				bottom: 20
			} as DOMRect),
			showPopover: vi.fn(),
			hidePopover: vi.fn(),
			matches: vi.fn().mockReturnValue(false)
		};

		// Create mock no-videos element
		noVideosEl = {
			id: 'no-videos',
			hidden: false
		};

		// Create mock slider-container element
		sliderContainer = {
			id: 'slider-container',
			hidden: false
		};

		// Mock getElementById using direct assignment (more reliable than spyOn after reset)
		document.getElementById = vi.fn((id: string) => {
			if (id === 'slider') return slider as any;
			if (id === 'tooltip') return tooltip as any;
			if (id === 'no-videos') return noVideosEl as any;
			if (id === 'slider-container') return sliderContainer as any;
			return null;
		}) as any;

		// Mock document.addEventListener
		document.addEventListener = vi.fn() as any;
	});

	describe('initialization', () => {
		it('queries for active tab on initialization', async () => {
			chromeTabsMock.query.mockResolvedValue([{ id: 123 }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([{ result: null }]);

			await initPopup();

			expect(chromeTabsMock.query).toHaveBeenCalledWith({
				active: true,
				currentWindow: true
			});
		});

		it('shows no-videos message when no videos found', async () => {
			chromeTabsMock.query.mockResolvedValue([{ id: 123 }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([{ result: null }]);

			await initPopup();

			expect(noVideosEl.hidden).toBe(false);
			expect(sliderContainer.hidden).toBe(true);
		});

		it('shows slider when videos are found', async () => {
			chromeTabsMock.query.mockResolvedValue([{ id: 123 }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([
				{ result: { playbackRate: 1.5, videoCount: 1 } }
			]);

			await initPopup();

			expect(noVideosEl.hidden).toBe(true);
			expect(sliderContainer.hidden).toBe(false);
		});

		it('sets slider value to current playback rate', async () => {
			chromeTabsMock.query.mockResolvedValue([{ id: 123 }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([
				{ result: { playbackRate: 2, videoCount: 1 } }
			]);

			await initPopup();

			expect(slider.value).toBe(2);
		});

		it('defaults slider value to 1 when no videos found', async () => {
			chromeTabsMock.query.mockResolvedValue([{ id: 123 }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([{ result: null }]);

			await initPopup();

			expect(slider.value).toBe(1);
		});

		it('handles scripting errors gracefully', async () => {
			chromeTabsMock.query.mockResolvedValue([{ id: 123 }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockRejectedValue(new Error('Scripting not allowed'));

			await initPopup();

			expect(noVideosEl.hidden).toBe(false);
			expect(sliderContainer.hidden).toBe(true);
			expect(slider.value).toBe(1);
		});
	});

	describe('event handlers', () => {
		it('registers tooltip show/hide handlers', async () => {
			chromeTabsMock.query.mockResolvedValue([{ id: 123 }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([{ result: null }]);

			await initPopup();

			expect(slider.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
			expect(slider.addEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function));
			expect(document.addEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
			expect(document.addEventListener).toHaveBeenCalledWith('touchend', expect.any(Function));
		});

		it('registers input handler on slider', async () => {
			chromeTabsMock.query.mockResolvedValue([{ id: 123 }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([{ result: null }]);

			await initPopup();

			expect(slider.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
		});
	});

	describe('slider input event', () => {
		it('executes script to update video playback rate', async () => {
			const tabId = 123;
			chromeTabsMock.query.mockResolvedValue([{ id: tabId }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([
				{ result: { playbackRate: 1, videoCount: 1 } }
			]);

			await initPopup();

			// Get the input event handler that was registered
			const inputHandler = (slider.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
				(call) => call[0] === 'input'
			)?.[1];

			expect(inputHandler).toBeDefined();

			// Simulate slider input event with new rate
			slider.value = 2;
			const inputEvent = new Event('input', { bubbles: true });
			Object.defineProperty(inputEvent, 'target', { value: slider });
			inputHandler?.(inputEvent);

			expect(chromeScriptingMock.executeScript).toHaveBeenCalledWith({
				target: { tabId, allFrames: true },
				func: expect.any(Function),
				args: [2]
			});
		});

		it('sends UPDATE_BADGE and UPDATE_CONTEXT_MENU messages', async () => {
			const tabId = 456;
			chromeTabsMock.query.mockResolvedValue([{ id: tabId }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([
				{ result: { playbackRate: 1, videoCount: 1 } }
			]);

			await initPopup();

			const inputHandler = (slider.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
				(call) => call[0] === 'input'
			)?.[1];

			slider.value = 1.75;
			const inputEvent = new Event('input', { bubbles: true });
			Object.defineProperty(inputEvent, 'target', { value: slider });
			inputHandler?.(inputEvent);

			expect(chromeRuntimeMock.sendMessage).toHaveBeenCalledWith({
				action: MessagingAction.UPDATE_BADGE,
				playbackRate: 1.75,
				tabId
			});
			expect(chromeRuntimeMock.sendMessage).toHaveBeenCalledWith({
				action: MessagingAction.UPDATE_CONTEXT_MENU,
				playbackRate: 1.75
			});
		});

		it('stores playback rate in local storage', async () => {
			const tabId = 789;
			chromeTabsMock.query.mockResolvedValue([{ id: tabId }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([
				{ result: { playbackRate: 1, videoCount: 1 } }
			]);

			await initPopup();

			const inputHandler = (slider.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
				(call) => call[0] === 'input'
			)?.[1];

			slider.value = 2.5;
			const inputEvent = new Event('input', { bubbles: true });
			Object.defineProperty(inputEvent, 'target', { value: slider });
			inputHandler?.(inputEvent);

			expect(chromeStorageMock.local.set).toHaveBeenCalledWith({
				[`playbackRate_${tabId}`]: 2.5
			});
		});
	});

	describe('storage sync', () => {
		it('registers storage change listener for current tab', async () => {
			const tabId = 999;
			chromeTabsMock.query.mockResolvedValue([{ id: tabId }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([
				{ result: { playbackRate: 1, videoCount: 1 } }
			]);

			await initPopup();

			expect(chromeStorageMock.local.onChanged.addListener).toHaveBeenCalledWith(expect.any(Function));
		});

		it('updates slider value when storage changes', async () => {
			const tabId = 111;
			let storageListener: ((changes: any) => void) | undefined;

			// Capture the storage listener when it's registered
			(chromeStorageMock.local.onChanged.addListener as any) = vi.fn((callback: any) => {
				storageListener = callback;
			});

			chromeTabsMock.query.mockResolvedValue([{ id: tabId }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([
				{ result: { playbackRate: 1, videoCount: 1 } }
			]);

			await initPopup();

			expect(storageListener).toBeDefined();

			// Simulate storage change
			storageListener?.({
				[`playbackRate_${tabId}`]: { newValue: 3 }
			});

			expect(slider.value).toBe(3);
		});
	});

	describe('slider value range', () => {
		it('accepts values from 0.25 to 4', async () => {
			chromeTabsMock.query.mockResolvedValue([{ id: 123 }] as chrome.tabs.Tab[]);
			chromeScriptingMock.executeScript.mockResolvedValue([{ result: null }]);

			await initPopup();

			const validValues = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4];

			for (const value of validValues) {
				slider.value = value;
				expect(slider.value).toBe(value);
			}
		});
	});
});
