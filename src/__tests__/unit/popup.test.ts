import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callsOf, chromeMock } from '@tests/unit/setup';
import { initPopup } from '@src/popup';
import { MessagingAction } from '@src/types';
import type Slider from '@ui5/webcomponents/dist/Slider.js';

vi.mock('@src/util/ThemeSwitcher.js', () => ({
	ThemeSwitcher: class {
		init() {
			return Promise.resolve(this);
		}
	}
}));

const TAB_ID = 123;

/** Stand-in for ui5-slider: a real element with the Slider properties the popup uses and a shadow handle. */
function createSlider(): Slider {
	const slider = document.createElement('div') as unknown as Slider;
	Object.assign(slider, { value: 1, min: 0, max: 4 });
	const handle = document.createElement('div');
	slider.attachShadow({ mode: 'open' }).append(handle);
	handle.setAttribute('part', 'handle');
	handle.getBoundingClientRect = () => ({ top: 10, left: 50, right: 100, height: 20 }) as DOMRect;
	return slider;
}

/** Make the active tab report the given rate for its first video (null = no videos). */
function mockTabVideoRate(rate: number | null) {
	chromeMock.tabs.query.mockResolvedValue([{ id: TAB_ID }]);
	chromeMock.scripting.executeScript.mockResolvedValue([{ result: null }, { result: rate }]);
}

describe('Popup', () => {
	let slider: Slider;
	let tooltip: HTMLElement;
	let noVideosEl: HTMLElement;
	let sliderContainer: HTMLElement;

	beforeEach(() => {
		document.body.innerHTML = `
			<span id="no-videos" hidden></span>
			<div id="slider-container" hidden><div id="tooltip"></div></div>`;
		noVideosEl = document.querySelector('#no-videos')!;
		sliderContainer = document.querySelector('#slider-container')!;
		tooltip = document.querySelector('#tooltip')!;
		tooltip.showPopover = vi.fn<() => void>();
		tooltip.hidePopover = vi.fn<() => void>();
		tooltip.getBoundingClientRect = () => ({ width: 40, height: 20 }) as DOMRect;
		slider = createSlider();
		slider.id = 'slider';
		sliderContainer.prepend(slider);
	});

	describe('initialization', () => {
		it('shows the no-videos message when no frame has a video', async () => {
			mockTabVideoRate(null);

			await initPopup();

			expect(noVideosEl.hidden).toBe(false);
			expect(sliderContainer.hidden).toBe(true);
			expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
		});

		it('shows the no-videos message when scripting is not allowed on the tab', async () => {
			chromeMock.scripting.executeScript.mockRejectedValue(new Error('Cannot access a chrome:// URL'));

			await initPopup();

			expect(noVideosEl.hidden).toBe(false);
			expect(sliderContainer.hidden).toBe(true);
		});

		it('shows the slider at the rate of the first frame with a video and re-syncs the badge', async () => {
			mockTabVideoRate(2);

			await initPopup();

			expect(noVideosEl.hidden).toBe(true);
			expect(sliderContainer.hidden).toBe(false);
			expect(slider.value).toBe(2);
			expect(slider).toMatchObject({ min: 0.25, max: 4, step: 0.25 });
			expect(slider.tickmarks.map((tick) => tick.label)).toEqual(['0.25×', '1×', '2×', '3×', '4×']);
			expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
				action: MessagingAction.UPDATE_UI,
				playbackRate: 2,
				tabId: TAB_ID
			});
		});

		it('reads the first video of each frame of the active tab', async () => {
			mockTabVideoRate(1);

			await initPopup();

			expect(chromeMock.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
			const [injection] = callsOf<[{ func: () => unknown }]>(chromeMock.scripting.executeScript)[0]!;
			document.body.innerHTML = '<video></video><video></video>';
			document.querySelector('video')!.playbackRate = 1.5;
			expect(injection.func()).toBe(1.5);
		});
	});

	describe('slider change', () => {
		it('sets the rate on all videos in all frames and syncs the badge', async () => {
			mockTabVideoRate(1);
			await initPopup();
			chromeMock.runtime.sendMessage.mockClear();

			slider.value = 2.5;
			slider.dispatchEvent(new Event('change'));

			const [injection] = callsOf<[{ target: unknown; func: (rate: number) => void; args: number[] }]>(
				chromeMock.scripting.executeScript
			)[1]!;
			expect(injection.target).toEqual({ tabId: TAB_ID, allFrames: true });
			expect(injection.args).toEqual([2.5]);
			document.body.innerHTML = '<video></video><video></video>';
			injection.func(2.5);
			expect(Array.from(document.querySelectorAll('video'), (v) => v.playbackRate)).toEqual([2.5, 2.5]);

			expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
				action: MessagingAction.UPDATE_UI,
				playbackRate: 2.5,
				tabId: TAB_ID
			});
		});
	});

	describe('tooltip', () => {
		beforeEach(async () => {
			mockTabVideoRate(1);
			await initPopup();
		});

		it('opens on mousedown, shows the rate right of the handle on the left half, and closes on mouseup', () => {
			slider.value = 0.5;
			slider.dispatchEvent(new Event('mousedown'));

			expect(tooltip.showPopover).toHaveBeenCalled();
			expect(tooltip.textContent).toBe('0.5×');
			expect(tooltip.style.left).toBe('104px');
			expect(tooltip.style.top).toBe('10px');

			document.dispatchEvent(new Event('mouseup'));
			expect(tooltip.hidePopover).toHaveBeenCalled();
		});

		it('sits left of the handle on the right half', () => {
			slider.value = 3;
			slider.dispatchEvent(new Event('touchstart'));

			expect(tooltip.style.left).toBe('6px');
		});

		it('follows the value while dragging only when open', () => {
			const isOpen = vi.spyOn(tooltip, 'matches').mockReturnValue(false);
			slider.value = 2;
			slider.dispatchEvent(new Event('input'));
			expect(tooltip.textContent).toBe('');

			isOpen.mockReturnValue(true);
			slider.dispatchEvent(new Event('input'));
			expect(tooltip.textContent).toBe('2×');
		});
	});

	describe('storage sync', () => {
		it('moves the slider when the stored rate of this tab changes', async () => {
			mockTabVideoRate(1);
			await initPopup();
			const [listener] = callsOf<[(changes: Record<string, chrome.storage.StorageChange>) => void]>(
				chromeMock.storage.local.onChanged.addListener
			)[0]!;

			listener({ playbackRate_999: { newValue: 4 } });
			expect(slider.value).toBe(1);

			listener({ [`playbackRate_${TAB_ID}`]: { newValue: 3 } });
			expect(slider.value).toBe(3);
		});
	});
});
