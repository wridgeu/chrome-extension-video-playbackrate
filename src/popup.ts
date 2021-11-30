import '@ui5/webcomponents/dist/Slider';
import { retrieveVideoElements, adjustPlaybackrate } from './actions/actions';
import { VideoElementIdentifier, UI5Slider } from '../types';

/**
 * Retrieve video elements from current page/tab
 */
const initializePopup = async (): Promise<void> => {
    const sliderComponent = document.getElementById('sliderWebComponent') as UI5Slider;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const [retrievedResults] = await chrome.scripting.executeScript({
        target: { tabId: tab.id as number },
        func: retrieveVideoElements
    });

    /**
     * TODO:
     * Build list based on amount of entries/video tags found
     * hand the number over to the playbackrate script
     */
    const videoElementsOnPage = retrievedResults.result as VideoElementIdentifier[];
    // TODO:If user has element selected, use this one instead, default to the first one:
    const targetVideoElement = videoElementsOnPage[0] as VideoElementIdentifier;

    initializePopupState(sliderComponent, targetVideoElement, tab.id as number);

    /**
     * Listen on change of UI5 Slider WebC
     */
    sliderComponent.addEventListener('change', async (e): Promise<void> => {
        const targetSpeed = (e.target as UI5Slider).value as number;

        chrome.scripting.executeScript({
            target: { tabId: tab.id as number },
            func: adjustPlaybackrate,
            args: [targetSpeed, targetVideoElement]
        });
    });
};

/**
 * This function takes care of initializing the state of the extension.
 * 1. In case we open up a new tab, we want to continue using our previously set speed & apply it to a video element (if exists)
 * 2. We want to have the slider already preconfigured at the current speed
 * 3. TODO: We want to be able to disable this initialization based on plugin-options
 * BIG TODO: pull out in content script to avoid being attached to the popup window
 * see:
 * - https://stackoverflow.com/a/38948149/10323879
 * - https://developer.chrome.com/docs/extensions/mv3/content_scripts/
 * @param sliderComponent
 * @param targetVideoElement
 * @param tabId
 */
const initializePopupState = async (
    sliderComponent: UI5Slider,
    targetVideoElement: VideoElementIdentifier,
    tabId: number
): Promise<void> => {
    const { latestSpeedAdjustment } = await chrome.storage.sync.get('latestSpeedAdjustment');

    if (latestSpeedAdjustment) {
        sliderComponent.value = latestSpeedAdjustment;
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: adjustPlaybackrate,
            args: [latestSpeedAdjustment, targetVideoElement]
        });
    }
};

initializePopup();
