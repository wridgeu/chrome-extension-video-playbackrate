import type Slider from '@ui5/webcomponents/dist/Slider.js';
import { MessagingAction, type MessagingRequestPayload, type RetrieveResponse } from './contentscript.js';
import { ThemeSwitcher } from './util/ThemeSwitcher.js';
import '@ui5/webcomponents/dist/Slider.js';

function positionTooltip(slider: Slider, tooltip: HTMLElement) {
	const value = slider.value;
	const min = Number(slider.min);
	const max = Number(slider.max);
	const percent = (value - min) / (max - min);

	tooltip.textContent = `${value}x`;

	const sliderRect = slider.getBoundingClientRect();
	const tooltipRect = tooltip.getBoundingClientRect();
	const handleX = sliderRect.left + percent * sliderRect.width;
	const tooltipHalfWidth = tooltipRect.width / 2;

	// Center tooltip above handle, but clamp to viewport edges
	let left = handleX - tooltipHalfWidth;
	const minLeft = 4;
	const maxLeft = window.innerWidth - tooltipRect.width - 4;
	left = Math.max(minLeft, Math.min(maxLeft, left));

	tooltip.style.left = `${left}px`;
	tooltip.style.top = `${sliderRect.top - tooltipRect.height - 8}px`;
}

const popup = async () => {
	await new ThemeSwitcher().init();
	const slider = <Slider>document.getElementById('slider');
	const tooltip = document.getElementById('tooltip') as HTMLElement;
	const [{ id: currentActiveTabId }] = await chrome.tabs.query({
		active: true,
		currentWindow: true
	});

	const { playbackRate } = (await (<Promise<RetrieveResponse>>chrome.tabs.sendMessage(
			<number>currentActiveTabId,
			<MessagingRequestPayload>{
				action: MessagingAction.RETRIEVE
			}
		))) || {};

	if (chrome.runtime.lastError || !playbackRate) {
		slider.value = 1;
	} else {
		slider.value = playbackRate;
	}

	// Show tooltip only during interaction
	const showTooltip = () => {
		tooltip.showPopover();
		positionTooltip(slider, tooltip);
	};

	const hideTooltip = () => {
		tooltip.hidePopover();
	};

	slider.addEventListener('mousedown', showTooltip);
	slider.addEventListener('touchstart', showTooltip);
	document.addEventListener('mouseup', hideTooltip);
	document.addEventListener('touchend', hideTooltip);

	// Update position while dragging
	slider.addEventListener('input', () => {
		if (tooltip.matches(':popover-open')) {
			positionTooltip(slider, tooltip);
		}
	});

	// Save on change (release)
	slider.addEventListener('change', async (event: Event): Promise<void> => {
		chrome.tabs.sendMessage(
			<number>currentActiveTabId,
			<MessagingRequestPayload>{
				action: MessagingAction.SET,
				playbackRate: <number>(event.target as Slider).value
			}
		);
	});
};

popup();
