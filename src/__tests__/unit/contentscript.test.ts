import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chromeMock, resetChromeMocks } from '@tests/unit/setup';
import { applyDefaultPlaybackRate, initContentScript } from '@src/contentscript';
import { MessagingAction } from '@src/types';

describe('ContentScript', () => {
	beforeEach(() => {
		resetChromeMocks();
		document.body.innerHTML = '';
	});

	describe('applyDefaultPlaybackRate', () => {
		it('does nothing when defaults are not enabled', async () => {
			chromeMock.storage.sync.get.mockResolvedValue({
				defaults: { enabled: false, playbackRate: 2 }
			});

			const video = document.createElement('video');
			document.body.appendChild(video);

			await applyDefaultPlaybackRate();

			expect(video.playbackRate).toBe(1); // Default browser value
		});

		it('does nothing when no videos are present', async () => {
			chromeMock.storage.sync.get.mockResolvedValue({
				defaults: { enabled: true, playbackRate: 2 }
			});

			await applyDefaultPlaybackRate();

			expect(chromeMock.storage.sync.get).toHaveBeenCalledWith('defaults');
		});

		it('applies default playback rate to all videos', async () => {
			chromeMock.storage.sync.get.mockResolvedValue({
				defaults: { enabled: true, playbackRate: 1.5 }
			});

			const video1 = document.createElement('video');
			const video2 = document.createElement('video');
			document.body.appendChild(video1);
			document.body.appendChild(video2);

			await applyDefaultPlaybackRate();

			expect(video1.playbackRate).toBe(1.5);
			expect(video2.playbackRate).toBe(1.5);
		});

		it('uses default rate of 1 when playbackRate is not set', async () => {
			chromeMock.storage.sync.get.mockResolvedValue({
				defaults: { enabled: true }
			});

			const video = document.createElement('video');
			document.body.appendChild(video);

			await applyDefaultPlaybackRate();

			expect(video.playbackRate).toBe(1);
		});

		it('sets up MutationObserver for src attribute changes', async () => {
			vi.useFakeTimers();
			chromeMock.storage.sync.get.mockResolvedValue({
				defaults: { enabled: true, playbackRate: 2 }
			});

			const video = document.createElement('video');
			document.body.appendChild(video);

			await applyDefaultPlaybackRate();

			// Change src attribute
			video.src = 'https://example.com/video.mp4';

			// Wait for MutationObserver to trigger (microtask + any timers)
			await vi.runAllTimersAsync();

			expect(video.playbackRate).toBe(2);
			vi.useRealTimers();
		});
	});

	describe('initContentScript', () => {
		beforeEach(() => {
			// Setup default storage mock
			chromeMock.storage.sync.get.mockResolvedValue({ defaults: { enabled: false } });
		});

		it('registers message listener', () => {
			const video = document.createElement('video');
			document.body.appendChild(video);

			initContentScript();

			expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalled();
		});

		it('sends initial UI update when videos are present', async () => {
			const video = document.createElement('video');
			video.playbackRate = 1.5;
			document.body.appendChild(video);

			await initContentScript();

			expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
				action: MessagingAction.UPDATE_UI,
				playbackRate: 1.5
			});
		});

		it('does not send UI update when no videos are present', async () => {
			await initContentScript();

			// sendMessage should not be called for UI update (may be called for other reasons)
			const uiUpdateCall = chromeMock.runtime.sendMessage.mock.calls.find(
				(call) => call[0]?.action === MessagingAction.UPDATE_UI
			);
			expect(uiUpdateCall).toBeUndefined();
		});
	});

	describe('message handling (via initContentScript)', () => {
		let messageListener: (
			request: unknown,
			sender: chrome.runtime.MessageSender,
			sendResponse: (response?: unknown) => void
		) => void;

		beforeEach(async () => {
			chromeMock.storage.sync.get.mockResolvedValue({ defaults: { enabled: false } });

			const video = document.createElement('video');
			document.body.appendChild(video);

			await initContentScript();

			// Get the registered message listener
			messageListener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];
		});

		it('sets playback rate on all videos with SET action', () => {
			const video1 = document.createElement('video');
			const video2 = document.createElement('video');
			document.body.innerHTML = '';
			document.body.appendChild(video1);
			document.body.appendChild(video2);

			const sendResponse = () => {};
			messageListener(
				{ action: MessagingAction.SET, playbackRate: 2 },
				{} as chrome.runtime.MessageSender,
				sendResponse
			);

			expect(video1.playbackRate).toBe(2);
			expect(video2.playbackRate).toBe(2);
		});

		it('sets playback rate on specific video with SETSPECIFIC action', () => {
			const video1 = document.createElement('video');
			video1.src = 'https://example.com/video1.mp4';
			const video2 = document.createElement('video');
			video2.src = 'https://example.com/video2.mp4';
			document.body.innerHTML = '';
			document.body.appendChild(video1);
			document.body.appendChild(video2);

			const sendResponse = () => {};
			messageListener(
				{
					action: MessagingAction.SETSPECIFIC,
					playbackRate: 1.75,
					videoElementSrcAttributeValue: 'https://example.com/video2.mp4'
				},
				{} as chrome.runtime.MessageSender,
				sendResponse
			);

			expect(video1.playbackRate).toBe(1);
			expect(video2.playbackRate).toBe(1.75);
		});

		it('handles special characters in video src with SETSPECIFIC action', () => {
			const video = document.createElement('video');
			video.src = "https://example.com/video's.mp4";
			document.body.innerHTML = '';
			document.body.appendChild(video);

			const sendResponse = () => {};
			messageListener(
				{
					action: MessagingAction.SETSPECIFIC,
					playbackRate: 2,
					videoElementSrcAttributeValue: "https://example.com/video's.mp4"
				},
				{} as chrome.runtime.MessageSender,
				sendResponse
			);

			expect(video.playbackRate).toBe(2);
		});

		it('does not find videos with source child elements using SETSPECIFIC', () => {
			const video = document.createElement('video');
			const source = document.createElement('source');
			source.src = 'https://example.com/video.mp4';
			source.type = 'video/mp4';
			video.appendChild(source);
			document.body.innerHTML = '';
			document.body.appendChild(video);

			const sendResponse = () => {};
			messageListener(
				{
					action: MessagingAction.SETSPECIFIC,
					playbackRate: 2,
					videoElementSrcAttributeValue: 'https://example.com/video.mp4'
				},
				{} as chrome.runtime.MessageSender,
				sendResponse
			);

			expect(video.playbackRate).toBe(1);
		});

		it('retrieves current playback rate with RETRIEVE action', () => {
			const video = document.createElement('video');
			video.playbackRate = 2.5;
			document.body.innerHTML = '';
			document.body.appendChild(video);

			let response: unknown;
			const sendResponse = (r: unknown) => {
				response = r;
			};
			messageListener({ action: MessagingAction.RETRIEVE }, {} as chrome.runtime.MessageSender, sendResponse);

			expect(response).toEqual({
				playbackRate: 2.5,
				videoCount: 1
			});
		});

		it('returns default rate when no videos present with RETRIEVE action', () => {
			document.body.innerHTML = '';

			let response: unknown;
			const sendResponse = (r: unknown) => {
				response = r;
			};
			messageListener({ action: MessagingAction.RETRIEVE }, {} as chrome.runtime.MessageSender, sendResponse);

			expect(response).toEqual({
				playbackRate: 1,
				videoCount: 0
			});
		});

		it('counts all videos on page with RETRIEVE action', () => {
			const video1 = document.createElement('video');
			const video2 = document.createElement('video');
			const video3 = document.createElement('video');
			video1.playbackRate = 1.5;
			document.body.innerHTML = '';
			document.body.appendChild(video1);
			document.body.appendChild(video2);
			document.body.appendChild(video3);

			let response: unknown;
			const sendResponse = (r: unknown) => {
				response = r;
			};
			messageListener({ action: MessagingAction.RETRIEVE }, {} as chrome.runtime.MessageSender, sendResponse);

			expect(response).toEqual({
				playbackRate: 1.5,
				videoCount: 3
			});
		});
	});

	describe('rate change behavior (via initContentScript)', () => {
		beforeEach(() => {
			vi.useFakeTimers();
			chromeMock.storage.sync.get.mockResolvedValue({ defaults: { enabled: false } });
			chromeMock.runtime.sendMessage.mockResolvedValue({ tabId: 123 });
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('sends UPDATE_UI message when video rate changes', async () => {
			const video = document.createElement('video');
			document.body.appendChild(video);

			await initContentScript();
			chromeMock.runtime.sendMessage.mockClear();

			video.playbackRate = 1.75;
			video.dispatchEvent(new Event('ratechange'));

			await vi.runAllTimersAsync();

			expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
				action: MessagingAction.UPDATE_UI,
				playbackRate: 1.75
			});
		});

		it('stores playback rate in local storage when rate changes', async () => {
			const video = document.createElement('video');
			document.body.appendChild(video);

			await initContentScript();

			video.playbackRate = 2;
			video.dispatchEvent(new Event('ratechange'));

			await vi.runAllTimersAsync();

			expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
				playbackRate_123: 2
			});
		});

		it('handles sendMessage errors gracefully', async () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			chromeMock.runtime.sendMessage.mockRejectedValue(new Error('Message failed'));

			const video = document.createElement('video');
			document.body.appendChild(video);

			await initContentScript();

			video.playbackRate = 3;
			video.dispatchEvent(new Event('ratechange'));

			await vi.runAllTimersAsync();

			// Verify error was logged (in dev mode) rather than thrown
			expect(consoleWarnSpy).toHaveBeenCalledWith('Message send failed:', expect.any(Error));

			consoleWarnSpy.mockRestore();
		});
	});

	describe('error scenarios', () => {
		it('does nothing when SET action has no videos', async () => {
			chromeMock.storage.sync.get.mockResolvedValue({ defaults: { enabled: false } });
			document.body.innerHTML = '';

			await initContentScript();
			const messageListener = chromeMock.runtime.onMessage.addListener.mock.calls[0]?.[0];
			if (messageListener) {
				messageListener({ action: MessagingAction.SET, playbackRate: 2 }, {}, () => {});
			}
		});
	});
});
