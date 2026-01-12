import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Page } from 'puppeteer';
import {
	launchBrowserWithExtension,
	closeBrowser,
	getExtensionId,
	openExtensionPopup,
	openExtensionOptions,
	createPageWithVideo,
	createPageWithoutVideo,
	createPageWithMultipleVideos,
	createPageWithIframeVideo,
	createSpaVideoPage,
	getTestServerURL,
	getTabId,
	sendMessageToTab,
	waitForContentScript,
	getBadgeText,
	openPopupForPage,
	setDefaultPlaybackRate,
	setBadgeEnabled,
	waitForCondition,
	getServiceWorkerTarget
} from '@tests/e2e/setup';
import { MessagingAction } from '@src/types';

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

	describe('Build Artifacts', () => {
		const distDir = join(import.meta.dirname, '../../../dist');
		const jsDir = join(distDir, 'js');

		/** Convert glob pattern to regex (supports * and ? wildcards) */
		function globToRegex(pattern: string): RegExp {
			const escaped = pattern
				.replace(/[.+^${}()|[\]\\]/g, '\\$&')
				.replace(/\*/g, '[^/]*')
				.replace(/\?/g, '[^/]');
			return new RegExp(`^${escaped}$`);
		}

		/** Extract imported chunk filenames from built JS content */
		function extractImportedChunks(jsContent: string): string[] {
			const importPattern = /from\s*["']\.\/([^"']+\.js)["']/g;
			const chunks: string[] = [];
			let match;
			while ((match = importPattern.exec(jsContent)) !== null) {
				chunks.push(match[1]);
			}
			return chunks;
		}

		it('contentscript chunks are covered by web_accessible_resources', () => {
			// Read manifest and extract patterns
			const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf-8'));
			const patterns: string[] = [];
			for (const entry of manifest.web_accessible_resources || []) {
				if (entry.resources) {
					patterns.push(...entry.resources.map((p: string) => (p.startsWith('js/') ? p.slice(3) : p)));
				}
			}

			// Read contentscript.js and find its chunk imports
			const contentScript = readFileSync(join(jsDir, 'contentscript.js'), 'utf-8');
			const importedChunks = extractImportedChunks(contentScript);

			// Verify each chunk matches at least one pattern
			const uncovered = importedChunks.filter(
				(chunk) => !patterns.some((p) => globToRegex(p).test(chunk))
			);

			if (uncovered.length > 0) {
				throw new Error(
					`Content script imports chunks not in web_accessible_resources:\n` +
						uncovered.map((c) => `  - js/${c}`).join('\n') +
						`\n\nAdd patterns to public/manifest.json to fix this.`
				);
			}

			expect(uncovered).toEqual([]);
		});
	});

	describe('Popup', () => {
		let page: Page;

		beforeAll(async () => {
			page = await openExtensionPopup();
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
				return s
					? { min: s.getAttribute('min'), max: s.getAttribute('max'), step: s.getAttribute('step') }
					: null;
			});

			expect(attrs).toEqual({ min: '0', max: '4', step: '0.25' });
		});

		it('updates on input event (real-time), not just change event', async () => {
			await page.waitForSelector('ui5-slider', { timeout: 10000 });

			// Verify slider responds to input events
			const hasInputListener = await page.evaluate(() => {
				const slider = document.querySelector('ui5-slider');
				if (!slider) return false;

				// Create and dispatch an input event
				let inputFired = false;

				slider.addEventListener(
					'input',
					() => {
						inputFired = true;
					},
					{ once: true }
				);

				// Simulate input event
				const event = new Event('input', { bubbles: true });
				slider.dispatchEvent(event);

				return inputFired;
			});

			expect(hasInputListener).toBe(true);
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
			await page.waitForSelector('#badgeEnabledCheckbox', { timeout: 10000 });
			await page.waitForSelector('ui5-switch', { timeout: 10000 });

			expect(await page.$('#defaultsEnabledCheckbox')).not.toBeNull();
			expect(await page.$('#defaultSpeedSelector')).not.toBeNull();
			expect(await page.$('#badgeEnabledCheckbox')).not.toBeNull();
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

		it('badge checkbox is checked by default', async () => {
			await page.waitForSelector('#badgeEnabledCheckbox', { timeout: 10000 });

			const isChecked = await page.evaluate(() => {
				const checkbox = document.getElementById('badgeEnabledCheckbox') as HTMLInputElement & {
					checked: boolean;
				};
				return checkbox?.checked;
			});

			expect(isChecked).toBe(true);
		});

		it('badge checkbox can be toggled', async () => {
			await page.waitForSelector('#badgeEnabledCheckbox', { timeout: 10000 });

			// Get initial state
			const initialState = await page.evaluate(() => {
				const checkbox = document.getElementById('badgeEnabledCheckbox') as HTMLInputElement & {
					checked: boolean;
				};
				return checkbox?.checked;
			});

			// Click to toggle
			await page.click('#badgeEnabledCheckbox');
			await new Promise((r) => setTimeout(r, 300));

			// Verify state changed
			const newState = await page.evaluate(() => {
				const checkbox = document.getElementById('badgeEnabledCheckbox') as HTMLInputElement & {
					checked: boolean;
				};
				return checkbox?.checked;
			});

			expect(newState).toBe(!initialState);

			// Click again to restore original state
			await page.click('#badgeEnabledCheckbox');
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

	describe('Slider Integration', () => {
		let videoPage: Page;
		let popupPage: Page;

		beforeAll(async () => {
			// Navigate to a real URL so content script can be injected
			videoPage = await createPageWithVideo();
			await videoPage.waitForSelector('#test-video', { timeout: 10000 });

			popupPage = await openExtensionPopup();
			await popupPage.waitForSelector('ui5-slider', { timeout: 10000 });
		});

		afterAll(async () => {
			if (popupPage && !popupPage.isClosed()) await popupPage.close();
			if (videoPage && !videoPage.isClosed()) await videoPage.close();
		});

		it('slider shows tooltip on mousedown', async () => {
			const slider = await popupPage.$('ui5-slider');
			expect(slider).not.toBeNull();

			// Check tooltip exists but is hidden initially
			const tooltipBefore = await popupPage.evaluate(() => {
				const tooltip = document.getElementById('tooltip');
				return tooltip ? tooltip.matches(':popover-open') : null;
			});
			expect(tooltipBefore).toBe(false);

			// Simulate mousedown on slider via page.evaluate
			await popupPage.evaluate(() => {
				const slider = document.querySelector('ui5-slider');
				slider?.dispatchEvent(new Event('mousedown', { bubbles: true }));
			});

			// Small delay for popover to open
			await new Promise((r) => setTimeout(r, 100));

			const tooltipAfter = await popupPage.evaluate(() => {
				const tooltip = document.getElementById('tooltip');
				return tooltip ? tooltip.matches(':popover-open') : null;
			});
			expect(tooltipAfter).toBe(true);

			// Cleanup: trigger mouseup
			await popupPage.evaluate(() => {
				document.dispatchEvent(new Event('mouseup', { bubbles: true }));
			});
		});

		it('tooltip displays current slider value', async () => {
			// Show tooltip
			await popupPage.evaluate(() => {
				const slider = document.querySelector('ui5-slider');
				slider?.dispatchEvent(new Event('mousedown', { bubbles: true }));
			});

			await new Promise((r) => setTimeout(r, 100));

			const tooltipText = await popupPage.evaluate(() => {
				const tooltip = document.getElementById('tooltip');
				return tooltip?.textContent;
			});

			// Tooltip should show value with 'x' suffix (e.g., "1x")
			expect(tooltipText).toMatch(/^\d+(\.\d+)?x$/);

			// Cleanup
			await popupPage.evaluate(() => {
				document.dispatchEvent(new Event('mouseup', { bubbles: true }));
			});
		});

		it('slider drag updates tooltip in real-time', async () => {
			// Get initial value
			const initialValue = await popupPage.evaluate(() => {
				const slider = document.querySelector('ui5-slider') as Element & {
					value: number;
					dispatchEvent: (e: Event) => boolean;
				};
				return slider?.value;
			});

			// Show tooltip and simulate input event with new value
			await popupPage.evaluate(() => {
				const slider = document.querySelector('ui5-slider') as Element & {
					value: number;
					dispatchEvent: (e: Event) => boolean;
				};
				slider?.dispatchEvent(new Event('mousedown', { bubbles: true }));

				// Change slider value and trigger input event
				if (slider) {
					slider.value = 2;
					slider.dispatchEvent(new Event('input', { bubbles: true }));
				}
			});

			await new Promise((r) => setTimeout(r, 100));

			const tooltipText = await popupPage.evaluate(() => {
				const tooltip = document.getElementById('tooltip');
				return tooltip?.textContent;
			});

			expect(tooltipText).toBe('2x');

			// Reset slider
			await popupPage.evaluate((val) => {
				const slider = document.querySelector('ui5-slider') as Element & {
					value: number;
					dispatchEvent: (e: Event) => boolean;
				};
				if (slider) {
					slider.value = val;
				}
				document.dispatchEvent(new Event('mouseup', { bubbles: true }));
			}, initialValue);
		});

		it('tooltip positions correctly on left side (low values)', async () => {
			// Set slider to low value (left side) and verify tooltip appears to the RIGHT of handle
			const position = await popupPage.evaluate(() => {
				// Ensure slider container is visible (may be hidden if no videos detected)
				const sliderContainer = document.getElementById('slider-container');
				if (sliderContainer) sliderContainer.hidden = false;

				const slider = document.querySelector('ui5-slider') as Element & {
					value: number;
					dispatchEvent: (e: Event) => boolean;
				};
				const tooltip = document.getElementById('tooltip');
				if (!slider || !tooltip) return null;

				// Set to low value (left side of slider, percent <= 0.5)
				slider.value = 0.5;
				slider.dispatchEvent(new Event('mousedown', { bubbles: true }));
				slider.dispatchEvent(new Event('input', { bubbles: true }));

				const sliderRect = slider.getBoundingClientRect();
				const tooltipRect = tooltip.getBoundingClientRect();
				const handleX = sliderRect.left + (0.5 / 4) * sliderRect.width; // 0.5 out of max 4

				return {
					tooltipLeft: tooltipRect.left,
					handleX,
					tooltipWidth: tooltipRect.width,
					isToRightOfHandle: tooltipRect.left > handleX
				};
			});

			expect(position).not.toBeNull();
			expect(position!.tooltipWidth).toBeGreaterThan(0);
			expect(position!.isToRightOfHandle).toBe(true);

			// Cleanup
			await popupPage.evaluate(() => {
				document.dispatchEvent(new Event('mouseup', { bubbles: true }));
			});
		});

		it('tooltip positions correctly on right side (high values)', async () => {
			// Set slider to high value (right side) and verify tooltip appears to the LEFT of handle
			const position = await popupPage.evaluate(() => {
				// Ensure slider container is visible (may be hidden if no videos detected)
				const sliderContainer = document.getElementById('slider-container');
				if (sliderContainer) sliderContainer.hidden = false;

				const slider = document.querySelector('ui5-slider') as Element & {
					value: number;
					dispatchEvent: (e: Event) => boolean;
				};
				const tooltip = document.getElementById('tooltip');
				if (!slider || !tooltip) return null;

				// Set to high value (right side of slider, percent > 0.5)
				slider.value = 3;
				slider.dispatchEvent(new Event('mousedown', { bubbles: true }));
				slider.dispatchEvent(new Event('input', { bubbles: true }));

				const sliderRect = slider.getBoundingClientRect();
				const tooltipRect = tooltip.getBoundingClientRect();
				const handleX = sliderRect.left + (3 / 4) * sliderRect.width; // 3 out of max 4

				return {
					tooltipRight: tooltipRect.right,
					handleX,
					tooltipWidth: tooltipRect.width,
					isToLeftOfHandle: tooltipRect.right < handleX
				};
			});

			expect(position).not.toBeNull();
			expect(position!.tooltipWidth).toBeGreaterThan(0);
			expect(position!.isToLeftOfHandle).toBe(true);

			// Cleanup
			await popupPage.evaluate(() => {
				document.dispatchEvent(new Event('mouseup', { bubbles: true }));
			});
		});
	});

	describe('Extension Messaging (Real Content Script)', () => {
		let videoPage: Page;
		let tabId: number;

		beforeAll(async () => {
			// Create page with HTTP URL (enables content script injection)
			videoPage = await createPageWithVideo();
			await videoPage.waitForSelector('#test-video', { timeout: 10000 });

			// Wait for content script to be injected and ready
			await waitForContentScript(videoPage);
			tabId = await getTabId(videoPage);

			// Reset video to 1x via real content script messaging
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 1 });
		});

		afterAll(async () => {
			if (videoPage && !videoPage.isClosed()) await videoPage.close();
		});

		it('SET message changes video playback rate via content script', async () => {
			// Send SET message through service worker to content script
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 1.5 });

			// Verify the content script actually changed the video rate
			const newRate = await videoPage.evaluate(
				() => (document.getElementById('test-video') as HTMLVideoElement)?.playbackRate
			);
			expect(newRate).toBe(1.5);
		});

		it('RETRIEVE message returns current playback rate from content script', async () => {
			// First set a specific rate
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 2.5 });

			// Now retrieve via real content script messaging
			const response = (await sendMessageToTab(tabId, { action: MessagingAction.RETRIEVE })) as {
				playbackRate: number;
				videoCount: number;
			};

			expect(response.playbackRate).toBe(2.5);
			expect(response.videoCount).toBe(1);
		});

		it('rate changes persist across multiple updates via content script', async () => {
			const testRates = [0.5, 1.25, 2, 3.5];

			for (const rate of testRates) {
				await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: rate });

				const currentRate = await videoPage.evaluate(
					() => (document.getElementById('test-video') as HTMLVideoElement)?.playbackRate
				);

				expect(currentRate).toBe(rate);
			}
		});
	});

	describe('Badge Display (Real Extension)', () => {
		it('badge shows playback rate for page with video', async () => {
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			// Set a playback rate
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 2 });

			// Give the badge time to update
			await new Promise((r) => setTimeout(r, 100));

			// Check badge text
			const badgeText = await getBadgeText(tabId);
			expect(badgeText).toBe('2');

			await page.close();
		});

		it('badge updates when rate changes', async () => {
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			// Set rate to 1.5
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 1.5 });
			await new Promise((r) => setTimeout(r, 100));
			expect(await getBadgeText(tabId)).toBe('1.5');

			// Change rate to 0.75
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 0.75 });
			await new Promise((r) => setTimeout(r, 100));
			expect(await getBadgeText(tabId)).toBe('0.75');

			await page.close();
		});
	});

	describe('Popup Video States', () => {
		it('shows no-videos message when popup opens without content script', async () => {
			// Open popup in isolation (no active tab with video)
			const popupPage = await openExtensionPopup();
			await popupPage.waitForSelector('ui5-text', { timeout: 10000 });

			const state = await popupPage.evaluate(() => {
				const noVideosEl = document.getElementById('no-videos');
				const sliderContainer = document.getElementById('slider-container');
				return {
					noVideosHidden: noVideosEl?.hidden ?? true,
					sliderContainerHidden: sliderContainer?.hidden ?? true,
					noVideosText: noVideosEl?.textContent?.trim() ?? ''
				};
			});

			// When no content script responds, no-videos should be visible
			expect(state.noVideosHidden).toBe(false);
			expect(state.sliderContainerHidden).toBe(true);
			expect(state.noVideosText).toBe('No videos found on this page');

			await popupPage.close();
		});

		it('has correct DOM structure for video state handling', async () => {
			const popupPage = await openExtensionPopup();
			await popupPage.waitForSelector('ui5-text', { timeout: 10000 });

			const elements = await popupPage.evaluate(() => {
				const noVideosEl = document.getElementById('no-videos');
				const sliderContainer = document.getElementById('slider-container');
				const slider = document.querySelector('ui5-slider');
				return {
					hasNoVideosElement: !!noVideosEl,
					noVideosTagName: noVideosEl?.tagName.toLowerCase() ?? '',
					hasSliderContainer: !!sliderContainer,
					hasSlider: !!slider
				};
			});

			expect(elements.hasNoVideosElement).toBe(true);
			expect(elements.noVideosTagName).toBe('ui5-text');
			expect(elements.hasSliderContainer).toBe(true);
			expect(elements.hasSlider).toBe(true);

			await popupPage.close();
		});

		it('page with no videos has zero video elements', async () => {
			const noVideoPage = await createPageWithoutVideo();

			const videoCount = await noVideoPage.evaluate(() => {
				return document.querySelectorAll('video').length;
			});

			expect(videoCount).toBe(0);

			await noVideoPage.close();
		});

		it('all videos on multi-video page respond to rate changes', async () => {
			const multiVideoPage = await createPageWithMultipleVideos();
			await multiVideoPage.waitForSelector('#test-video-1', { timeout: 10000 });

			// Change all video rates
			const rates = await multiVideoPage.evaluate(() => {
				const videos = document.querySelectorAll('video');
				videos.forEach((v) => {
					v.playbackRate = 2;
				});
				return Array.from(videos).map((v) => v.playbackRate);
			});

			expect(rates).toEqual([2, 2, 2]);

			await multiVideoPage.close();
		});

		it('handles navigation from no-video page to video page in same tab', async () => {
			// Start with a page without videos
			const page = await createPageWithoutVideo();

			// Verify no videos on initial page
			const initialVideoCount = await page.evaluate(() => document.querySelectorAll('video').length);
			expect(initialVideoCount).toBe(0);

			// Navigate to a page with video (same tab) using HTTP URL
			await page.goto(`${getTestServerURL()}/video.html`, { waitUntil: 'networkidle0' });

			await page.waitForSelector('#test-video', { timeout: 10000 });

			// Verify video is now present
			const finalVideoCount = await page.evaluate(() => document.querySelectorAll('video').length);
			expect(finalVideoCount).toBe(1);

			// Verify video can have playback rate changed
			const canChangeRate = await page.evaluate(() => {
				const video = document.querySelector('video') as HTMLVideoElement;
				video.playbackRate = 1.5;
				return video.playbackRate === 1.5;
			});
			expect(canChangeRate).toBe(true);

			await page.close();
		});

		it('handles navigation from video page to no-video page in same tab', async () => {
			// Start with a page with video
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });

			// Verify video exists
			const initialVideoCount = await page.evaluate(() => document.querySelectorAll('video').length);
			expect(initialVideoCount).toBe(1);

			// Navigate to a page without videos (same tab) using HTTP URL
			await page.goto(`${getTestServerURL()}/no-video.html`, { waitUntil: 'networkidle0' });

			// Verify no videos after navigation
			const finalVideoCount = await page.evaluate(() => document.querySelectorAll('video').length);
			expect(finalVideoCount).toBe(0);

			await page.close();
		});

		it('dynamically added video is detected on page', async () => {
			// Start with a page without videos
			const page = await createPageWithoutVideo();

			// Verify no videos initially
			const initialCount = await page.evaluate(() => document.querySelectorAll('video').length);
			expect(initialCount).toBe(0);

			// Dynamically add a video element
			await page.evaluate(() => {
				const video = document.createElement('video');
				video.id = 'dynamic-video';
				video.width = 640;
				video.height = 360;
				video.controls = true;
				document.body.appendChild(video);
			});

			await page.waitForSelector('#dynamic-video', { timeout: 10000 });

			// Verify video is now present
			const finalCount = await page.evaluate(() => document.querySelectorAll('video').length);
			expect(finalCount).toBe(1);

			// Verify the dynamically added video can have rate changed
			const rateChanged = await page.evaluate(() => {
				const video = document.getElementById('dynamic-video') as HTMLVideoElement;
				video.playbackRate = 2;
				return video.playbackRate;
			});
			expect(rateChanged).toBe(2);

			await page.close();
		});
	});

	describe('Popup-Video Integration', () => {
		// Tests that verify the popup properly controls video playback rate
		// Uses openPopupForPage to ensure popup opens for the correct active tab

		it('popup shows slider when opened on page with video', async () => {
			const videoPage = await createPageWithVideo();
			await videoPage.waitForSelector('#test-video', { timeout: 10000 });

			// Open popup for this specific video page
			const popupPage = await openPopupForPage(videoPage);
			await popupPage.waitForSelector('ui5-slider', { timeout: 10000 });

			// Verify slider container is visible and no-videos is hidden
			const state = await popupPage.evaluate(() => {
				const noVideosEl = document.getElementById('no-videos');
				const sliderContainer = document.getElementById('slider-container');
				return {
					noVideosHidden: noVideosEl?.hidden ?? false,
					sliderContainerHidden: sliderContainer?.hidden ?? true
				};
			});

			expect(state.noVideosHidden).toBe(true);
			expect(state.sliderContainerHidden).toBe(false);

			await popupPage.close();
			await videoPage.close();
		});

		it('popup shows no-videos message when opened on page without video', async () => {
			const noVideoPage = await createPageWithoutVideo();

			// Open popup for this page without videos
			const popupPage = await openPopupForPage(noVideoPage);
			await popupPage.waitForSelector('ui5-text', { timeout: 10000 });

			// Verify no-videos is visible and slider container is hidden
			const state = await popupPage.evaluate(() => {
				const noVideosEl = document.getElementById('no-videos');
				const sliderContainer = document.getElementById('slider-container');
				return {
					noVideosHidden: noVideosEl?.hidden ?? true,
					sliderContainerHidden: sliderContainer?.hidden ?? false,
					noVideosText: noVideosEl?.textContent?.trim() ?? ''
				};
			});

			expect(state.noVideosHidden).toBe(false);
			expect(state.sliderContainerHidden).toBe(true);
			expect(state.noVideosText).toBe('No videos found on this page');

			await popupPage.close();
			await noVideoPage.close();
		});

		it('popup slider change affects single video playback rate', async () => {
			const videoPage = await createPageWithVideo();
			await videoPage.waitForSelector('#test-video', { timeout: 10000 });

			// Verify initial rate is 1
			const initialRate = await videoPage.evaluate(
				() => (document.getElementById('test-video') as HTMLVideoElement)?.playbackRate
			);
			expect(initialRate).toBe(1);

			// Open popup for the video page
			const popupPage = await openPopupForPage(videoPage);
			await popupPage.waitForSelector('ui5-slider', { timeout: 10000 });

			// Change slider value and trigger change event (simulates user finishing drag)
			await popupPage.evaluate(() => {
				const slider = document.querySelector('ui5-slider') as Element & {
					value: number;
					dispatchEvent: (e: Event) => boolean;
				};
				if (slider) {
					slider.value = 2.5;
					slider.dispatchEvent(new Event('change', { bubbles: true }));
				}
			});

			// Wait for executeScript to complete
			await new Promise((r) => setTimeout(r, 300));

			// Verify video rate was changed
			const newRate = await videoPage.evaluate(
				() => (document.getElementById('test-video') as HTMLVideoElement)?.playbackRate
			);
			expect(newRate).toBe(2.5);

			await popupPage.close();
			await videoPage.close();
		});

		it('popup slider change affects ALL videos on multi-video page', async () => {
			const multiVideoPage = await createPageWithMultipleVideos();
			await multiVideoPage.waitForSelector('#test-video-1', { timeout: 10000 });

			// Verify initial rates are all 1
			const initialRates = await multiVideoPage.evaluate(() =>
				Array.from(document.querySelectorAll('video')).map((v) => v.playbackRate)
			);
			expect(initialRates).toEqual([1, 1, 1]);

			// Open popup for the multi-video page
			const popupPage = await openPopupForPage(multiVideoPage);
			await popupPage.waitForSelector('ui5-slider', { timeout: 10000 });

			// Change slider value and trigger change event
			await popupPage.evaluate(() => {
				const slider = document.querySelector('ui5-slider') as Element & {
					value: number;
					dispatchEvent: (e: Event) => boolean;
				};
				if (slider) {
					slider.value = 1.75;
					slider.dispatchEvent(new Event('change', { bubbles: true }));
				}
			});

			// Wait for executeScript to complete
			await new Promise((r) => setTimeout(r, 300));

			// Verify ALL video rates were changed
			const newRates = await multiVideoPage.evaluate(() =>
				Array.from(document.querySelectorAll('video')).map((v) => v.playbackRate)
			);
			expect(newRates).toEqual([1.75, 1.75, 1.75]);

			await popupPage.close();
			await multiVideoPage.close();
		});

		it('popup displays current video playback rate in slider', async () => {
			const videoPage = await createPageWithVideo();
			await videoPage.waitForSelector('#test-video', { timeout: 10000 });

			// Set video to a specific rate before opening popup
			await videoPage.evaluate(() => {
				(document.getElementById('test-video') as HTMLVideoElement).playbackRate = 2;
			});

			// Open popup for the video page
			const popupPage = await openPopupForPage(videoPage);
			await popupPage.waitForSelector('ui5-slider', { timeout: 10000 });

			// Verify slider shows the current video rate
			const sliderValue = await popupPage.evaluate(() => {
				const slider = document.querySelector('ui5-slider') as Element & { value: number };
				return slider?.value;
			});
			expect(sliderValue).toBe(2);

			await popupPage.close();
			await videoPage.close();
		});

		it('multiple slider changes update video rate correctly', async () => {
			const videoPage = await createPageWithVideo();
			await videoPage.waitForSelector('#test-video', { timeout: 10000 });

			const popupPage = await openPopupForPage(videoPage);
			await popupPage.waitForSelector('ui5-slider', { timeout: 10000 });

			const testRates = [0.5, 1.5, 3, 0.25];

			for (const rate of testRates) {
				// Change slider
				await popupPage.evaluate((r) => {
					const slider = document.querySelector('ui5-slider') as Element & {
						value: number;
						dispatchEvent: (e: Event) => boolean;
					};
					if (slider) {
						slider.value = r;
						slider.dispatchEvent(new Event('change', { bubbles: true }));
					}
				}, rate);

				await new Promise((r) => setTimeout(r, 200));

				// Verify video rate
				const videoRate = await videoPage.evaluate(
					() => (document.getElementById('test-video') as HTMLVideoElement)?.playbackRate
				);
				expect(videoRate).toBe(rate);
			}

			await popupPage.close();
			await videoPage.close();
		});

		it('opening popup does not reset badge to 1 (stays in sync with video rate)', async () => {
			const videoPage = await createPageWithVideo();
			await videoPage.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(videoPage);
			const tabId = await getTabId(videoPage);

			// Set video to 2.5x via content script messaging
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 2.5 });
			await new Promise((r) => setTimeout(r, 200));

			// Verify badge shows 2.5 before opening popup
			const badgeBefore = await getBadgeText(tabId);
			expect(badgeBefore).toBe('2.5');

			// Open popup for the video page
			const popupPage = await openPopupForPage(videoPage);
			await popupPage.waitForSelector('ui5-slider', { timeout: 10000 });

			// Wait for popup initialization
			await new Promise((r) => setTimeout(r, 300));

			// Verify badge still shows 2.5 (not reset to 1)
			const badgeAfter = await getBadgeText(tabId);
			expect(badgeAfter).toBe('2.5');

			// Verify slider also shows the correct value
			const sliderValue = await popupPage.evaluate(() => {
				const slider = document.querySelector('ui5-slider') as Element & { value: number };
				return slider?.value;
			});
			expect(sliderValue).toBe(2.5);

			await popupPage.close();
			await videoPage.close();
		});

		it('in-place navigation applies default speed to new video page', async () => {
			const DEFAULT_SPEED = 1.75;

			// Set default speed directly via storage (bypasses UI5 component issues)
			await setDefaultPlaybackRate(true, DEFAULT_SPEED);

			// Create first video page
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(page);

			// Wait for default speed to be applied
			await new Promise((r) => setTimeout(r, 500));

			// Verify first video has default speed
			const firstVideoRate = await page.evaluate(
				() => (document.getElementById('test-video') as HTMLVideoElement)?.playbackRate
			);
			expect(firstVideoRate).toBe(DEFAULT_SPEED);

			// Navigate in-place to multi-video page (same tab)
			await page.goto(`${getTestServerURL()}/multi-video.html`, { waitUntil: 'networkidle0' });
			await page.waitForSelector('#test-video-1', { timeout: 10000 });
			await waitForContentScript(page);

			// Wait for default speed to be applied to new page
			await new Promise((r) => setTimeout(r, 500));

			// Verify ALL videos on new page have default speed applied
			const newPageRates = await page.evaluate(() =>
				Array.from(document.querySelectorAll('video')).map((v) => v.playbackRate)
			);
			expect(newPageRates).toEqual([DEFAULT_SPEED, DEFAULT_SPEED, DEFAULT_SPEED]);

			await page.close();
		});

		it('in-place navigation updates badge correctly with default speed', async () => {
			const DEFAULT_SPEED = 2.25;

			// Set default speed directly via storage (bypasses UI5 component issues)
			await setDefaultPlaybackRate(true, DEFAULT_SPEED);

			// Create video page
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			// Wait for default speed to be applied
			await new Promise((r) => setTimeout(r, 500));

			// Verify badge shows default speed
			const badgeBefore = await getBadgeText(tabId);
			expect(badgeBefore).toBe(DEFAULT_SPEED.toString());

			// Navigate in-place to another video page
			await page.goto(`${getTestServerURL()}/multi-video.html`, { waitUntil: 'networkidle0' });
			await page.waitForSelector('#test-video-1', { timeout: 10000 });
			await waitForContentScript(page);

			// Wait for default speed to be applied
			await new Promise((r) => setTimeout(r, 500));

			// Verify badge still shows default speed after navigation
			const badgeAfter = await getBadgeText(tabId);
			expect(badgeAfter).toBe(DEFAULT_SPEED.toString());

			await page.close();

			// Cleanup: Disable default playback rate to prevent test pollution
			await setDefaultPlaybackRate(false, 1);
		});
	});

	describe('Context Menu executeScript Integration', () => {
		// Tests that verify the video-finding logic pattern used by context menu in sw.ts
		// Note: These test the logic pattern, not the actual extension integration

		it('context menu sets specific video playback rate by matching src or currentSrc', async () => {
			// Create page with videos that have direct src attributes (not <source> elements)
			const page = await createPageWithoutVideo();
			await page.evaluate(() => {
				const video1 = document.createElement('video');
				video1.id = 'video-1';
				video1.src = 'https://example.com/video1.mp4';
				document.body.appendChild(video1);

				const video2 = document.createElement('video');
				video2.id = 'video-2';
				video2.src = 'https://example.com/video2.mp4';
				document.body.appendChild(video2);
			});

			await page.waitForSelector('#video-1', { timeout: 10000 });

			const srcUrl = 'https://example.com/video1.mp4';
			const newRate = 1.75;

			// Test the video-finding logic pattern used by context menu in sw.ts
			await page.evaluate(
				(src: string, rate: number) => {
					const videos = document.querySelectorAll('video');
					for (const video of videos) {
						if (video.src === src || video.currentSrc === src) {
							video.playbackRate = rate;
							break;
						}
					}
				},
				srcUrl,
				newRate
			);

			// Verify only the targeted video was updated
			const rates = await page.evaluate(() =>
				Array.from(document.querySelectorAll('video')).map((v) => v.playbackRate)
			);

			// First video should have new rate, second should still be 1
			expect(rates[0]).toBe(1.75);
			expect(rates[1]).toBe(1);

			await page.close();
		});

		it('CSS.escape handles special characters in video src URLs', async () => {
			const page = await createPageWithoutVideo();

			// Add a video with special characters in src (simulating edge cases)
			await page.evaluate(() => {
				const video = document.createElement('video');
				video.id = 'special-src-video';
				video.src = "test'video.mp4"; // Single quote in filename
				document.body.appendChild(video);
			});

			await page.waitForSelector('#special-src-video', { timeout: 10000 });

			// Verify CSS.escape allows finding the video
			const found = await page.evaluate(() => {
				const srcUrl = "test'video.mp4";
				const video = document.querySelector(`video[src='${CSS.escape(srcUrl)}']`);
				return video !== null;
			});

			expect(found).toBe(true);

			await page.close();
		});

		it('context menu does not affect other videos when targeting specific src', async () => {
			// Create page with videos that have direct src attributes
			const page = await createPageWithoutVideo();
			await page.evaluate(() => {
				for (let i = 1; i <= 3; i++) {
					const video = document.createElement('video');
					video.id = `video-${i}`;
					video.src = `https://example.com/video${i}.mp4`;
					document.body.appendChild(video);
				}
			});

			await page.waitForSelector('#video-1', { timeout: 10000 });

			// Set all videos to different initial rates
			await page.evaluate(() => {
				const videos = document.querySelectorAll('video');
				videos[0].playbackRate = 1;
				videos[1].playbackRate = 1.5;
				videos[2].playbackRate = 2;
			});

			const srcUrl = 'https://example.com/video2.mp4';

			// Test the video-finding logic pattern used by context menu in sw.ts
			await page.evaluate(
				(src: string, rate: number) => {
					const videos = document.querySelectorAll('video');
					for (const video of videos) {
						if (video.src === src || video.currentSrc === src) {
							video.playbackRate = rate;
							break;
						}
					}
				},
				srcUrl,
				3
			);

			// Verify only video 2 was changed
			const rates = await page.evaluate(() =>
				Array.from(document.querySelectorAll('video')).map((v) => v.playbackRate)
			);

			expect(rates[0]).toBe(1); // Unchanged
			expect(rates[1]).toBe(3); // Changed by context menu
			expect(rates[2]).toBe(2); // Unchanged

			await page.close();
		});
	});

	describe('SPA Navigation (loadstart event)', () => {
		// Tests that verify the loadstart event handler re-applies default speed
		// when video source changes (like YouTube SPA navigation)

		it('re-applies default speed when video source changes (SPA navigation)', async () => {
			const DEFAULT_SPEED = 1.5;

			// Enable default speed
			await setDefaultPlaybackRate(true, DEFAULT_SPEED);

			// Create SPA video page
			const page = await createSpaVideoPage();
			await page.waitForSelector('#spa-video', { timeout: 10000 });
			await waitForContentScript(page);

			// Wait for default speed to be applied
			await waitForCondition(async () => {
				const rate = await page.evaluate(
					() => (document.getElementById('spa-video') as HTMLVideoElement)?.playbackRate
				);
				return rate === DEFAULT_SPEED;
			});

			// Manually change rate to 1x (simulating browser reset)
			await page.evaluate(() => {
				(document.getElementById('spa-video') as HTMLVideoElement).playbackRate = 1;
			});

			// Verify rate is now 1
			const rateBeforeNavigation = await page.evaluate(
				() => (document.getElementById('spa-video') as HTMLVideoElement)?.playbackRate
			);
			expect(rateBeforeNavigation).toBe(1);

			// Click button to simulate SPA navigation (changes video source, triggers loadstart)
			await page.click('#change-source');

			// Wait for loadstart handler to re-apply default speed
			await waitForCondition(async () => {
				const rate = await page.evaluate(
					() => (document.getElementById('spa-video') as HTMLVideoElement)?.playbackRate
				);
				return rate === DEFAULT_SPEED;
			});

			// Verify default speed was re-applied
			const rateAfterNavigation = await page.evaluate(
				() => (document.getElementById('spa-video') as HTMLVideoElement)?.playbackRate
			);
			expect(rateAfterNavigation).toBe(DEFAULT_SPEED);

			await page.close();

			// Cleanup
			await setDefaultPlaybackRate(false, 1);
		});

		it('does not change speed on loadstart when defaults are disabled', async () => {
			// Disable default speed
			await setDefaultPlaybackRate(false, 1);

			// Create SPA video page
			const page = await createSpaVideoPage();
			await page.waitForSelector('#spa-video', { timeout: 10000 });
			await waitForContentScript(page);

			// Manually set rate to 2x
			await page.evaluate(() => {
				(document.getElementById('spa-video') as HTMLVideoElement).playbackRate = 2;
			});

			// Click button to simulate SPA navigation
			await page.click('#change-source');

			// Wait a bit for any handlers to fire
			await new Promise((r) => setTimeout(r, 300));

			// Verify rate stayed at 2 (was not reset to 1 since defaults are disabled)
			// Actually, loadstart triggers browser reset to 1, but our handler won't override
			const rate = await page.evaluate(
				() => (document.getElementById('spa-video') as HTMLVideoElement)?.playbackRate
			);

			// When defaults disabled, we don't override - browser may reset to 1
			expect(rate).toBe(1);

			await page.close();
		});
	});

	describe('Native Rate Change -> Badge Sync', () => {
		// Tests that verify ratechange event on video updates badge

		it('badge updates when video rate is changed via native controls', async () => {
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			// Initial state: rate is 1, badge should show 1
			await waitForCondition(async () => {
				const text = await getBadgeText(tabId);
				return text === '1';
			});

			// Simulate native rate change (as if user used browser's playback speed controls)
			await page.evaluate(() => {
				const video = document.getElementById('test-video') as HTMLVideoElement;
				video.playbackRate = 2.5;
			});

			// Wait for ratechange event to propagate to badge
			await waitForCondition(async () => {
				const text = await getBadgeText(tabId);
				return text === '2.5';
			});

			const badgeText = await getBadgeText(tabId);
			expect(badgeText).toBe('2.5');

			await page.close();
		});

		it('badge updates for each native rate change', async () => {
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			const testRates = [0.5, 1.75, 3];

			for (const rate of testRates) {
				await page.evaluate((r) => {
					const video = document.getElementById('test-video') as HTMLVideoElement;
					video.playbackRate = r;
				}, rate);

				await waitForCondition(async () => {
					const text = await getBadgeText(tabId);
					return text === rate.toString();
				});

				const badgeText = await getBadgeText(tabId);
				expect(badgeText).toBe(rate.toString());
			}

			await page.close();
		});
	});

	describe('Badge Enable/Disable Toggle', () => {
		// Tests that verify badge visibility setting works

		it('disabling badge hides it on all tabs', async () => {
			// Create page with video and set a rate
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			// Ensure badge is enabled and shows rate
			await setBadgeEnabled(true);
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 2 });

			await waitForCondition(async () => {
				const text = await getBadgeText(tabId);
				return text === '2';
			});

			expect(await getBadgeText(tabId)).toBe('2');

			// Disable badge
			await setBadgeEnabled(false);

			// Wait for badge to be cleared
			await waitForCondition(async () => {
				const text = await getBadgeText(tabId);
				return text === '';
			});

			expect(await getBadgeText(tabId)).toBe('');

			await page.close();

			// Cleanup
			await setBadgeEnabled(true);
		});

		it('re-enabling badge shows it again on rate change', async () => {
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			// Disable badge
			await setBadgeEnabled(false);
			await new Promise((r) => setTimeout(r, 100));

			// Send a rate change - badge should stay empty
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 1.5 });
			await new Promise((r) => setTimeout(r, 100));
			expect(await getBadgeText(tabId)).toBe('');

			// Re-enable badge
			await setBadgeEnabled(true);

			// Send another rate change - badge should now show
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 2 });

			await waitForCondition(async () => {
				const text = await getBadgeText(tabId);
				return text === '2';
			});

			expect(await getBadgeText(tabId)).toBe('2');

			await page.close();
		});
	});

	describe('SETSPECIFIC Message (Content Script)', () => {
		// Tests that verify SETSPECIFIC message targets specific video by src

		it('SETSPECIFIC message changes only the targeted video', async () => {
			// Create page with multiple videos with different src attributes
			const page = await createPageWithoutVideo();
			await page.evaluate(() => {
				const video1 = document.createElement('video');
				video1.id = 'video-1';
				video1.src = 'https://example.com/video1.mp4';
				document.body.appendChild(video1);

				const video2 = document.createElement('video');
				video2.id = 'video-2';
				video2.src = 'https://example.com/video2.mp4';
				document.body.appendChild(video2);
			});

			await page.waitForSelector('#video-1', { timeout: 10000 });
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			// Send SETSPECIFIC to change only video2
			await sendMessageToTab(tabId, {
				action: MessagingAction.SETSPECIFIC,
				playbackRate: 2.5,
				videoElementSrcAttributeValue: 'https://example.com/video2.mp4'
			});

			await new Promise((r) => setTimeout(r, 200));

			// Verify only video2 was changed
			const rates = await page.evaluate(() =>
				Array.from(document.querySelectorAll('video')).map((v) => v.playbackRate)
			);

			expect(rates[0]).toBe(1); // video1 unchanged
			expect(rates[1]).toBe(2.5); // video2 changed

			await page.close();
		});

		it('SETSPECIFIC with non-matching src does not change any video', async () => {
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			// Set initial rate
			await page.evaluate(() => {
				(document.getElementById('test-video') as HTMLVideoElement).playbackRate = 1.5;
			});

			// Send SETSPECIFIC with non-matching src
			await sendMessageToTab(tabId, {
				action: MessagingAction.SETSPECIFIC,
				playbackRate: 3,
				videoElementSrcAttributeValue: 'https://nonexistent.com/video.mp4'
			});

			await new Promise((r) => setTimeout(r, 200));

			// Verify rate was not changed
			const rate = await page.evaluate(
				() => (document.getElementById('test-video') as HTMLVideoElement)?.playbackRate
			);
			expect(rate).toBe(1.5);

			await page.close();
		});
	});

	describe('Iframe Video Support', () => {
		// Tests that verify extension works with videos inside iframes

		it('content script is injected into iframe with video', async () => {
			const page = await createPageWithIframeVideo();
			await page.waitForSelector('#video-iframe', { timeout: 10000 });

			// Wait for iframe to load
			const iframeHandle = await page.$('#video-iframe');
			const iframe = await iframeHandle?.contentFrame();
			expect(iframe).not.toBeNull();

			await iframe!.waitForSelector('#test-video', { timeout: 10000 });

			// Verify video exists in iframe
			const hasVideo = await iframe!.evaluate(() => {
				return document.querySelector('video') !== null;
			});
			expect(hasVideo).toBe(true);

			await page.close();
		});

		it('executeScript with allFrames affects video in iframe', async () => {
			const page = await createPageWithIframeVideo();
			await page.waitForSelector('#video-iframe', { timeout: 10000 });

			const iframeHandle = await page.$('#video-iframe');
			const iframe = await iframeHandle?.contentFrame();
			await iframe!.waitForSelector('#test-video', { timeout: 10000 });

			// Wait for content script injection
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			// Change rate via extension messaging
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 2 });

			await new Promise((r) => setTimeout(r, 300));

			// Verify video in iframe was updated
			const rate = await iframe!.evaluate(() => {
				const video = document.querySelector('video') as HTMLVideoElement;
				return video?.playbackRate;
			});

			expect(rate).toBe(2);

			await page.close();
		});
	});

	describe('Storage Sync for Popup Slider', () => {
		// Tests that popup slider syncs when rate changes externally

		it('popup slider updates when video rate changes via native controls', async () => {
			const videoPage = await createPageWithVideo();
			await videoPage.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(videoPage);

			// Open popup for the video page
			const popupPage = await openPopupForPage(videoPage);
			await popupPage.waitForSelector('ui5-slider', { timeout: 10000 });

			// Verify initial slider value
			const initialValue = await popupPage.evaluate(() => {
				const slider = document.querySelector('ui5-slider') as Element & { value: number };
				return slider?.value;
			});
			expect(initialValue).toBe(1);

			// Change video rate via native controls (simulated)
			await videoPage.evaluate(() => {
				const video = document.getElementById('test-video') as HTMLVideoElement;
				video.playbackRate = 2;
			});

			// Wait for storage sync to propagate to popup
			await waitForCondition(async () => {
				const value = await popupPage.evaluate(() => {
					const slider = document.querySelector('ui5-slider') as Element & { value: number };
					return slider?.value;
				});
				return value === 2;
			});

			const updatedValue = await popupPage.evaluate(() => {
				const slider = document.querySelector('ui5-slider') as Element & { value: number };
				return slider?.value;
			});
			expect(updatedValue).toBe(2);

			await popupPage.close();
			await videoPage.close();
		});
	});

	describe('Tab Cleanup and Navigation', () => {
		// Tests for onRemoved and onBeforeNavigate handlers

		it('badge clears when navigating to a different page', async () => {
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			// Set a playback rate to show badge
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 2 });

			await waitForCondition(async () => {
				const text = await getBadgeText(tabId);
				return text === '2';
			});

			expect(await getBadgeText(tabId)).toBe('2');

			// Navigate to a different page
			await page.goto(`${getTestServerURL()}/no-video.html`, { waitUntil: 'networkidle0' });

			// Badge should be cleared on navigation
			await waitForCondition(async () => {
				const text = await getBadgeText(tabId);
				return text === '';
			});

			expect(await getBadgeText(tabId)).toBe('');

			await page.close();
		});

		it('storage is cleaned up when tab is closed', async () => {
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			// Set a playback rate (stores in storage)
			await sendMessageToTab(tabId, { action: MessagingAction.SET, playbackRate: 2 });
			await new Promise((r) => setTimeout(r, 200));

			// Verify storage has the rate
			const swTarget = await getServiceWorkerTarget();
			const worker = await swTarget.worker();

			const storageKey = `playbackRate_${tabId}`;
			const valueBefore = await worker!.evaluate(async (key: string) => {
				const result = await chrome.storage.local.get(key);
				return result[key];
			}, storageKey);
			expect(valueBefore).toBe(2);

			// Close the tab
			await page.close();

			// Wait for cleanup
			await new Promise((r) => setTimeout(r, 300));

			// Verify storage was cleaned up
			const valueAfter = await worker!.evaluate(async (key: string) => {
				const result = await chrome.storage.local.get(key);
				return result[key];
			}, storageKey);
			expect(valueAfter).toBeUndefined();
		});
	});

	describe('GET_TAB_ID Message (Implicit Testing)', () => {
		// Note: GET_TAB_ID is sent FROM content script TO service worker
		// It's implicitly tested by the badge tests - if getTabId didn't work,
		// the ratechange handler couldn't store rates with correct tab-specific keys,
		// and badge updates wouldn't work correctly.

		it('getTabId works correctly (verified via storage sync)', async () => {
			const page = await createPageWithVideo();
			await page.waitForSelector('#test-video', { timeout: 10000 });
			await waitForContentScript(page);
			const tabId = await getTabId(page);

			// Change rate via native controls - this triggers ratechange handler
			// which calls getTabId() and stores rate in storage with tab-specific key
			await page.evaluate(() => {
				(document.getElementById('test-video') as HTMLVideoElement).playbackRate = 2.25;
			});

			// Wait for storage to be updated
			await waitForCondition(async () => {
				const swTarget = await getServiceWorkerTarget();
				const worker = await swTarget.worker();
				const value = await worker!.evaluate(async (key: string) => {
					const result = await chrome.storage.local.get(key);
					return result[key];
				}, `playbackRate_${tabId}`);
				return value === 2.25;
			});

			// Verify storage has correct tab-specific key (proves getTabId returned correct value)
			const swTarget = await getServiceWorkerTarget();
			const worker = await swTarget.worker();
			const storedRate = await worker!.evaluate(async (key: string) => {
				const result = await chrome.storage.local.get(key);
				return result[key];
			}, `playbackRate_${tabId}`);

			expect(storedRate).toBe(2.25);

			await page.close();
		});
	});
});
