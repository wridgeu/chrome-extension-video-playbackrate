// export const, to prevent code generation and directly replace enum usage with it's value (0,1,2)
// dynamic import of enum causes some issues
// https://stackoverflow.com/questions/48104433/how-to-import-es6-modules-in-content-script-for-chrome-extension
export const enum ChromeMessagingRequestAction {
	SET,
	SETSPECIFIC,
	RETRIEVE,
}

// Set playbackrate defaults
(async () => {
	const { defaults } = <Defaults>await chrome.storage.sync.get("defaults");
	if (defaults?.enabled) {
		const [videoElement] = document.querySelectorAll("video");

		if (!videoElement) return;
		videoElement.playbackRate = defaults.playbackRate || 1;

		const observer = new MutationObserver((mutationList: MutationRecord[]) => {
			for (const mutation of mutationList) {
				if (
					mutation.type === "attributes" &&
					mutation.attributeName === "src"
				) {
					videoElement.playbackRate = defaults.playbackRate || 1;
				}
			}
			videoElement.addEventListener("ratechange", () => observer.disconnect());
		});
		observer.observe(videoElement, {
			attributes: true,
			attributeFilter: ["src"],
		});
	}
})();

// https://developer.chrome.com/docs/extensions/mv3/messaging/
chrome.runtime.onMessage.addListener(
	(request: ChromeMessagingRequest, _, sendResponse) => {
		const [videoElement] = document.querySelectorAll("video");
		if (
			!videoElement &&
			request.action !== ChromeMessagingRequestAction.SETSPECIFIC
		) {
			return true;
		}

		switch (request.action) {
			case ChromeMessagingRequestAction.SET:
				videoElement.playbackRate = request.playbackRate!;
				break;
			case ChromeMessagingRequestAction.SETSPECIFIC:
				(
					document.querySelector(
						`video[src='${request.videoElementSrcAttributeValue!}']`
					)! as HTMLVideoElement
				).playbackRate = request.playbackRate!;
				break;
			case ChromeMessagingRequestAction.RETRIEVE:
				sendResponse({ playbackRate: videoElement.playbackRate });
				break;
			default:
				break;
		}
	}
);
