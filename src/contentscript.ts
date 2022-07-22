import { ChromeMessagingRequest, ChromeMessagingRequestAction, Defaults } from './types';

// Set playbackrate defaults
(async () => {
	const { defaults } = <Defaults>await chrome.storage.sync.get('defaults');
	if (defaults?.enabled) {
		const [videoElement] = document.querySelectorAll('video');

		if (!videoElement) return;
		videoElement.playbackRate = defaults.playbackRate;

		const observer = new MutationObserver((mutationList: MutationRecord[]) => {
			for (const mutation of mutationList) {
				if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
					videoElement.playbackRate = defaults.playbackRate;
				}
			}
			videoElement.addEventListener('ratechange', () => observer.disconnect());
		});
		observer.observe(videoElement, {
			attributes: true,
			attributeFilter: ['src']
		});
	}
})();

// https://developer.chrome.com/docs/extensions/mv3/messaging/
chrome.runtime.onMessage.addListener((request: ChromeMessagingRequest, _, sendResponse) => {
	const [videoElement] = document.querySelectorAll('video');

	if (!videoElement && request.action !== ChromeMessagingRequestAction.SETSPECIFIC) {
		return true;
	}

	switch (request.action) {
		case ChromeMessagingRequestAction.SET:
			videoElement.playbackRate = request.playbackRate!;
			break;
		case ChromeMessagingRequestAction.SETSPECIFIC:
			(
				document.querySelector(`video[src='${request.videoElementSrcAttributeValue!}']`)! as HTMLVideoElement
			).playbackRate = request.playbackRate!;
			break;
		case ChromeMessagingRequestAction.RETRIEVE:
			sendResponse({ playbackRate: videoElement.playbackRate });
			break;
		default:
			break;
	}
});
