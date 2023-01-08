import { ChromeMessagingRequestAction } from './contentscript';
import { ThemeSwitcher } from './util/ThemeSwitcher';
import '@ui5/webcomponents/dist/Slider';

(async () => {
	await new ThemeSwitcher().init(); // Initialize/Set current theme
	const slider = <IUI5Slider>document.getElementById('slider');
	const [{ id: currentActiveTabId }] = await chrome.tabs.query({ active: true, currentWindow: true });

	// retrieve current video playbackrate && initialize slider state
	const { playbackRate } = await (<Promise<ChromeMessagingResponse>>(
		chrome.tabs.sendMessage(<number>currentActiveTabId, { action: ChromeMessagingRequestAction.RETRIEVE })
	));
	if (chrome.runtime.lastError || !playbackRate) {
		slider.value = 1;
	} else {
		slider.value = playbackRate;
	}

	// listen on changes of slider component
	slider.addEventListener('change', async (event: Event): Promise<void> => {
		chrome.tabs.sendMessage(<number>currentActiveTabId, {
			action: ChromeMessagingRequestAction.SET,
			playbackRate: <number>(event.target as IUI5Slider).value
		});
	});
})();
