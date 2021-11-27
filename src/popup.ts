import "@ui5/webcomponents/dist/Slider";

let sliderComponent = (document.getElementById("sliderWebComponent") as HTMLElement);

sliderComponent.addEventListener("change", async (e) => {
	let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	let targetSpeed = (e.target! as any).value;
	chrome.storage.sync.set({targetSpeed});
	chrome.scripting.executeScript({
	  target: { tabId: (tab.id as number) },
	  func: setVideoPlayerSpeed
	});
});
  
function setVideoPlayerSpeed(): void {
	chrome.storage.sync.get("targetSpeed", ({ targetSpeed }) => {
		let firstVideoElementOfPage = (document.getElementsByTagName("video")[0] as HTMLVideoElement);
		if(firstVideoElementOfPage){
			firstVideoElementOfPage.playbackRate = targetSpeed;
		}
	});

	//TODO: maybe set 1 on error:  chrome.storage.sync.get({ defaultSpeed }); ...
}