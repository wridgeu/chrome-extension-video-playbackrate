/**
 * Clear extensions local storage on browser startup (initial state)
 */
 chrome.storage.local.clear();

/**
 * Initialize defaults
 */
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({
        defaults: {
            defaultSpeed: 1
        }
    });
});
