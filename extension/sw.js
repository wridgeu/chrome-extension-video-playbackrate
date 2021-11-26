let defaultSpeed = 1;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ defaultSpeed });
  console.log(`Default videoplayer speed set to ${defaultSpeed}`);
});