import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Page } from 'puppeteer';
import {
	launchBrowserWithExtension,
	closeBrowser,
	closeTestPages,
	resetSettings,
	getExtensionId,
	getLoadedManifest,
	openTestPage,
	openExtensionOptions,
	openPopupForPage,
	getTabId,
	getIframe,
	waitForContentScript,
	setRateNatively,
	getVideoRates,
	getBadgeText,
	getStorageValue,
	setSyncStorage,
	getSliderValue,
	moveSlider,
	chooseContextMenuItem,
	recordCheckedMenuItems
} from '@tests/e2e/setup';
import { TEST_SERVER_URL } from '@tests/e2e/server';

const WAIT = { timeout: 5000, interval: 100 };

/** Wait until the tab's badge shows `text`. */
const expectBadge = (tabId: number, text: string) =>
	vi.waitFor(async () => expect(await getBadgeText(tabId)).toBe(text), WAIT);

/** Wait until all videos in the page/frame play at `rates`. */
const expectRates = (frame: Parameters<typeof getVideoRates>[0], rates: number[]) =>
	vi.waitFor(async () => expect(await getVideoRates(frame)).toEqual(rates), WAIT);

/** Open a test page and wait until the content script is running in it. */
async function openReadyPage(file: string): Promise<{ page: Page; tabId: number }> {
	const page = await openTestPage(file);
	await waitForContentScript(page);
	return { page, tabId: await getTabId(page) };
}

/** video.html (video with a <source> child) plus a second video with its own src. */
async function openTwoVideoPage() {
	const ready = await openReadyPage('video.html');
	await ready.page.evaluate(() => {
		const other = document.createElement('video');
		other.src = '/test-video.mp4?other';
		document.body.append(other);
	});
	await ready.page.waitForFunction(() => Array.from(document.querySelectorAll('video')).every((v) => v.currentSrc));
	return ready;
}

/** Pick a default speed in the options page like a user: open the select and click the option with `label`. */
async function pickDefaultSpeed(optionsPage: Page, label: string): Promise<void> {
	await clickIn(optionsPage, '#defaultSpeed');
	await optionsPage.locator(`ui5-option::-p-text(${label})`).click();
}

/** Open the options page with a light OS theme and wait until initOptions() has finished (theme mode is set last). */
async function openOptions(extensionId: string): Promise<Page> {
	const page = await openExtensionOptions(extensionId);
	await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
	await page.waitForFunction(
		() => document.querySelector<HTMLElement & { selected: boolean }>('[data-mode="system"]')?.selected,
		{
			timeout: 10000
		}
	);
	return page;
}

/** Click like a user who first switches to that tab (background tabs don't render, so clicks would stall). */
async function clickIn(page: Page, selector: string): Promise<void> {
	await page.bringToFront();
	await page.click(selector);
}

/** Computed page background, which follows the active UI5 theme. */
const backgroundOf = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** Convert a web_accessible_resources glob to a regex (supports * and ? wildcards) */
function globToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replaceAll(/[.+^${}()|[\]\\]/gu, String.raw`\$&`)
		.replaceAll('*', '[^/]*')
		.replaceAll('?', '[^/]');
	return new RegExp(`^${escaped}$`, 'u');
}

describe('Chrome Extension E2E', () => {
	const distDir = join(import.meta.dirname, '../../../dist');
	let extensionId: string;

	beforeAll(async () => {
		await launchBrowserWithExtension();
		// Fail fast if the built extension did not load, instead of running tests against a bare browser
		const built = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'));
		const loaded = await getLoadedManifest();
		if (loaded.name !== built.name || loaded.version !== built.version) {
			throw new Error(`Loaded ${loaded.name}@${loaded.version}, expected the build ${built.name}@${built.version}`);
		}
		extensionId = await getExtensionId();
	}, 30000);

	afterEach(async () => {
		await closeTestPages();
		await resetSettings();
	});

	afterAll(async () => {
		await closeBrowser();
	});

	it('exposes every chunk the content script imports via web_accessible_resources', () => {
		const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'));
		const patterns: RegExp[] = manifest.web_accessible_resources.flatMap((entry: { resources: string[] }) =>
			entry.resources.map(globToRegex)
		);

		const contentScript = readFileSync(join(distDir, 'js/contentscript.js'), 'utf8');
		const imports = Array.from(contentScript.matchAll(/from\s*["']\.\/([^"']+\.js)["']/gu), (m) => `js/${m[1]}`);
		const uncovered = imports.filter((file) => !patterns.some((p) => p.test(file)));

		expect(imports.length).toBeGreaterThan(0);
		expect(uncovered, 'add patterns to public/manifest.json').toEqual([]);
	});

	describe('Options page', () => {
		let page: Page;

		beforeEach(async () => {
			page = await openOptions(extensionId);
		});

		it('saves a picked default speed; turning it off keeps the speed for later', async () => {
			expect(await page.$eval('#defaultSpeed', (el) => (el as HTMLElement & { value: string }).value)).toBe('off');

			await pickDefaultSpeed(page, '1.5×');
			await vi.waitFor(
				async () => expect(await getStorageValue('sync', 'defaults')).toEqual({ enabled: true, playbackRate: 1.5 }),
				WAIT
			);

			await pickDefaultSpeed(page, "Don't change");
			await vi.waitFor(
				async () => expect(await getStorageValue('sync', 'defaults')).toEqual({ enabled: false, playbackRate: 1.5 }),
				WAIT
			);
		});

		it('switches the theme explicitly, back to the system, and then follows OS changes', async () => {
			const light = await backgroundOf(page);

			await page.click('[data-mode="dark"]');
			await vi.waitFor(async () => expect(await backgroundOf(page)).not.toBe(light), WAIT);
			expect(await getStorageValue('sync', 'theme')).toBe('sap_horizon_dark');
			const dark = await backgroundOf(page);

			await page.click('[data-mode="system"]');
			await vi.waitFor(async () => expect(await backgroundOf(page)).toBe(light), WAIT);
			expect(await getStorageValue('sync', 'theme')).toBeUndefined();

			await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
			await vi.waitFor(async () => expect(await backgroundOf(page)).toBe(dark), WAIT);
		});

		it('has the badge enabled by default and saves turning it off', async () => {
			expect(await page.$eval('#badgeToggle', (el) => (el as HTMLInputElement).checked)).toBe(true);

			await page.click('#badgeToggle');

			await vi.waitFor(async () => expect(await getStorageValue('sync', 'badgeEnabled')).toBe(false), WAIT);
		});
	});

	describe('Settings take effect', () => {
		let options: Page;

		beforeEach(async () => {
			options = await openOptions(extensionId);
		});

		it('a default speed picked in the options applies to videos opened afterwards; turning it off stops it', async () => {
			await pickDefaultSpeed(options, '1.5×');
			await vi.waitFor(
				async () => expect(await getStorageValue('sync', 'defaults')).toMatchObject({ enabled: true }),
				WAIT
			);

			const { page, tabId } = await openReadyPage('video.html');
			await expectRates(page, [1.5]);
			await expectBadge(tabId, '1.5');

			await pickDefaultSpeed(options, "Don't change");
			await vi.waitFor(
				async () => expect(await getStorageValue('sync', 'defaults')).toMatchObject({ enabled: false }),
				WAIT
			);

			const { page: next } = await openReadyPage('spa-video.html');
			await next.waitForFunction(() => document.querySelector('video')!.readyState > 0);
			expect(await getVideoRates(next)).toEqual([1]);
		});

		it('switching the badge off and on in the options updates open tabs immediately', async () => {
			const { page, tabId } = await openReadyPage('video.html');
			await setRateNatively(page, 2);
			await expectBadge(tabId, '2');

			await clickIn(options, '#badgeToggle');
			await expectBadge(tabId, '');

			await clickIn(options, '#badgeToggle');
			await expectBadge(tabId, '2');
		});

		it('the theme picked in the options is used by the popup', async () => {
			const videoPage = await openTestPage('video.html');
			const light = await backgroundOf(options);
			// Theme changes repaint asynchronously, so wait for the background instead of reading it once
			const backgroundBecomes = (page: Page, matches: (bg: string) => boolean) =>
				vi.waitFor(async () => {
					const bg = await backgroundOf(page);
					expect(matches(bg)).toBe(true);
					return bg;
				}, WAIT);

			await clickIn(options, '[data-mode="dark"]');
			const dark = await backgroundBecomes(options, (bg) => bg !== light);
			const darkPopup = await openPopupForPage(videoPage);
			await backgroundBecomes(darkPopup, (bg) => bg === dark);
			await darkPopup.close();

			await clickIn(options, '[data-mode="light"]');
			await backgroundBecomes(options, (bg) => bg === light);
			await backgroundBecomes(await openPopupForPage(videoPage), (bg) => bg === light);
		});
	});

	describe('Popup', () => {
		it('shows the slider at the current rate of the page video', async () => {
			const page = await openTestPage('video.html');
			await setRateNatively(page, 2);

			const popup = await openPopupForPage(page);

			expect(await popup.$eval('#no-videos', (el) => (el as HTMLElement).hidden)).toBe(true);
			expect(await popup.$eval('#slider-container', (el) => (el as HTMLElement).hidden)).toBe(false);
			expect(await getSliderValue(popup)).toBe(2);
		});

		it('shows the no-videos message on a page without videos', async () => {
			const popup = await openPopupForPage(await openTestPage('no-video.html'));

			const state = await popup.evaluate(() => ({
				noVideosHidden: document.querySelector<HTMLElement>('#no-videos')!.hidden,
				sliderHidden: document.querySelector<HTMLElement>('#slider-container')!.hidden,
				text: document.querySelector('#no-videos')!.textContent.trim()
			}));
			expect(state).toEqual({ noVideosHidden: false, sliderHidden: true, text: 'No videos found on this page' });
		});

		it('sets the rate of all videos and the badge when the slider is released', async () => {
			const { page, tabId } = await openReadyPage('multi-video.html');
			const popup = await openPopupForPage(page);

			await moveSlider(popup, 1.75);

			await expectRates(page, [1.75, 1.75, 1.75]);
			await expectBadge(tabId, '1.75');
		});

		it('controls videos inside same-origin and cross-site iframes', async () => {
			const page = await openTestPage('iframe-video.html');
			const frames = [await getIframe(page, '#video-iframe'), await getIframe(page, '#cross-site-iframe')];
			const popup = await openPopupForPage(page);
			expect(await popup.$eval('#slider-container', (el) => (el as HTMLElement).hidden)).toBe(false);

			await moveSlider(popup, 2);

			await Promise.all(frames.map((frame) => expectRates(frame, [2])));
		});

		it('keeps the badge in sync instead of resetting it when opened', async () => {
			const { page, tabId } = await openReadyPage('video.html');
			await setRateNatively(page, 2.5);
			await expectBadge(tabId, '2.5');

			const popup = await openPopupForPage(page);

			expect(await getSliderValue(popup)).toBe(2.5);
			expect(await getBadgeText(tabId)).toBe('2.5');
		});

		it('follows rate changes made on the page while open', async () => {
			const { page } = await openReadyPage('video.html');
			const popup = await openPopupForPage(page);
			expect(await getSliderValue(popup)).toBe(1);

			await setRateNatively(page, 2);

			await vi.waitFor(async () => expect(await getSliderValue(popup)).toBe(2), WAIT);
		});
	});

	describe('Popup tooltip', () => {
		let popup: Page;

		/** Tooltip state and whether it sits right of the slider handle. */
		const readTooltip = () =>
			popup.evaluate(() => {
				const tooltip = document.querySelector<HTMLElement>('#tooltip')!;
				const handle = document.querySelector('ui5-slider')!.shadowRoot!.querySelector('[part="handle"]')!;
				const tooltipRect = tooltip.getBoundingClientRect();
				const handleRect = handle.getBoundingClientRect();
				return {
					open: tooltip.matches(':popover-open'),
					text: tooltip.textContent,
					rightOfHandle: tooltipRect.left >= handleRect.right,
					leftOfHandle: tooltipRect.right <= handleRect.left
				};
			});
		const press = () => popup.$eval('ui5-slider', (s) => s.dispatchEvent(new Event('mousedown', { bubbles: true })));
		const release = () => popup.evaluate(() => document.dispatchEvent(new Event('mouseup')));

		beforeEach(async () => {
			popup = await openPopupForPage(await openTestPage('video.html'));
		});

		it('opens with the current value on press and closes on release', async () => {
			expect((await readTooltip()).open).toBe(false);

			await press();
			expect(await readTooltip()).toMatchObject({ open: true, text: '1×' });

			await release();
			expect((await readTooltip()).open).toBe(false);
		});

		it('follows the value while dragging', async () => {
			await press();
			await moveSlider(popup, 2, 'input');

			await vi.waitFor(async () => expect((await readTooltip()).text).toBe('2×'), WAIT);
		});

		it.each([
			[0.5, 'rightOfHandle'],
			[3, 'leftOfHandle']
		] as const)('at %d sits %s, away from the slider edge', async (value, side) => {
			await press();
			await moveSlider(popup, value, 'input');

			await vi.waitFor(async () => expect((await readTooltip())[side]).toBe(true), WAIT);
		});
	});

	describe('Native rate changes', () => {
		it('update badge and stored rate for each change', async () => {
			const { page, tabId } = await openReadyPage('video.html');
			await expectBadge(tabId, '1');

			const changeRate = async (rate: number) => {
				await setRateNatively(page, rate);
				await expectBadge(tabId, String(rate));
				expect(await getStorageValue('local', `playbackRate_${tabId}`)).toBe(rate);
			};
			await changeRate(0.5);
			await changeRate(1.75);
			await changeRate(3);
		});

		it('inside a cross-site iframe update the tab badge', async () => {
			const { page, tabId } = await openReadyPage('iframe-video.html');
			const frame = await getIframe(page, '#cross-site-iframe');

			await setRateNatively(frame, 2.25);

			await expectBadge(tabId, '2.25');
		});
	});

	describe('Context menu', () => {
		it('right-clicking a video checks the menu item matching its rate', async () => {
			const { page } = await openTwoVideoPage();
			await setRateNatively(page, 2.5, '#test-video');
			const checkedItems = await recordCheckedMenuItems();

			await page.click('#test-video', { button: 'right' });
			await page.keyboard.press('Escape');

			// Menu item ids are the rates
			await vi.waitFor(async () => expect(await checkedItems()).toContain('2.5'), WAIT);
		});

		it('choosing a speed changes only the right-clicked video and updates the badge', async () => {
			const { page, tabId } = await openTwoVideoPage();
			const [sourceChildSrc, srcAttrSrc] = await page.$$eval('video', (videos) =>
				videos.map((v) => (v as HTMLVideoElement).currentSrc)
			);

			// Video with a src attribute
			await chooseContextMenuItem(tabId, '2', srcAttrSrc!);
			await expectRates(page, [1, 2]);
			await expectBadge(tabId, '2');

			// Video with a <source> child (matched via currentSrc)
			await chooseContextMenuItem(tabId, '1.5', sourceChildSrc!);
			await expectRates(page, [1.5, 2]);
			await expectBadge(tabId, '1.5');
		});
	});

	describe('Badge setting', () => {
		it('disabling clears the badge on open tabs', async () => {
			const { page, tabId } = await openReadyPage('video.html');
			await setRateNatively(page, 2);
			await expectBadge(tabId, '2');

			await setSyncStorage({ badgeEnabled: false });

			await expectBadge(tabId, '');
		});

		it('while disabled no badge is shown; re-enabling restores it right away', async () => {
			await setSyncStorage({ badgeEnabled: false });
			const { page, tabId } = await openReadyPage('video.html');

			await setRateNatively(page, 1.5);
			await vi.waitFor(async () => expect(await getStorageValue('local', `playbackRate_${tabId}`)).toBe(1.5), WAIT);
			expect(await getBadgeText(tabId)).toBe('');

			await setSyncStorage({ badgeEnabled: true });
			await expectBadge(tabId, '1.5');
		});
	});

	describe('Default speed', () => {
		// No waitForContentScript here: the service worker's own injection (via the loader) must do the work
		it('applies to videos on load and after in-place navigation, with the badge following', async () => {
			await setSyncStorage({ defaults: { enabled: true, playbackRate: 1.75 } });

			const page = await openTestPage('iframe-video.html');
			const tabId = await getTabId(page);
			await expectRates(await getIframe(page, '#video-iframe'), [1.75]);
			await expectRates(await getIframe(page, '#cross-site-iframe'), [1.75]);
			await expectBadge(tabId, '1.75');

			await page.goto(`${TEST_SERVER_URL}/multi-video.html`, { waitUntil: 'networkidle0' });
			await expectRates(page, [1.75, 1.75, 1.75]);
			await expectBadge(tabId, '1.75');
		});

		it('applies to videos added to the page later', async () => {
			await setSyncStorage({ defaults: { enabled: true, playbackRate: 2.5 } });
			const { page } = await openReadyPage('no-video.html');

			await page.evaluate(() => document.body.append(document.createElement('video')));

			await expectRates(page, [2.5]);
		});

		it('is re-applied when the video source changes (SPA navigation)', async () => {
			await setSyncStorage({ defaults: { enabled: true, playbackRate: 1.5 } });
			const { page } = await openReadyPage('spa-video.html');
			await expectRates(page, [1.5]);
			await setRateNatively(page, 1);

			await page.click('#change-source');

			await expectRates(page, [1.5]);
		});

		it('is not applied when disabled, even with a stored speed', async () => {
			await setSyncStorage({ defaults: { enabled: false, playbackRate: 2 } });
			const { page } = await openReadyPage('spa-video.html');

			await page.click('#change-source');
			await page.waitForFunction(() => document.querySelector('video')!.readyState > 0);

			expect(await getVideoRates(page)).toEqual([1]);
		});
	});

	describe('Tab lifecycle', () => {
		it('clears the badge when navigating to another page', async () => {
			const { page, tabId } = await openReadyPage('video.html');
			await setRateNatively(page, 2);
			await expectBadge(tabId, '2');

			await page.goto(`${TEST_SERVER_URL}/no-video.html`, { waitUntil: 'networkidle0' });

			await expectBadge(tabId, '');
			// The old page's rate is forgotten, so re-enabling the badge doesn't bring it back
			await setSyncStorage({ badgeEnabled: false });
			await setSyncStorage({ badgeEnabled: true });
			await expectBadge(tabId, '');
			expect(await getStorageValue('local', `playbackRate_${tabId}`)).toBeUndefined();
		});

		it('removes the stored rate when the tab is closed', async () => {
			const { page, tabId } = await openReadyPage('video.html');
			await setRateNatively(page, 2);
			const key = `playbackRate_${tabId}`;
			await vi.waitFor(async () => expect(await getStorageValue('local', key)).toBe(2), WAIT);

			await page.close();

			await vi.waitFor(async () => expect(await getStorageValue('local', key)).toBeUndefined(), WAIT);
		});
	});
});
