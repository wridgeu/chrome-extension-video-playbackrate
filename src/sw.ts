let defaultSpeed = 1;

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ defaultSpeed });
});

/**
 * Clear extensions local storage on browser startup (initial state)
 */
chrome.storage.local.clear();
