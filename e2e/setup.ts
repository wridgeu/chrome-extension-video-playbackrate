import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the built extension
const EXTENSION_PATH = path.resolve(__dirname, '../dist');

let browser: Browser | null = null;

/**
 *
 */
export async function launchBrowserWithExtension(): Promise<Browser> {
  if (browser) {
    return browser;
  }

  browser = await puppeteer.launch({
    headless: false, // Extensions don't work in headless mode, use 'new' for newer Chrome
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  return browser;
}

/**
 *
 */
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

/**
 *
 */
export async function getExtensionId(): Promise<string> {
  if (!browser) {
    throw new Error('Browser not launched');
  }

  return waitForServiceWorker();
}

/**
 *
 * @param extensionId
 */
export async function openExtensionPopup(extensionId: string): Promise<Page> {
  if (!browser) {
    throw new Error('Browser not launched');
  }

  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  const page = await browser.newPage();
  await page.goto(popupUrl, { waitUntil: 'networkidle0' });

  return page;
}

/**
 *
 * @param extensionId
 */
export async function openExtensionOptions(extensionId: string): Promise<Page> {
  if (!browser) {
    throw new Error('Browser not launched');
  }

  const optionsUrl = `chrome-extension://${extensionId}/options.html`;
  const page = await browser.newPage();
  await page.goto(optionsUrl, { waitUntil: 'networkidle0' });

  return page;
}

/**
 *
 */
export async function createPageWithVideo(): Promise<Page> {
  if (!browser) {
    throw new Error('Browser not launched');
  }

  const page = await browser.newPage();

  // Create a simple page with a video element
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Video Test Page</title>
      </head>
      <body>
        <video id="test-video" width="640" height="360" controls>
          <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4">
        </video>
        <script>
          // Make video element accessible
          window.testVideo = document.getElementById('test-video');
        </script>
      </body>
    </html>
  `);

  return page;
}

export { browser };
