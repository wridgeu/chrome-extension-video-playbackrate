import { TabHistoryEntry } from '../../types';

/**
 * Tries to read the localStorage for the video speed settings of the current tab.
 * In case there is no entry to be found, it defaults to 1 and returns 1 as speed.
 * @param tabId
 * @returns
 */
export async function getItemByTabId(tabId: number): Promise<number> {
    const { sessionTabHistory } = await chrome.storage.local.get('sessionTabHistory');

    let { targetSpeed } = sessionTabHistory.find((element: any) => {
        return element.tabId === tabId;
    });

    if (targetSpeed === undefined || targetSpeed === null || !targetSpeed) {
        let { defaultSpeed } = await chrome.storage.local.get('defaultSpeed');
        targetSpeed = defaultSpeed.targetSpeed;
    }

    return targetSpeed;
}

/**
 * @param item 
 */
export async function updateItemByTabId(item: TabHistoryEntry): Promise<void> {
	// TODO: read values of localStorage & add new values in case our current tabId is not yet in the storage
    // 1. get all information
    // 2. look for current tab
    // 3. update or insert
    chrome.storage.local.set({
        sessionTabHistory: [
            {
                tabId: item.tabId,
                targetSpeed: item.targetSpeed
            }
        ]
    });
}
