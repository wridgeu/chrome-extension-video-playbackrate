(async () => {
	const src = chrome.runtime.getURL('js/contentscript.js');
	await import(src);
})();
