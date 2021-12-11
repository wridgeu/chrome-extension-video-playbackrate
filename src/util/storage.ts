import { Defaults, TabHistoryEntry } from '../../types';

/**
 * Tries to read the localStorage for the video speed settings of the current tab.
 * In case there is no entry to be found, it defaults to 1 and returns 1 as speed.
 * @param tabId
 * @returns
 */
export async function getItemByTabId(tabId: number): Promise<number> {
    const { sessionTabHistory } = await chrome.storage.local.get('sessionTabHistory');
    let historyEntry: Partial<TabHistoryEntry> = {};

    if (sessionTabHistory) {
        historyEntry = sessionTabHistory.find((element: any) => {
            return element.tabId === tabId;
        });
    }

    if (!historyEntry?.targetSpeed) {
        let defaultStorage: Defaults = await chrome.storage.local.get('defaults') as Defaults;
        console.log(defaultStorage);
        return defaultStorage.defaults.defaultSpeed;
    }

    return historyEntry.targetSpeed as number;
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
