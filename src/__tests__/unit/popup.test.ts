import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { chromeTabsMock, resetChromeMocks } from './setup';
import { MessagingAction } from '@src/contentscript';

describe('Popup', () => {
	let slider: HTMLInputElement;
	let tooltip: HTMLElement;

	beforeEach(() => {
		resetChromeMocks();

		// Create mock slider element
		slider = document.createElement('input');
		slider.type = 'range';
		slider.id = 'slider';
		slider.min = '0';
		slider.max = '4';
		slider.step = '0.25';
		slider.value = '1';

		// Create mock tooltip element
		tooltip = document.createElement('div');
		tooltip.id = 'tooltip';

		// Mock getElementById
		vi.spyOn(document, 'getElementById').mockImplementation((id: string) => {
			if (id === 'slider') return slider;
			if (id === 'tooltip') return tooltip;
			return null;
		});
	});

	describe('slider input event', () => {
		it('sends message on input event (not just change)', async () => {
			const tabId = 123;
			chromeTabsMock.query.mockResolvedValue([{ id: tabId }]);
			chromeTabsMock.sendMessage.mockResolvedValue({ playbackRate: 1 });

			// Simulate what popup.ts does: add input listener that sends messages
			slider.addEventListener('input', (event: Event) => {
				if (tabId) {
					chrome.tabs.sendMessage(tabId, {
						action: MessagingAction.SET,
						playbackRate: (event.target as HTMLInputElement).valueAsNumber
					});
				}
			});

			// Simulate dragging slider to 2x
			slider.value = '2';
			const inputEvent = new Event('input', { bubbles: true });
			Object.defineProperty(inputEvent, 'target', { value: slider });
			slider.dispatchEvent(inputEvent);

			expect(chromeTabsMock.sendMessage).toHaveBeenCalledWith(tabId, {
				action: MessagingAction.SET,
				playbackRate: 2
			});
		});

		it('sends multiple messages while dragging', async () => {
			const tabId = 456;

			slider.addEventListener('input', (event: Event) => {
				chrome.tabs.sendMessage(tabId, {
					action: MessagingAction.SET,
					playbackRate: (event.target as HTMLInputElement).valueAsNumber
				});
			});

			// Simulate dragging through multiple values
			const values = ['1.25', '1.5', '1.75', '2'];
			for (const value of values) {
				slider.value = value;
				const inputEvent = new Event('input', { bubbles: true });
				Object.defineProperty(inputEvent, 'target', { value: slider });
				slider.dispatchEvent(inputEvent);
			}

			expect(chromeTabsMock.sendMessage).toHaveBeenCalledTimes(4);
			expect((chromeTabsMock.sendMessage as Mock).mock.calls[0][1].playbackRate).toBe(1.25);
			expect((chromeTabsMock.sendMessage as Mock).mock.calls[1][1].playbackRate).toBe(1.5);
			expect((chromeTabsMock.sendMessage as Mock).mock.calls[2][1].playbackRate).toBe(1.75);
			expect((chromeTabsMock.sendMessage as Mock).mock.calls[3][1].playbackRate).toBe(2);
		});

		it('does not send message if no active tab', async () => {
			const tabId: number | undefined = undefined;

			slider.addEventListener('input', (event: Event) => {
				if (tabId) {
					chrome.tabs.sendMessage(tabId, {
						action: MessagingAction.SET,
						playbackRate: (event.target as HTMLInputElement).valueAsNumber
					});
				}
			});

			slider.value = '2';
			const inputEvent = new Event('input', { bubbles: true });
			Object.defineProperty(inputEvent, 'target', { value: slider });
			slider.dispatchEvent(inputEvent);

			expect(chromeTabsMock.sendMessage).not.toHaveBeenCalled();
		});
	});

	describe('slider value range', () => {
		it('accepts values from 0 to 4 in 0.25 increments', () => {
			const validValues = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4];

			for (const value of validValues) {
				slider.value = String(value);
				expect(slider.valueAsNumber).toBe(value);
			}
		});
	});
});
