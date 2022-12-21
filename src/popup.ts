import { ChromeMessagingRequestAction, ChromeMessagingResponse, IUI5Slider } from './types';
import '@ui5/webcomponents/dist/Slider';
import { ThemeSwitcher } from './util/ThemeSwitcher';

(async () => {
	await new ThemeSwitcher().init(); // Initialize
	const sliderComponent = <IUI5Slider>document.getElementById('sliderWebComponent');
	const [{ id }] = await chrome.tabs.query({ active: true, currentWindow: true });

	/**
	 * Initialize state
	 */
	chrome.tabs.sendMessage(
		<number>id,
		{ action: ChromeMessagingRequestAction.RETRIEVE },
		(response: ChromeMessagingResponse) => {
			if (!chrome.runtime.lastError && response) {
				sliderComponent.value = response.playbackRate;
			} else {
				sliderComponent.value = 1;
			}
		}
	);

	/**
	 * Listen on change of UI5 Slider WebC
	 */
	sliderComponent.addEventListener('change', async (e: Event): Promise<void> => {
		const targetSpeed = <number>(e.target as IUI5Slider).value;
		chrome.tabs.sendMessage(<number>id, {
			action: ChromeMessagingRequestAction.SET,
			playbackRate: targetSpeed
		});
	});
})();
