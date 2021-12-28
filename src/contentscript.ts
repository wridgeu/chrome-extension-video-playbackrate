import { ChromeMessagingRequest, ChromeMessagingRequestAction } from '../types';

// Set playbackrate defaults
(async () => {
    const { defaults } = await chrome.storage.sync.get('defaults');
    if (defaults?.enabled) {
        const videoElement = <HTMLVideoElement>document.querySelectorAll('video')[0];
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
    switch (request.action) {
        case ChromeMessagingRequestAction.SET:
            document.querySelectorAll('video')[0].playbackRate = request.playbackRate!;
            return true;
        case ChromeMessagingRequestAction.RETRIEVE:
            sendResponse({ playbackRate: document.querySelectorAll('video')[0].playbackRate });
            break;
        default:
            break;
    }
});
