import { launch, type Browser, type Frame, type Page, type WebWorker } from 'puppeteer';
import path from 'path';
import { TEST_SERVER_URL } from '@tests/e2e/server';

// Path to the built extension
const EXTENSION_PATH = path.resolve(import.meta.dirname, '../../../dist');

let browser: Browser | null = null;
/** Pages opened by the helpers, closed by closeTestPages() */
const openedPages = new Set<Page>();

function getBrowser(): Browser {
	if (!browser) throw new Error('Browser not launched');
	return browser;
}

/** Launch a browser instance with the extension loaded. */
export async function launchBrowserWithExtension(): Promise<Browser> {
	browser ??= await launch({
		// Extensions work in modern headless mode; headed locally for debugging
		headless: Boolean(process.env.CI),
		// Loads the unpacked build via CDP; the legacy --load-extension flag is ignored by newer Chrome builds
		enableExtensions: [EXTENSION_PATH],
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
	});
	return browser;
}

/** Close the browser instance. */
export async function closeBrowser(): Promise<void> {
	await browser?.close();
	browser = null;
}

/** The extension's service worker, waiting for it to start if needed. */
async function getWorker(): Promise<WebWorker> {
	const target = await getBrowser().waitForTarget(
		(t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'),
		{ timeout: 10000 }
	);
	const worker = await target.worker();
	if (!worker) throw new Error('Could not get service worker');
	return worker;
}

/** Close every page the helpers opened, so tabs (and their per-tab state) don't leak between tests. */
export async function closeTestPages(): Promise<void> {
	await Promise.all(Array.from(openedPages, (page) => (page.isClosed() ? undefined : page.close())));
	openedPages.clear();
}

/** Restore default settings (defaults off, badge on, system theme). */
export async function resetSettings(): Promise<void> {
	await (await getWorker()).evaluate(() => chrome.storage.sync.clear());
}

/** Get the extension ID from the running browser instance. */
export async function getExtensionId(): Promise<string> {
	return new URL((await getWorker()).url()).host;
}

/** Name and version of the extension whose service worker is running. */
export async function getLoadedManifest(): Promise<{ name: string; version: string }> {
	return (await getWorker()).evaluate(() => {
		const { name, version } = chrome.runtime.getManifest();
		return { name, version };
	});
}

/** Open a page of the local test server, e.g. `video.html`. */
export async function openTestPage(file: string): Promise<Page> {
	const page = await getBrowser().newPage();
	openedPages.add(page);
	await page.goto(`${TEST_SERVER_URL}/${file}`, { waitUntil: 'networkidle0' });
	return page;
}

/** Open the extension options page. */
export async function openExtensionOptions(extensionId: string): Promise<Page> {
	const page = await getBrowser().newPage();
	openedPages.add(page);
	await page.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: 'networkidle0' });
	return page;
}

/** Open the extension popup for `page` (made the active tab first), like clicking the toolbar icon. */
export async function openPopupForPage(page: Page): Promise<Page> {
	await page.bringToFront();
	await (await getWorker()).evaluate(() => chrome.action.openPopup());
	const popupTarget = await getBrowser().waitForTarget(
		(target) => target.type() === 'page' && target.url().endsWith('popup.html'),
		{ timeout: 10000 }
	);
	const popupPage = await popupTarget.asPage();
	openedPages.add(popupPage);
	await popupPage.waitForSelector('ui5-text, ui5-slider', { timeout: 10000 });
	return popupPage;
}

/** Get the tab ID for a page. */
export async function getTabId(page: Page): Promise<number> {
	const url = page.url();
	const tabId = await (
		await getWorker()
	).evaluate(async (u: string) => (await chrome.tabs.query({ url: u }))[0]?.id, url);
	if (tabId === undefined) throw new Error(`Could not find tab for URL: ${url}`);
	return tabId;
}

/**
 * Ensure the content script is loaded and initialized in every frame of the page.
 * Puppeteer may not reliably trigger tabs.onUpdated, so this imports the module itself: in the extension's
 * isolated world the import resolves once the (already or newly) loaded module has finished initializing.
 */
export async function waitForContentScript(page: Page): Promise<void> {
	const tabId = await getTabId(page);
	await (
		await getWorker()
	).evaluate(async (tid: number) => {
		await chrome.scripting.executeScript({
			target: { tabId: tid, allFrames: true },
			func: async () => {
				await import(chrome.runtime.getURL('js/contentscript.js'));
				return true;
			}
		});
	}, tabId);
}

/** The content frame of the iframe matching `selector`. */
export async function getIframe(page: Page, selector: string): Promise<Frame> {
	const frame = await (await page.waitForSelector(selector))?.contentFrame();
	if (!frame) throw new Error(`No iframe content for ${selector}`);
	await frame.waitForSelector('video');
	return frame;
}

/** Change the rate of matching videos from the page itself, like the browser's native controls do. */
export async function setRateNatively(frame: Page | Frame, rate: number, selector = 'video'): Promise<void> {
	await frame.evaluate(
		(sel: string, r: number) => {
			document.querySelectorAll<HTMLVideoElement>(sel).forEach((video) => {
				video.playbackRate = r;
			});
		},
		selector,
		rate
	);
}

/** Playback rates of all videos in the frame, in document order. */
export function getVideoRates(frame: Page | Frame): Promise<number[]> {
	return frame.evaluate(() => Array.from(document.querySelectorAll('video'), (video) => video.playbackRate));
}

/** Get the badge text for a specific tab. */
export async function getBadgeText(tabId: number): Promise<string> {
	return (await getWorker()).evaluate((tid: number) => chrome.action.getBadgeText({ tabId: tid }), tabId);
}

/** Read one key from extension storage. */
export async function getStorageValue(area: 'local' | 'sync', key: string): Promise<unknown> {
	return (await getWorker()).evaluate(
		async (a: 'local' | 'sync', k: string) => (await chrome.storage[a].get(k))[k],
		area,
		key
	);
}

/** Write extension settings directly to sync storage (bypasses the options UI). */
export async function setSyncStorage(items: Record<string, unknown>): Promise<void> {
	await (await getWorker()).evaluate((i: Record<string, unknown>) => chrome.storage.sync.set(i), items);
}

/** Current value of the popup slider. */
export function getSliderValue(popupPage: Page): Promise<number> {
	return popupPage.$eval('ui5-slider', (slider) => (slider as Element & { value: number }).value);
}

/** Set the popup slider value and fire `eventName`, like a user drag (`input`) or release (`change`). */
export async function moveSlider(popupPage: Page, value: number, eventName = 'change'): Promise<void> {
	await popupPage.$eval(
		'ui5-slider',
		(slider, v: number, name: string) => {
			(slider as Element & { value: number }).value = v;
			slider.dispatchEvent(new Event(name, { bubbles: true }));
		},
		value,
		eventName
	);
}
