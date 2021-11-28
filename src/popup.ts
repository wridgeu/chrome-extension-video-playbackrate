import "@ui5/webcomponents/dist/Slider";

let sliderComponent = (document.getElementById("sliderWebComponent") as HTMLElement);

/**
 * Listen on change of UI5 Slider WebC 
 */
 sliderComponent.addEventListener("change", async (e) => {
	let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	//TODO: exchange any with actual type
	let targetSpeed = (e.target! as any).value;

	chrome.storage.sync.set({ targetSpeed });

	chrome.scripting.executeScript({
	  target: { tabId: (tab.id as number) },
	  files: ['./js/playbackrate.js'] //always relative to the extensions root dir
	});

});