import type Slider from '@ui5/webcomponents/dist/Slider.js';
import '@ui5/webcomponents/dist/Slider.js';
import '@ui5/webcomponents/dist/Text.js';

import { ThemeSwitcher } from './util/ThemeSwitcher.js';
import { MessagingAction } from './types.js';

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

/** Shows or hides elements based on whether videos are present on the page. */
function updateVisibility(hasVideos: boolean, noVideosEl: HTMLElement | null, sliderContainer: HTMLElement | null) {
	if (noVideosEl) noVideosEl.hidden = hasVideos;
	if (sliderContainer) sliderContainer.hidden = !hasVideos;
}

/** Initialize popup UI, sync slider with current video playback rate, and set up event handlers. */
export async function initPopup() {
	await new ThemeSwitcher().init();
	const slider = document.getElementById('slider') as Slider | null;
	const tooltip = document.getElementById('tooltip');
	const noVideosEl = document.getElementById('no-videos');
	const sliderContainer = document.getElementById('slider-container');

	// Early return if required elements don't exist
	if (!slider || !tooltip || !noVideosEl || !sliderContainer) {
		return;
	}
	const [{ id: currentActiveTabId }] = await chrome.tabs.query({
		active: true,
		currentWindow: true
	});

	let playbackRate: number | undefined;
	let hasVideos = false;
	try {
		if (currentActiveTabId) {
			// Use executeScript to query videos across all frames (including iframes)
			const results = await chrome.scripting.executeScript({
				target: { tabId: currentActiveTabId, allFrames: true },
				func: () => {
					const videos = document.querySelectorAll('video');
					if (videos.length === 0) return null;
					return { playbackRate: videos[0].playbackRate, videoCount: videos.length };
				}
			});

			// Aggregate results from all frames - find first frame with videos
			for (const result of results) {
				if (result.result && result.result.videoCount > 0) {
					playbackRate = result.result.playbackRate;
					hasVideos = true;
					break;
				}
			}
		}
	} catch {
		// Scripting not available on this tab (e.g., chrome:// pages)
		playbackRate = undefined;
		hasVideos = false;
	}

	updateVisibility(hasVideos, noVideosEl, sliderContainer);
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
			const newRate = (event.target as Slider).value;
			chrome.scripting.executeScript({
				target: { tabId: currentActiveTabId, allFrames: true },
				func: (rate: number) => {
					document.querySelectorAll('video').forEach((v) => {
						v.playbackRate = rate;
					});
				},
				args: [newRate]
			});
			// Update badge and context menu directly since executeScript runs in different world
			chrome.runtime.sendMessage({
				action: MessagingAction.UPDATE_BADGE,
				playbackRate: newRate,
				tabId: currentActiveTabId
			});
			chrome.runtime.sendMessage({ action: MessagingAction.UPDATE_CONTEXT_MENU, playbackRate: newRate });
			// Store rate for popup sync
			chrome.storage.local.set({ [`playbackRate_${currentActiveTabId}`]: newRate });
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
}

// Auto-initialize when DOM is ready (not in test environment)
if (
	typeof document !== 'undefined' &&
	typeof import.meta !== 'undefined' &&
	// @ts-expect-error - import.meta.vitest is added by vitest
	!import.meta.vitest
) {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initPopup);
	} else {
		// DOM already ready, execute immediately
		initPopup();
	}
}
