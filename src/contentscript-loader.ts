// Injected as a classic script (no static imports or top-level await), so load the ES module dynamically
import(chrome.runtime.getURL('js/contentscript.js'));
