try {
    // on page change
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status == 'complete') {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['/js/contentscript.js'] //works on root dir
            });
        }
    });
} catch (e) {
    console.error(`ERROR: Service Worker - ${e}`);
}
