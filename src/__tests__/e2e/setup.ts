import puppeteer, { Browser, Page, Target } from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the built extension
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist');

// Test video URL (file:// URL for browser access, resolved relative to this module)
const TEST_VIDEO_URL = new URL('../fixtures/test-video.mp4', import.meta.url).href;

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

/** Open the extension popup page. */
export async function openExtensionPopup(extensionId: string): Promise<Page> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	const popupUrl = `chrome-extension://${extensionId}/popup.html`;
	const page = await browser.newPage();
	await page.goto(popupUrl, { waitUntil: 'networkidle0' });

	return page;
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

/** Create a test page with a video element. */
export async function createPageWithVideo(): Promise<Page> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	const page = await browser.newPage();

	// Create a page with a video element using local test video
	await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Video Test Page</title>
      </head>
      <body>
        <video id="test-video" width="640" height="360" controls>
          <source src="${TEST_VIDEO_URL}" type="video/mp4">
        </video>
        <script>
          window.testVideo = document.getElementById('test-video');
        </script>
      </body>
    </html>
  `);

	return page;
}

/** Create a test page without any video elements. */
export async function createPageWithoutVideo(): Promise<Page> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	const page = await browser.newPage();

	await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>No Video Test Page</title>
      </head>
      <body>
        <h1>Page without videos</h1>
        <p>This page has no video elements.</p>
      </body>
    </html>
  `);

	return page;
}

/** Create a test page with multiple video elements. */
export async function createPageWithMultipleVideos(count: number = 3): Promise<Page> {
	if (!browser) {
		throw new Error('Browser not launched');
	}

	const page = await browser.newPage();

	const videoElements = Array.from(
		{ length: count },
		(_, i) => `
        <video id="test-video-${i + 1}" width="320" height="180" controls>
          <source src="${TEST_VIDEO_URL}" type="video/mp4">
        </video>`
	).join('\n');

	await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Multiple Videos Test Page</title>
      </head>
      <body>
        <h1>Page with ${count} videos</h1>
        ${videoElements}
        <script>
          window.testVideos = document.querySelectorAll('video');
        </script>
      </body>
    </html>
  `);

	return page;
}

/** Get the test video URL for use in inline HTML */
export function getTestVideoURL(): string {
	return TEST_VIDEO_URL;
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

export { browser };
