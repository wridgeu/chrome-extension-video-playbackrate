import type Slider from '@ui5/webcomponents/dist/Slider.js';
import { MessagingAction, type MessagingRequestPayload, type RetrieveResponse } from './contentscript.js';
import { ThemeSwitcher } from './util/ThemeSwitcher.js';
import '@ui5/webcomponents/dist/Slider.js';

/**
 * Positions tooltip relative to slider handle.
 * Appears to the right when handle is on left half, and vice versa.
 */
function positionTooltip(slider: Slider, tooltip: HTMLElement) {
	const value = slider.value;
	const min = Number(slider.min);
	const max = Number(slider.max);
	const percent = (value - min) / (max - min);

	tooltip.textContent = `${value}x`;

	// Force reflow to ensure dimensions are computed after content change
	void tooltip.offsetWidth;

	const tooltipRect = tooltip.getBoundingClientRect();

	// Get the actual handle element from shadow DOM for precise positioning
	const handle = slider.shadowRoot?.querySelector('.ui5-slider-handle') as HTMLElement | null;
	if (!handle) return;

	const handleRect = handle.getBoundingClientRect();

	// Vertically center with handle
	const handleCenterY = handleRect.top + handleRect.height / 2;
	tooltip.style.top = `${handleCenterY - tooltipRect.height / 2}px`;

	// Position left or right of handle with gap
	const gap = 4;
	if (percent <= 0.5) {
		// Handle on left half - tooltip to the right
		tooltip.style.left = `${handleRect.right + gap}px`;
	} else {
		// Handle on right half - tooltip to the left
		tooltip.style.left = `${handleRect.left - tooltipRect.width - gap}px`;
	}
}

/** Initialize popup UI, sync slider with current video playback rate, and set up event handlers. */
const popup = async () => {
	await new ThemeSwitcher().init();
	const slider = <Slider>document.getElementById('slider');
	const tooltip = document.getElementById('tooltip') as HTMLElement;
	const [{ id: currentActiveTabId }] = await chrome.tabs.query({
		active: true,
		currentWindow: true
	});

	let playbackRate: number | undefined;
	try {
		if (currentActiveTabId) {
			const response = await chrome.tabs.sendMessage(currentActiveTabId, <MessagingRequestPayload>{
				action: MessagingAction.RETRIEVE
			});
			playbackRate = (response as RetrieveResponse)?.playbackRate;
		}
	} catch {
		// Content script not available or tab doesn't support messaging
		playbackRate = undefined;
	}

	slider.value = playbackRate ?? 1;

	/** Shows the tooltip and positions it relative to the slider handle */
	const showTooltip = () => {
		tooltip.showPopover();
		positionTooltip(slider, tooltip);
	};

	/** Hides the tooltip popover */
	const hideTooltip = () => {
		tooltip.hidePopover();
	};

	slider.addEventListener('mousedown', showTooltip);
	slider.addEventListener('touchstart', showTooltip);
	document.addEventListener('mouseup', hideTooltip);
	document.addEventListener('touchend', hideTooltip);

	slider.addEventListener('input', (event: Event) => {
		if (tooltip.matches(':popover-open')) {
			positionTooltip(slider, tooltip);
		}

		if (currentActiveTabId) {
			chrome.tabs.sendMessage(currentActiveTabId, <MessagingRequestPayload>{
				action: MessagingAction.SET,
				playbackRate: (event.target as Slider).value
			});
		}
	});

	// Sync slider when video rate changes via native controls or context menu
	if (currentActiveTabId) {
		const storageKey = `playbackRate_${currentActiveTabId}`;
		chrome.storage.local.onChanged.addListener((changes) => {
			const newRate = changes[storageKey]?.newValue as number | undefined;
			if (newRate !== undefined) {
				slider.value = newRate;
			}
		});
	}
};

popup();
