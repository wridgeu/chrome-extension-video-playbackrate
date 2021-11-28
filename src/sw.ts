let defaultSpeed = 1;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ defaultSpeed });
});