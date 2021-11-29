import "@ui5/webcomponents/dist/Slider";
import {retrieveVideoElements, adjustPlaybackrate} from "./actions/actions";
import { VideoElementIdentifier } from "../types";

/**
 * Retrieve video elements from current page/tab
 */
const initializeExtension = async () => {

	let sliderComponent = (document.getElementById("sliderWebComponent") as HTMLElement);
	let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	
	let retrievedResults = await chrome.scripting.executeScript({
		target: { tabId: (tab.id as number) },
		func: retrieveVideoElements
	})
	
	/**
	 * TODO:
	 * Build list based on amount of entries/video tags found
	 * hand the number over to the playbackrate script
	 */
	let videoElementsOnPage = (retrievedResults[0].result as VideoElementIdentifier[])
	// If user has element selected, use this one instead, default to the first one:
	let targetVideoElement = (videoElementsOnPage[0] as VideoElementIdentifier)
	
	
	/**
	 * Listen on change of UI5 Slider WebC 
	 */
	sliderComponent.addEventListener("change", async (e) => {
		let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		let targetSpeed = ((e.target! as any).value as number);

		chrome.scripting.executeScript({
			target: { tabId: (tab.id as number) },
			func: adjustPlaybackrate,
			args: [targetSpeed, targetVideoElement]
		});
	});

} 

initializeExtension()
