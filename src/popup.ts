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
 * This function takes care of initializing the state of the popup (slider).
 * 1. We want to have the slider preconfigured at the speed we set the video of the tab already
 * 2. If the video src but not the tab changes (e.g. youtube): https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
 * TODO: add types
 * BIG TODO: check out content scripts to avoid being attached to the popup window
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
    let targetValue;
    const { sessionTabHistory } = await chrome.storage.local.get('sessionTabHistory');

    try {
        targetValue = sessionTabHistory.find((element: any) => {
            return element.tabId === currentTab;
        }).targetSpeed;
        sliderComponent.value = targetValue;
    } catch (e) {
        let { defaultSpeed } = await chrome.storage.local.get('defaultSpeed');
        sliderComponent.value = defaultSpeed;
    }
};

/**
 * TODO: read values of localStorage & add new values in case our current tabId is not yet in the storage
 * TODO: add types
 * @param targetSpeed
 * @param currentTab
 */
const updateLocalStorage = async (targetSpeed: number, currentTab: number): Promise<void> => {
    chrome.storage.local.set({
        sessionTabHistory: [
            {
                tabId: currentTab,
                targetSpeed: targetSpeed
            }
        ]
    });
};

document.addEventListener('DOMContentLoaded', () => {
    initializePopup();
});
