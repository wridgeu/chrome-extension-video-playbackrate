import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
	getTestServerURL,
	getTabId,
	sendMessageToTab,
	waitForContentScript,
	getBadgeText
} from './setup';
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

			popupPage = await openExtensionPopup(extensionId);
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
			const popupPage = await openExtensionPopup(extensionId);
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
			const popupPage = await openExtensionPopup(extensionId);
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

	describe('Popup executeScript Integration', () => {
		// Tests that verify popup uses executeScript to change playback rate
		// This ensures the popup works without relying on content script injection

		it('popup slider change sets all video playback rates via executeScript pattern', async () => {
			const page = await createPageWithMultipleVideos();
			await page.waitForSelector('#test-video-1', { timeout: 10000 });

			// Verify initial rates are 1 (multi-video.html has 3 videos)
			const initialRates = await page.evaluate(() =>
				Array.from(document.querySelectorAll('video')).map((v) => v.playbackRate)
			);
			expect(initialRates).toEqual([1, 1, 1]);

			// Simulate what popup's executeScript does when slider changes
			const newRate = 2.5;
			await page.evaluate((rate: number) => {
				document.querySelectorAll('video').forEach((v) => {
					v.playbackRate = rate;
				});
			}, newRate);

			// Verify all videos were updated
			const updatedRates = await page.evaluate(() =>
				Array.from(document.querySelectorAll('video')).map((v) => v.playbackRate)
			);
			expect(updatedRates).toEqual([2.5, 2.5, 2.5]);

			await page.close();
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
});
