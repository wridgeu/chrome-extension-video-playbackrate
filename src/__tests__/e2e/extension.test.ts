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

	it('loads with a valid extension ID', () => {
		expect(extensionId).toMatch(/^[a-p]{32}$/u);
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
			page = await openExtensionOptions(extensionId);
			await page.waitForSelector('#badgeEnabledCheckbox', { timeout: 10000 });
		});

		it('renders all controls', async () => {
			const missing = await page.evaluate(() =>
				['#defaultsEnabledCheckbox', '#defaultSpeedSelector', '#themeToggle'].filter((s) => !document.querySelector(s))
			);
			expect(missing).toEqual([]);
		});

		it('switches the page theme and remembers it', async () => {
			const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
			const before = await background();

			await page.click('#themeToggle');

			await vi.waitFor(async () => expect(await background()).not.toBe(before), WAIT);
			expect(await getStorageValue('sync', 'theme')).toMatch(/^sap_horizon/u);
		});

		it('has the badge enabled by default and saves turning it off', async () => {
			expect(await page.$eval('#badgeEnabledCheckbox', (el) => (el as HTMLInputElement).checked)).toBe(true);

			await page.click('#badgeEnabledCheckbox');

			await vi.waitFor(async () => expect(await getStorageValue('sync', 'badgeEnabled')).toBe(false), WAIT);
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

		it('controls videos inside iframes', async () => {
			const page = await openTestPage('iframe-video.html');
			const frame = await getIframe(page, '#video-iframe');
			const popup = await openPopupForPage(page);
			expect(await popup.$eval('#slider-container', (el) => (el as HTMLElement).hidden)).toBe(false);

			await moveSlider(popup, 2);

			await expectRates(frame, [2]);
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
			expect(await readTooltip()).toMatchObject({ open: true, text: '1x' });

			await release();
			expect((await readTooltip()).open).toBe(false);
		});

		it('follows the value while dragging', async () => {
			await press();
			await moveSlider(popup, 2, 'input');

			await vi.waitFor(async () => expect((await readTooltip()).text).toBe('2x'), WAIT);
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

		it('inside an iframe update the tab badge', async () => {
			const { page, tabId } = await openReadyPage('iframe-video.html');
			const frame = await getIframe(page, '#video-iframe');

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

			// Item '8' is "Ludicrous Speed (2.5x)"
			await vi.waitFor(async () => expect(await checkedItems()).toContain('8'), WAIT);
		});

		it('choosing a speed changes only the right-clicked video and updates the badge', async () => {
			const { page, tabId } = await openTwoVideoPage();
			const [sourceChildSrc, srcAttrSrc] = await page.$$eval('video', (videos) =>
				videos.map((v) => (v as HTMLVideoElement).currentSrc)
			);

			// Video with a src attribute; item '6' is "Ludicrous Speed (2x)"
			await chooseContextMenuItem(tabId, '6', srcAttrSrc!);
			await expectRates(page, [1, 2]);
			await expectBadge(tabId, '2');

			// Video with a <source> child (matched via currentSrc); item '5' is "High Speed (1.5x)"
			await chooseContextMenuItem(tabId, '5', sourceChildSrc!);
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

		it('while disabled no badge is shown; re-enabling shows it on the next change', async () => {
			await setSyncStorage({ badgeEnabled: false });
			const { page, tabId } = await openReadyPage('video.html');

			await setRateNatively(page, 1.5);
			await vi.waitFor(async () => expect(await getStorageValue('local', `playbackRate_${tabId}`)).toBe(1.5), WAIT);
			expect(await getBadgeText(tabId)).toBe('');

			await setSyncStorage({ badgeEnabled: true });
			await setRateNatively(page, 2);
			await expectBadge(tabId, '2');
		});
	});

	describe('Default speed', () => {
		it('applies to videos on load and after in-place navigation, with the badge following', async () => {
			await setSyncStorage({ defaults: { enabled: true, playbackRate: 1.75 } });

			const { page, tabId } = await openReadyPage('video.html');
			await expectRates(page, [1.75]);
			await expectBadge(tabId, '1.75');

			await page.goto(`${TEST_SERVER_URL}/multi-video.html`, { waitUntil: 'networkidle0' });
			await waitForContentScript(page);
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
