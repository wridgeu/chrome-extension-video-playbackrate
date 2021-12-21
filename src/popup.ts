import { ChromeMessagingRequestAction, ChromeMessagingResponse, UI5Slider } from '../types';
import '@ui5/webcomponents/dist/Slider';

document.addEventListener('DOMContentLoaded', () => {
    (async (): Promise<void> => {
        const sliderComponent = <UI5Slider>document.getElementById('sliderWebComponent');
        const [{ id }] = await chrome.tabs.query({ active: true, currentWindow: true });

        chrome.tabs.sendMessage(
            <number>id,
            { action: ChromeMessagingRequestAction.RETRIEVE },
            (response: ChromeMessagingResponse) => {
                sliderComponent.value = response.playbackRate || 1;
            }
        );

        /**
         * Listen on change of UI5 Slider WebC
         */
        sliderComponent.addEventListener('change', async (e): Promise<void> => {
            const targetSpeed = <number>(e.target as UI5Slider).value;
            chrome.tabs.sendMessage(<number>id, {
                action: ChromeMessagingRequestAction.SET,
                playbackRate: targetSpeed
            });
        });
    })();
});
