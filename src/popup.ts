import "@ui5/webcomponents/dist/Slider";
import {retrieveVideoElements, adjustPlaybackrate} from "./actions/actions";
import { VideoElementIdentifier, UI5Slider } from "../types";

/**
 * Retrieve video elements from current page/tab
 */
const initializeExtension = async (): Promise<void> => {
	
	let sliderComponent = (document.getElementById("sliderWebComponent") as UI5Slider)
	let [ tab ] = await chrome.tabs.query({ active: true, currentWindow: true })

	let [ retrievedResults ] = await chrome.scripting.executeScript({
		target: { tabId: (tab.id as number) },
		func: retrieveVideoElements
	})
	
	initializeSliderComponent(sliderComponent)
	
	/**
	 * TODO:
	 * Build list based on amount of entries/video tags found
	 * hand the number over to the playbackrate script
	 */
	let videoElementsOnPage = (retrievedResults.result as VideoElementIdentifier[])
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

const initializeSliderComponent = async (sliderComponent: UI5Slider): Promise<void> => {
	let { latestSpeedAdjustment } = await chrome.storage.sync.get("latestSpeedAdjustment")
	
	if (latestSpeedAdjustment) {
		sliderComponent.value = latestSpeedAdjustment 
	}
}


initializeExtension()
