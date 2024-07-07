import type Slider from "@ui5/webcomponents/dist/Slider.js";
import {
	MessagingAction,
	type MessagingRequestPayload,
	type RetrieveResponse,
} from "./contentscript.js";
import { ThemeSwitcher } from "./util/ThemeSwitcher.js";
import "@ui5/webcomponents/dist/Slider.js";

const popup = async () => {
	await new ThemeSwitcher().init(); // Initialize/Set current theme
	const slider = <Slider>document.getElementById("slider");
	const [{ id: currentActiveTabId }] = await chrome.tabs.query({
		active: true,
		currentWindow: true,
	});

	// retrieve current video playbackrate && initialize slider state
	const { playbackRate } =
		(await (<Promise<RetrieveResponse>>chrome.tabs.sendMessage(
			<number>currentActiveTabId,
			<MessagingRequestPayload>{
				action: MessagingAction.RETRIEVE,
			},
		))) || {};

	if (chrome.runtime.lastError || !playbackRate) {
		slider.value = 1;
	} else {
		slider.value = playbackRate;
	}

	// listen on changes of slider component
	slider.addEventListener("change", async (event: Event): Promise<void> => {
		chrome.tabs.sendMessage(
			<number>currentActiveTabId,
			<MessagingRequestPayload>{
				action: MessagingAction.SET,
				playbackRate: <number>(event.target as Slider).value,
			},
		);
	});
};

popup();
