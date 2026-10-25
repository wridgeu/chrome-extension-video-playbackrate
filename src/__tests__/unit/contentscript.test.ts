import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chromeMock, mockStorage } from '@tests/unit/setup';
import { applyDefaultPlaybackRate, initContentScript } from '@src/contentscript';
import { MessagingAction } from '@src/types';

/** Append `count` fresh video elements to the body. */
function addVideos(count = 1): HTMLVideoElement[] {
	const videos = Array.from({ length: count }, () => document.createElement('video'));
	document.body.append(...videos);
	return videos;
}

const uiUpdate = (playbackRate: number) => ({ action: MessagingAction.UPDATE_UI, playbackRate });

describe('ContentScript', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	describe('applyDefaultPlaybackRate', () => {
		it('leaves videos untouched when defaults are disabled', async () => {
			mockStorage.defaults = { enabled: false, playbackRate: 2 };
			const [video] = addVideos();

			await applyDefaultPlaybackRate();

			expect(video!.playbackRate).toBe(1);
			expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
		});

		it('applies the default rate to all videos and reports it once', async () => {
			mockStorage.defaults = { enabled: true, playbackRate: 1.5 };
			const videos = addVideos(2);

			await applyDefaultPlaybackRate();

			expect(videos.map((v) => v.playbackRate)).toEqual([1.5, 1.5]);
			expect(chromeMock.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(uiUpdate(1.5));
		});

		it('falls back to 1x when defaults are enabled without a rate', async () => {
			mockStorage.defaults = { enabled: true };
			const [video] = addVideos();
			video!.playbackRate = 3;

			await applyDefaultPlaybackRate();

			expect(video!.playbackRate).toBe(1);
		});

		it('skips the storage lookup when there are no videos', async () => {
			mockStorage.defaults = { enabled: true, playbackRate: 2 };

			await applyDefaultPlaybackRate();

			expect(chromeMock.storage.sync.get).not.toHaveBeenCalled();
			expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
		});
	});

	describe('initContentScript', () => {
		it('reports the current rate of the first video', async () => {
			const [video] = addVideos();
			video!.playbackRate = 1.5;

			await initContentScript();

			expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(uiUpdate(1.5));
		});

		it('sends nothing when the page has no videos', async () => {
			await initContentScript();

			expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
		});

		it('reports native rate changes to the service worker', async () => {
			const [video] = addVideos();
			await initContentScript();
			chromeMock.runtime.sendMessage.mockClear();

			video!.playbackRate = 1.75;
			video!.dispatchEvent(new Event('ratechange'));

			expect(chromeMock.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(uiUpdate(1.75));
		});

		it('attaches listeners only once when initialized twice', async () => {
			const [video] = addVideos();
			await initContentScript();
			await initContentScript();
			chromeMock.runtime.sendMessage.mockClear();

			video!.dispatchEvent(new Event('ratechange'));

			expect(chromeMock.runtime.sendMessage).toHaveBeenCalledOnce();
		});

		it('applies the default rate to videos added later, including nested ones', async () => {
			mockStorage.defaults = { enabled: true, playbackRate: 2 };
			await initContentScript();

			const direct = addVideos()[0]!;
			const wrapper = document.createElement('div');
			const nested = document.createElement('video');
			wrapper.append(nested);
			document.body.append(wrapper);

			await vi.waitFor(() => {
				expect([direct.playbackRate, nested.playbackRate]).toEqual([2, 2]);
			});
		});

		it('re-applies the default rate when a video loads a new source', async () => {
			mockStorage.defaults = { enabled: true, playbackRate: 2 };
			const [video] = addVideos();
			await initContentScript();

			video!.playbackRate = 1;
			video!.dispatchEvent(new Event('loadstart'));

			await vi.waitFor(() => expect(video!.playbackRate).toBe(2));
		});

		it('syncs the context menu with the right-clicked video', async () => {
			const [video] = addVideos();
			video!.playbackRate = 2.5;
			await initContentScript();

			video!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

			expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
				action: MessagingAction.UPDATE_CONTEXT_MENU,
				playbackRate: 2.5
			});
		});

		it('swallows sendMessage failures', async () => {
			chromeMock.runtime.sendMessage.mockRejectedValue(new Error('Message failed'));
			addVideos();

			await expect(initContentScript()).resolves.toBeUndefined();
		});
	});
});
