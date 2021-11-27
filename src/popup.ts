let popupButton = (document.getElementById("changeVideoPlayerSpeed") as HTMLVideoElement) ;

popupButton.addEventListener("click", async () => {
	let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
	chrome.scripting.executeScript({
	  target: { tabId: (tab.id as number) },
	  func: setVideoPlayerSpeed
	});
});
  
function setVideoPlayerSpeed(): void {
	chrome.storage.sync.get("defaultSpeed", ({ defaultSpeed }) => {
		let videoElement = document.getElementsByTagName("video")[0];
		if(videoElement){
			videoElement.playbackRate = 2;
		}
	});
}