/**
 * Initialize defaults
 */
chrome.runtime.onInstalled.addListener(async () => {
    await chrome.storage.local.set({
        defaults: {
            defaultSpeed: 1
        }
    });
});
