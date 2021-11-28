import "@ui5/webcomponents/dist/Slider";

let sliderComponent = (document.getElementById("sliderWebComponent") as HTMLElement);

/**
 * Listen on change of UI5 Slider WebC 
 */
sliderComponent.addEventListener("change", async (e) => {
	let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	let targetSpeed = (e.target! as any).value;
	chrome.scripting.executeScript({
	  target: { tabId: (tab.id as number) },
	  func: setVideoPlayerSpeed,
	  args: [targetSpeed]
	});
});
  
/**
 * TODO: maybe extract into file
 * @param targetSpeed 
 */
function setVideoPlayerSpeed(targetSpeed: number): void {
	let firstVideoElementOfPage = (document.getElementsByTagName("video")[0] as HTMLVideoElement);
	if(firstVideoElementOfPage){
		firstVideoElementOfPage.playbackRate = targetSpeed;
	}

	//TODO: maybe set 1 on error:  chrome.storage.sync.get({ defaultSpeed }); ...
}