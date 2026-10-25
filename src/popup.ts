import type Slider from '@ui5/webcomponents/dist/Slider.js';
import '@ui5/webcomponents/dist/Slider.js';
import '@ui5/webcomponents/dist/Text.js';

import { ThemeSwitcher } from '@src/util/ThemeSwitcher';
import { MessagingAction } from '@src/types';
import { MAX_RATE, MIN_RATE, RATE_STEP, getPlaybackRateStorageKey } from '@src/util/playback';

/** Labelled positions on the slider scale */
const SLIDER_LABELS = [MIN_RATE, 1, 2, 3, MAX_RATE];

/**
 * Positions tooltip relative to slider handle.
 * Appears to the right when handle is on left half, and vice versa.
 */
function positionTooltip(slider: Slider, tooltip: HTMLElement): void {
	const percent = (slider.value - slider.min) / (slider.max - slider.min);

	tooltip.textContent = `${slider.value}×`;

	// Get the actual handle element from shadow DOM for precise positioning
	const handle = slider.shadowRoot?.querySelector<HTMLElement>('[part="handle"]');
	if (!handle) return;

	// Reading the rect forces layout, so it reflects the new text content
	const tooltipRect = tooltip.getBoundingClientRect();
	const handleRect = handle.getBoundingClientRect();

	// Vertically center with handle
	tooltip.style.top = `${handleRect.top + handleRect.height / 2 - tooltipRect.height / 2}px`;

	const gap = 4;
	tooltip.style.left =
		percent <= 0.5 ? `${handleRect.right + gap}px` : `${handleRect.left - tooltipRect.width - gap}px`;
}

/** Show the rate tooltip while the slider is being dragged. */
function setupTooltip(slider: Slider, tooltip: HTMLElement): void {
	const showTooltip = () => {
		tooltip.showPopover();
		positionTooltip(slider, tooltip);
	};
	const hideTooltip = () => tooltip.hidePopover();

	slider.addEventListener('mousedown', showTooltip);
	slider.addEventListener('touchstart', showTooltip);
	document.addEventListener('mouseup', hideTooltip);
	document.addEventListener('touchend', hideTooltip);
	slider.addEventListener('input', () => {
		if (tooltip.matches(':popover-open')) {
			positionTooltip(slider, tooltip);
		}
	});
}

/** Playback rate of the first video in any frame of the tab (including iframes), or null if there is none. */
async function getTabPlaybackRate(tabId: number): Promise<number | null> {
	try {
		const results = await chrome.scripting.executeScript({
			target: { tabId, allFrames: true },
			func: () => document.querySelector('video')?.playbackRate ?? null
		});
		const rate = results.find((frame) => typeof frame.result === 'number')?.result;
		return rate ?? null;
	} catch {
		// Scripting not available on this tab (e.g., chrome:// pages)
		return null;
	}
}

/** Set the rate on all videos of the tab, in all frames. */
function setTabPlaybackRate(tabId: number, playbackRate: number): void {
	chrome.scripting.executeScript({
		target: { tabId, allFrames: true },
		func: (rate: number) => {
			document.querySelectorAll('video').forEach((video) => {
				video.playbackRate = rate;
			});
		},
		args: [playbackRate]
	});
}

/** Ask the service worker to sync badge, context menu and stored rate for the tab. */
function sendUiUpdate(playbackRate: number, tabId: number): void {
	chrome.runtime.sendMessage({ action: MessagingAction.UPDATE_UI, playbackRate, tabId });
}

/** Initialize popup UI, sync slider with current video playback rate, and set up event handlers. */
export async function initPopup(): Promise<void> {
	await new ThemeSwitcher().init();
	const slider = document.querySelector<Slider>('#slider');
	const tooltip = document.querySelector<HTMLElement>('#tooltip');
	const noVideosEl = document.querySelector<HTMLElement>('#no-videos');
	const sliderContainer = document.querySelector<HTMLElement>('#slider-container');
	if (!slider || !tooltip || !noVideosEl || !sliderContainer) return;
	Object.assign(slider, {
		min: MIN_RATE,
		max: MAX_RATE,
		step: RATE_STEP,
		tickmarks: SLIDER_LABELS.map((value) => ({ value, label: `${value}×` }))
	});

	const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
	const tabId = activeTab?.id;
	const playbackRate = tabId === undefined ? null : await getTabPlaybackRate(tabId);

	noVideosEl.hidden = playbackRate !== null;
	sliderContainer.hidden = playbackRate === null;
	if (tabId === undefined || playbackRate === null) return;

	slider.value = playbackRate;
	// Ensure UI shows correct rate when popup opens (fixes any stale badge/context menu values)
	sendUiUpdate(playbackRate, tabId);
	setupTooltip(slider, tooltip);

	// 'change' event only fires when user finishes interacting (not on programmatic changes)
	slider.addEventListener('change', () => {
		setTabPlaybackRate(tabId, slider.value);
		sendUiUpdate(slider.value, tabId);
	});

	// Sync slider when video rate changes via native controls or context menu
	const storageKey = getPlaybackRateStorageKey(tabId);
	chrome.storage.local.onChanged.addListener((changes) => {
		const newRate = changes[storageKey]?.newValue;
		if (typeof newRate === 'number') slider.value = newRate;
	});
}

if (import.meta.env.MODE !== 'test') {
	await initPopup();
}
