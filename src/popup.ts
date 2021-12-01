import '@ui5/webcomponents/dist/Slider';
import { retrieveVideoElements, adjustPlaybackrate, adjustPlaybackrateOnTabChange } from './actions/actions';
import { VideoElementIdentifier, UI5Slider } from '../types';
import { getItemByTabId as getTabSpeedById, updateItemByTabId } from './util/storage';

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

            updateItemByTabId({ tabId: tab.id as number, targetSpeed: targetSpeed });
        } catch (error) {
            console.log(`oops: ${error}`);
        }
    });

    /**
     * Listen to changes within the current tab
     * TODO: refactor: only add the listener if the current tab has an entry within the local storage,
     * this probably requires anothe refactor within the utility file 
     */
    chrome.tabs.onUpdated.addListener(async (tabId, _, tab) => {
        if (tabId === tab.id && tab.status == 'complete') {
            const targetSpeed = await getTabSpeedById(tabId);
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: adjustPlaybackrateOnTabChange,
                args: [targetSpeed]
            });

            updateItemByTabId({ tabId: tabId, targetSpeed: targetSpeed });
        }
    });
};

/**
 * This function takes care of initializing the state of the popup (slider).
 * We want to have the slider preconfigured at the speed we set the video of the tab already
 * @param sliderComponent 
 * @param currentTab 
 */
const initializePopupState = async (sliderComponent: UI5Slider, currentTab: number): Promise<void> => {
    const targetSpeed = await getTabSpeedById(currentTab);
    sliderComponent.value = targetSpeed;
};

document.addEventListener('DOMContentLoaded', () => {
    initializePopup();
});
