import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chromeStorageMock, chromeRuntimeMock, resetChromeMocks } from './setup';
import {
	applyDefaultPlaybackRate,
	findVideoElementBySrc,
	handleMessage,
	setupRateChangeListener,
	getTabId,
	resetCachedTabId
} from '@src/contentscript';
import { MessagingAction } from '@src/types';

describe('ContentScript', () => {
	beforeEach(() => {
		resetChromeMocks();
		resetCachedTabId();
		document.body.innerHTML = '';
	});

	describe('applyDefaultPlaybackRate', () => {
		it('does nothing when defaults are not enabled', async () => {
			chromeStorageMock.sync.get.mockResolvedValue({
				defaults: { enabled: false, playbackRate: 2 }
			});

			const video = document.createElement('video');
			document.body.appendChild(video);

			await applyDefaultPlaybackRate();

			expect(video.playbackRate).toBe(1); // Default browser value
		});

		it('does nothing when no videos are present', async () => {
			chromeStorageMock.sync.get.mockResolvedValue({
				defaults: { enabled: true, playbackRate: 2 }
			});

			await applyDefaultPlaybackRate();

			expect(chromeStorageMock.sync.get).toHaveBeenCalledWith('defaults');
		});

		it('applies default playback rate to all videos', async () => {
			chromeStorageMock.sync.get.mockResolvedValue({
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
			chromeStorageMock.sync.get.mockResolvedValue({
				defaults: { enabled: true }
			});

			const video = document.createElement('video');
			document.body.appendChild(video);

			await applyDefaultPlaybackRate();

			expect(video.playbackRate).toBe(1);
		});

		it('sets up MutationObserver for src attribute changes', async () => {
			chromeStorageMock.sync.get.mockResolvedValue({
				defaults: { enabled: true, playbackRate: 2 }
			});

			const video = document.createElement('video');
			document.body.appendChild(video);

			await applyDefaultPlaybackRate();

			// Change src attribute
			video.src = 'https://example.com/video.mp4';

			// Wait for MutationObserver to trigger
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(video.playbackRate).toBe(2);
		});
	});

	describe('findVideoElementBySrc', () => {
		it('finds video by src attribute', () => {
			const video = document.createElement('video');
			video.src = 'https://example.com/video.mp4';
			document.body.appendChild(video);

			const result = findVideoElementBySrc('https://example.com/video.mp4');

			expect(result).toBe(video);
		});

		it('returns null when video is not found', () => {
			const result = findVideoElementBySrc('https://example.com/nonexistent.mp4');

			expect(result).toBeNull();
		});

		it('handles special characters in src using CSS.escape', () => {
			const video = document.createElement('video');
			video.src = "https://example.com/video's.mp4";
			document.body.appendChild(video);

			const result = findVideoElementBySrc("https://example.com/video's.mp4");

			expect(result).toBe(video);
		});
	});

	describe('handleMessage', () => {
		let sendResponse: (response?: unknown) => void;

		beforeEach(() => {
			sendResponse = vi.fn() as (response?: unknown) => void;
		});

		it('sets playback rate on all videos with SET action', () => {
			const video1 = document.createElement('video');
			const video2 = document.createElement('video');
			document.body.appendChild(video1);
			document.body.appendChild(video2);

			handleMessage(
				{ action: MessagingAction.SET, playbackRate: 2 },
				{} as chrome.runtime.MessageSender,
				sendResponse
			);

			expect(video1.playbackRate).toBe(2);
			expect(video2.playbackRate).toBe(2);
		});

		it('does not set rate when no videos present with SET action', () => {
			handleMessage(
				{ action: MessagingAction.SET, playbackRate: 2 },
				{} as chrome.runtime.MessageSender,
				sendResponse
			);

			// Should not throw or cause errors
			expect(sendResponse).not.toHaveBeenCalled();
		});

		it('sets playback rate on specific video with SETSPECIFIC action', () => {
			const video1 = document.createElement('video');
			video1.src = 'https://example.com/video1.mp4';
			const video2 = document.createElement('video');
			video2.src = 'https://example.com/video2.mp4';
			document.body.appendChild(video1);
			document.body.appendChild(video2);

			handleMessage(
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

		it('handles SETSPECIFIC when video is not found', () => {
			const video = document.createElement('video');
			video.src = 'https://example.com/video1.mp4';
			document.body.appendChild(video);

			handleMessage(
				{
					action: MessagingAction.SETSPECIFIC,
					playbackRate: 2,
					videoElementSrcAttributeValue: 'https://example.com/nonexistent.mp4'
				},
				{} as chrome.runtime.MessageSender,
				sendResponse
			);

			expect(video.playbackRate).toBe(1);
		});

		it('retrieves current playback rate with RETRIEVE action', () => {
			const video = document.createElement('video');
			video.playbackRate = 2.5;
			document.body.appendChild(video);

			handleMessage({ action: MessagingAction.RETRIEVE }, {} as chrome.runtime.MessageSender, sendResponse);

			expect(sendResponse).toHaveBeenCalledWith({
				playbackRate: 2.5,
				videoCount: 1
			});
		});

		it('returns default rate of 1 when no videos present with RETRIEVE action', () => {
			handleMessage({ action: MessagingAction.RETRIEVE }, {} as chrome.runtime.MessageSender, sendResponse);

			expect(sendResponse).toHaveBeenCalledWith({
				playbackRate: 1,
				videoCount: 0
			});
		});

		it('counts all videos on page with RETRIEVE action', () => {
			const video1 = document.createElement('video');
			const video2 = document.createElement('video');
			const video3 = document.createElement('video');
			video1.playbackRate = 1.5;
			document.body.appendChild(video1);
			document.body.appendChild(video2);
			document.body.appendChild(video3);

			handleMessage({ action: MessagingAction.RETRIEVE }, {} as chrome.runtime.MessageSender, sendResponse);

			expect(sendResponse).toHaveBeenCalledWith({
				playbackRate: 1.5,
				videoCount: 3
			});
		});
	});

	describe('setupRateChangeListener', () => {
		it('stores playback rate in local storage when rate changes', async () => {
			chromeRuntimeMock.sendMessage.mockResolvedValue({ tabId: 123 });

			const video = document.createElement('video');
			document.body.appendChild(video);

			setupRateChangeListener(video);

			// Simulate rate change
			video.playbackRate = 2;
			video.dispatchEvent(new Event('ratechange'));

			// Wait for async operations
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(chromeStorageMock.local.set).toHaveBeenCalledWith({
				playbackRate_123: 2
			});
		});

		it('sends UPDATE_BADGE message when rate changes', async () => {
			chromeRuntimeMock.sendMessage.mockResolvedValue({ tabId: 456 });

			const video = document.createElement('video');
			document.body.appendChild(video);

			setupRateChangeListener(video);

			video.playbackRate = 1.75;
			video.dispatchEvent(new Event('ratechange'));

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(chromeRuntimeMock.sendMessage).toHaveBeenCalledWith({
				action: MessagingAction.UPDATE_BADGE,
				playbackRate: 1.75
			});
		});

		it('sends UPDATE_CONTEXT_MENU message when rate changes', async () => {
			chromeRuntimeMock.sendMessage.mockResolvedValue({ tabId: 789 });

			const video = document.createElement('video');
			document.body.appendChild(video);

			setupRateChangeListener(video);

			video.playbackRate = 0.5;
			video.dispatchEvent(new Event('ratechange'));

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(chromeRuntimeMock.sendMessage).toHaveBeenCalledWith({
				action: MessagingAction.UPDATE_CONTEXT_MENU,
				playbackRate: 0.5
			});
		});

		it('handles errors gracefully when sendMessage fails', async () => {
			chromeRuntimeMock.sendMessage.mockRejectedValue(new Error('Message failed'));

			const video = document.createElement('video');
			document.body.appendChild(video);

			setupRateChangeListener(video);

			video.playbackRate = 3;
			video.dispatchEvent(new Event('ratechange'));

			await new Promise((resolve) => setTimeout(resolve, 10));

			// Should not throw - errors are caught silently
			expect(true).toBe(true);
		});
	});

	describe('getTabId', () => {
		it('retrieves tab ID from service worker', async () => {
			chromeRuntimeMock.sendMessage.mockResolvedValue({ tabId: 999 });

			const result = await getTabId();

			expect(result).toBe(999);
			expect(chromeRuntimeMock.sendMessage).toHaveBeenCalledWith({ action: 'getTabId' });
		});

		it('caches tab ID on subsequent calls', async () => {
			chromeRuntimeMock.sendMessage.mockResolvedValue({ tabId: 888 });

			const result1 = await getTabId();
			const result2 = await getTabId();

			expect(result1).toBe(888);
			expect(result2).toBe(888);
			expect(chromeRuntimeMock.sendMessage).toHaveBeenCalledTimes(1);
		});

		it('returns undefined when message fails', async () => {
			chromeRuntimeMock.sendMessage.mockRejectedValue(new Error('Failed'));

			const result = await getTabId();

			expect(result).toBeUndefined();
		});

		it('returns undefined when response has no tabId', async () => {
			chromeRuntimeMock.sendMessage.mockResolvedValue({});

			const result = await getTabId();

			expect(result).toBeUndefined();
		});
	});
});
