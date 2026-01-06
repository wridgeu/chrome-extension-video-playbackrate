import type Slider from '@ui5/webcomponents/dist/Slider.js';
import { MessagingAction, type MessagingRequestPayload, type RetrieveResponse } from './contentscript.js';
import { ThemeSwitcher } from './util/ThemeSwitcher.js';
import '@ui5/webcomponents/dist/Slider.js';

function updateTooltip(slider: Slider, tooltip: HTMLElement) {
	const value = slider.value;
	const min = Number(slider.min);
	const max = Number(slider.max);
	const percent = (value - min) / (max - min);

	tooltip.textContent = `${value}x`;

	// Position tooltip based on handle position
	const sliderRect = slider.getBoundingClientRect();
	const handleX = percent * sliderRect.width;

	if (percent <= 0.5) {
		// Handle in left half - tooltip to the right
		tooltip.style.left = `${handleX}px`;
		tooltip.style.transform = 'translateX(0)';
		tooltip.className = 'tooltip left';
	} else {
		// Handle in right half - tooltip to the left
		tooltip.style.left = `${handleX}px`;
		tooltip.style.transform = 'translateX(-100%)';
		tooltip.className = 'tooltip right';
	}
}

const popup = async () => {
	await new ThemeSwitcher().init();
	const slider = <Slider>document.getElementById('slider');
	const tooltip = document.getElementById('tooltip')!;
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

	// Initial tooltip position
	updateTooltip(slider, tooltip);

	// Update tooltip on input (while dragging) and change (on release)
	slider.addEventListener('input', () => updateTooltip(slider, tooltip));
	slider.addEventListener('change', async (event: Event): Promise<void> => {
		updateTooltip(slider, tooltip);
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
