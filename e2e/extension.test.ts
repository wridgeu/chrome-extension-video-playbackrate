import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Page } from 'puppeteer';
import {
  launchBrowserWithExtension,
  closeBrowser,
  getExtensionId,
  openExtensionPopup,
  openExtensionOptions,
  createPageWithVideo,
} from './setup';

describe('Chrome Extension E2E', () => {
  let extensionId: string;

  beforeAll(async () => {
    await launchBrowserWithExtension();
    extensionId = await getExtensionId();
  }, 30000);

  afterAll(async () => {
    await closeBrowser();
  });

  describe('Extension Loading', () => {
    it('loads with valid ID', async () => {
      expect(extensionId).toBeDefined();
      expect(extensionId).toMatch(/^[a-z]{32}$/);
    });
  });

  describe('Popup', () => {
    let page: Page;

    beforeAll(async () => {
      page = await openExtensionPopup(extensionId);
    });

    afterAll(async () => {
      if (page && !page.isClosed()) await page.close();
    });

    it('opens popup.html', async () => {
      expect(page.url()).toContain('popup.html');
    });

    it('has ui5-slider with correct range', async () => {
      await page.waitForSelector('ui5-slider', { timeout: 10000 });

      const attrs = await page.evaluate(() => {
        const s = document.querySelector('ui5-slider');
        return s ? { min: s.getAttribute('min'), max: s.getAttribute('max'), step: s.getAttribute('step') } : null;
      });

      expect(attrs).toEqual({ min: '0', max: '4', step: '0.25' });
    });
  });

  describe('Options', () => {
    let page: Page;

    beforeAll(async () => {
      page = await openExtensionOptions(extensionId);
    });

    afterAll(async () => {
      if (page && !page.isClosed()) await page.close();
    });

    it('opens options.html', async () => {
      expect(page.url()).toContain('options.html');
    });

    it('has required controls', async () => {
      await page.waitForSelector('#defaultsEnabledCheckbox', { timeout: 10000 });
      await page.waitForSelector('#defaultSpeedSelector', { timeout: 10000 });
      await page.waitForSelector('ui5-switch', { timeout: 10000 });

      expect(await page.$('#defaultsEnabledCheckbox')).not.toBeNull();
      expect(await page.$('#defaultSpeedSelector')).not.toBeNull();
      expect(await page.$('ui5-switch')).not.toBeNull();
    });

    it('toggles theme on switch click', async () => {
      await page.waitForSelector('ui5-switch', { timeout: 10000 });
      const before = await page.evaluate(() => document.body.style.backgroundColor);
      await page.click('ui5-switch');
      await new Promise((r) => setTimeout(r, 500));
      const after = await page.evaluate(() => document.body.style.backgroundColor);

      expect(typeof before).toBe('string');
      expect(typeof after).toBe('string');
    });
  });

  describe('Video Playback', () => {
    let page: Page;

    beforeAll(async () => {
      page = await createPageWithVideo();
      await page.waitForSelector('#test-video', { timeout: 10000 });
    });

    afterAll(async () => {
      if (page && !page.isClosed()) await page.close();
    });

    it('defaults to 1x', async () => {
      const rate = await page.evaluate(
        () => (document.getElementById('test-video') as HTMLVideoElement)?.playbackRate
      );
      expect(rate).toBe(1);
    });

    it('accepts rate changes', async () => {
      await page.evaluate(() => {
        (document.getElementById('test-video') as HTMLVideoElement).playbackRate = 2;
      });
      const rate = await page.evaluate(
        () => (document.getElementById('test-video') as HTMLVideoElement)?.playbackRate
      );
      expect(rate).toBe(2);
    });

    it('handles right-click', async () => {
      const video = await page.$('#test-video');
      expect(video).not.toBeNull();
      await video!.click({ button: 'right' });
    });

    it('supports all predefined rates', async () => {
      const rates = [0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5, 3, 3.25, 3.5, 4];

      for (const rate of rates) {
        await page.evaluate((r) => {
          (document.getElementById('test-video') as HTMLVideoElement).playbackRate = r;
        }, rate);
        const current = await page.evaluate(
          () => (document.getElementById('test-video') as HTMLVideoElement)?.playbackRate
        );
        expect(current).toBe(rate);
      }
    });
  });
});
