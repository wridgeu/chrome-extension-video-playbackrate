import puppeteer, { Browser, Page, Target } from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import { TEST_SERVER_URL } from '@tests/e2e/server';
import { MessagingAction } from '@src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the built extension
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist');

let browser: Browser | null = null;

/** Launch a browser instance with the extension loaded. */
export async function launchBrowserWithExtension(): Promise<Browser> {
	if (browser) {
		return browser;
	}

	browser = await puppeteer.launch({
		headless: process.env.CI ? true : false, // Extensions work in modern headless mode (headless: true)
		args: [
			`--disable-extensions-except=${EXTENSION_PATH}`,
			`--load-extension=${EXTENSION_PATH}`,
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--disable-dev-shm-usage'
		]
	});

	return browser;
}

/** Close the browser instance. */
export async function closeBrowser(): Promise<void> {
	if (browser) {
		await browser.close();
		browser = null;
	}
}

async function waitForServiceWorker(maxAttempts = 20, delayMs = 500): Promise<string> {
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const targets = browser!.targets();
		const extensionTarget = targets.find(
			(target) => target.type() === 'service_worker' && target.url().includes('chrome-extension://')
		);

		if (extensionTarget) {
			return extensionTarget.url().split('/')[2];
		}

		if (attempt < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	throw new Error(`Extension service worker not found after ${maxAttempts} attempts`);
}

/** Get the extension ID from the running browser instance. */
export async function getExtensionId(): Promise<string> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	return waitForServiceWorker();
}

/** Open the extension popup page using chrome.action.openPopup() per Puppeteer docs. */
export async function openExtensionPopup(): Promise<Page> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	// Get the service worker
	const swTarget = await getServiceWorkerTarget();
	const worker = await swTarget.worker();

	if (!worker) {
		throw new Error('Could not get service worker');
	}

	// Trigger the popup to open via Chrome API
	await worker.evaluate(() => chrome.action.openPopup());

	// Wait for and access the popup page
	const popupTarget = await browser.waitForTarget(
		(target) => target.type() === 'page' && target.url().endsWith('popup.html'),
		{ timeout: 10000 }
	);

	const popupPage = await popupTarget.asPage();
	await popupPage.waitForSelector('body', { timeout: 10000 });

	return popupPage;
}

/** Open the extension options page. */
export async function openExtensionOptions(extensionId: string): Promise<Page> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	const optionsUrl = `chrome-extension://${extensionId}/options.html`;
	const page = await browser.newPage();
	await page.goto(optionsUrl, { waitUntil: 'networkidle0' });

	return page;
}

/** Create a test page with a video element using HTTP URL (enables content script injection). */
export async function createPageWithVideo(): Promise<Page> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	const page = await browser.newPage();
	await page.goto(`${TEST_SERVER_URL}/video.html`, { waitUntil: 'networkidle0' });
	return page;
}

/** Create a test page without any video elements using HTTP URL. */
export async function createPageWithoutVideo(): Promise<Page> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	const page = await browser.newPage();
	await page.goto(`${TEST_SERVER_URL}/no-video.html`, { waitUntil: 'networkidle0' });
	return page;
}

/** Create a test page with multiple video elements using HTTP URL (always 3 videos). */
export async function createPageWithMultipleVideos(): Promise<Page> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	const page = await browser.newPage();
	await page.goto(`${TEST_SERVER_URL}/multi-video.html`, { waitUntil: 'networkidle0' });
	return page;
}

/** Get the test server URL for use in tests */
export function getTestServerURL(): string {
	return TEST_SERVER_URL;
}

/** Get the service worker target for the extension. */
export async function getServiceWorkerTarget(): Promise<Target> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	const targets = browser.targets();
	const swTarget = targets.find(
		(target) => target.type() === 'service_worker' && target.url().includes('chrome-extension://')
	);

	if (!swTarget) {
		throw new Error('Service worker target not found');
	}

	return swTarget;
}

/** Send a message to a tab via the extension's service worker. */
export async function sendMessageToTab(tabId: number, message: object): Promise<unknown> {
	const swTarget = await getServiceWorkerTarget();
	const worker = await swTarget.worker();

	if (!worker) {
		throw new Error('Could not get service worker');
	}

	return worker.evaluate(
		async (tid: number, msg: object) => {
			return chrome.tabs.sendMessage(tid, msg);
		},
		tabId,
		message
	);
}

/** Get the tab ID for a page. */
export async function getTabId(page: Page): Promise<number> {
	const swTarget = await getServiceWorkerTarget();
	const worker = await swTarget.worker();

	if (!worker) {
		throw new Error('Could not get service worker');
	}

	const pageUrl = page.url();

	const tabId = await worker.evaluate(async (url: string) => {
		const tabs = await chrome.tabs.query({ url });
		return tabs[0]?.id;
	}, pageUrl);

	if (tabId === undefined) {
		throw new Error(`Could not find tab for URL: ${pageUrl}`);
	}

	return tabId;
}

/**
 * Manually inject the content script into a tab.
 * Puppeteer/headless Chrome may not reliably trigger tabs.onUpdated events.
 */
async function injectContentScript(tabId: number): Promise<void> {
	const swTarget = await getServiceWorkerTarget();
	const worker = await swTarget.worker();

	if (!worker) {
		throw new Error('Could not get service worker');
	}

	await worker.evaluate(async (tid: number) => {
		await chrome.scripting.executeScript({
			target: { tabId: tid, allFrames: true },
			files: ['/js/contentscript-loader.js']
		});
	}, tabId);
}

/**
 * Wait for content script to be injected and ready.
 * First manually injects the content script, then verifies it's responding.
 */
export async function waitForContentScript(page: Page, timeout = 5000): Promise<void> {
	const tabId = await getTabId(page);

	// Manually inject content script (Puppeteer may not trigger tabs.onUpdated reliably)
	try {
		await injectContentScript(tabId);
	} catch {
		// Injection might fail if already injected, continue to check
	}

	const start = Date.now();

	while (Date.now() - start < timeout) {
		try {
			const response = await sendMessageToTab(tabId, { action: MessagingAction.RETRIEVE });
			if (response !== undefined) return;
		} catch {
			// Content script not ready yet
		}
		await new Promise((r) => setTimeout(r, 200));
	}

	throw new Error('Content script injection timeout');
}

/** Get the badge text for a specific tab. */
export async function getBadgeText(tabId: number): Promise<string> {
	const swTarget = await getServiceWorkerTarget();
	const worker = await swTarget.worker();

	if (!worker) {
		throw new Error('Could not get service worker');
	}

	return worker.evaluate(async (tid: number) => {
		return chrome.action.getBadgeText({ tabId: tid });
	}, tabId);
}

/** Bring a page to the foreground (make it the active tab). */
export async function bringToFront(page: Page): Promise<void> {
	await page.bringToFront();
}

/** Set default playback rate settings directly via storage (bypasses UI). */
export async function setDefaultPlaybackRate(enabled: boolean, playbackRate: number): Promise<void> {
	const swTarget = await getServiceWorkerTarget();
	const worker = await swTarget.worker();

	if (!worker) {
		throw new Error('Could not get service worker');
	}

	await worker.evaluate(
		async (en: boolean, rate: number) => {
			await chrome.storage.sync.set({
				defaults: {
					enabled: en,
					playbackRate: rate
				}
			});
		},
		enabled,
		playbackRate
	);
}

/**
 * Open popup for a specific page (ensures the page is the active tab first).
 * This is the recommended way to test popup interaction with a specific page.
 */
export async function openPopupForPage(page: Page): Promise<Page> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	// Bring the page to front so it's the active tab
	await page.bringToFront();

	// Small delay to ensure tab activation is processed
	await new Promise((r) => setTimeout(r, 100));

	// Get the service worker
	const swTarget = await getServiceWorkerTarget();
	const worker = await swTarget.worker();

	if (!worker) {
		throw new Error('Could not get service worker');
	}

	// Trigger the popup to open via Chrome API
	await worker.evaluate(() => chrome.action.openPopup());

	// Wait for and access the popup page
	const popupTarget = await browser.waitForTarget(
		(target) => target.type() === 'page' && target.url().endsWith('popup.html'),
		{ timeout: 10000 }
	);

	const popupPage = await popupTarget.asPage();
	await popupPage.waitForSelector('body', { timeout: 10000 });

	return popupPage;
}

/** Create a test page with video in an iframe using HTTP URL. */
export async function createPageWithIframeVideo(): Promise<Page> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	const page = await browser.newPage();
	await page.goto(`${TEST_SERVER_URL}/iframe-video.html`, { waitUntil: 'networkidle0' });
	return page;
}

/** Create a test page for SPA navigation simulation. */
export async function createSpaVideoPage(): Promise<Page> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	const page = await browser.newPage();
	await page.goto(`${TEST_SERVER_URL}/spa-video.html`, { waitUntil: 'networkidle0' });
	return page;
}

/** Set badge enabled state directly via storage. */
export async function setBadgeEnabled(enabled: boolean): Promise<void> {
	const swTarget = await getServiceWorkerTarget();
	const worker = await swTarget.worker();

	if (!worker) {
		throw new Error('Could not get service worker');
	}

	await worker.evaluate(async (en: boolean) => {
		await chrome.storage.sync.set({ badgeEnabled: en });
	}, enabled);
}

/** Wait for a condition to be true, with timeout. */
export async function waitForCondition(
	conditionFn: () => Promise<boolean>,
	timeout = 5000,
	interval = 100
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (await conditionFn()) return;
		await new Promise((r) => setTimeout(r, interval));
	}
	throw new Error('Condition not met within timeout');
}

export { browser };
