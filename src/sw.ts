try {
    // // Initialize defaults
    // chrome.runtime.onInstalled.addListener(async () => {
    //     await chrome.storage.local.set({
    //         defaults: {
    //             defaultSpeed: 1
    //         }
    //     });
    // });
    // on page change
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status == 'complete') {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['/js/contentScript.js'] //works on root dir
            });
        }
    });
} catch (e) {
    console.log(e);
}
