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

    initializePopupState(sliderComponent, tab.id as number);

    /**
     * Listen on change of UI5 Slider WebC
     */
    sliderComponent.addEventListener('change', async (e): Promise<void> => {
        const targetSpeed = (e.target as UI5Slider).value as number;

        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id as number },
                func: adjustPlaybackrate,
                args: [targetSpeed, targetVideoElement]
            });

            updateLocalStorage(targetSpeed, tab.id as number);
        } catch (error) {
            console.log(`oops: ${error}`);
        }
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
 * - https://stackoverflow.com/questions/55272272/chromeextension-storage-per-tab (tabId needs to be stored aswell)
 * - https://techinplanet.com/clear-temporary-storage-data-for-a-chrome-extension-when-browser-closes/
 * @param sliderComponent
 * @param targetVideoElement
 * @param tabId
 */
const initializePopupState = async (sliderComponent: UI5Slider, currentTab: number): Promise<void> => {
    const { test } = await chrome.storage.local.get(currentTab.toString());
    console.log(test)
    if (Object.entries.length !== 0) {
        // sliderComponent.value = currentTabInformation[currentTab];
    } else {
        // sliderComponent.value = await chrome.storage.local.get('defaultSpeed');
    }
};

const updateLocalStorage = async (targetSpeed: number, currentTab: number): Promise<void> => {
    chrome.storage.local.set({ [currentTab]: targetSpeed });
};

document.addEventListener('DOMContentLoaded', () => {
    initializePopup();
});
