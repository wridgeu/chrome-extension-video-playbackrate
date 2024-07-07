export enum MessagingAction {
	SET = 0,
	SETSPECIFIC = 1,
	RETRIEVE = 2
}

type SetSpecificActionPayload = {
	action: MessagingAction.SETSPECIFIC;
	playbackRate: number;
	videoElementSrcAttributeValue: string;
};

type SetActionPayload = {
	action: MessagingAction.SET;
	playbackRate: number;
};

type RetrieveActionPayload = {
	action: MessagingAction.RETRIEVE;
};

/**
 * Discriminated Union, discriminator: action
 */
export type MessagingRequestPayload = SetSpecificActionPayload | SetActionPayload | RetrieveActionPayload;

export type RetrieveResponse = {
	playbackRate: number;
};

/**
 * Default configuration
 */
export type Defaults = {
	defaults: {
		enabled?: boolean;
		playbackRate?: number;
	};
};

// set playbackrate defaults
(async () => {
	const { defaults } = <Defaults>await chrome.storage.sync.get('defaults');
	if (!defaults?.enabled) return;

	const playbackRate = defaults.playbackRate || 1;

	const [videoElement] = document.querySelectorAll('video');
	if (!videoElement) return;

	videoElement.playbackRate = playbackRate;

	const mutObserver = new MutationObserver((mutationList: MutationRecord[]) => {
		for (const mutation of mutationList) {
			if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
				videoElement.playbackRate = playbackRate;
			}
		}

		videoElement.addEventListener('ratechange', () => mutObserver.disconnect());
	});

	mutObserver.observe(videoElement, {
		attributes: true,
		attributeFilter: ['src']
	});
})();

// https://developer.chrome.com/docs/extensions/mv3/messaging/
chrome.runtime.onMessage.addListener((request: MessagingRequestPayload, _, sendResponse) => {
	const [videoElement] = document.querySelectorAll('video');
	if (!videoElement && request.action !== MessagingAction.SETSPECIFIC) {
		return true;
	}

	switch (request.action) {
		case MessagingAction.SET:
			videoElement.playbackRate = request.playbackRate!;
			break;
		case MessagingAction.SETSPECIFIC:
			(
				document.querySelector(`video[src='${request.videoElementSrcAttributeValue!}']`)! as HTMLVideoElement
			).playbackRate = request.playbackRate!;
			break;
		case MessagingAction.RETRIEVE:
			sendResponse({ playbackRate: videoElement.playbackRate });
			break;
		default:
			break;
	}
});
