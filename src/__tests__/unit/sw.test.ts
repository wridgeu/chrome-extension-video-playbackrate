import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { callsOf, chromeMock, mockStorage } from '@tests/unit/setup';
import { PLAYBACK_RATES, formatRate } from '@src/util/playback';
import { MessagingAction, type MessagingRequestPayload } from '@src/types';

type Listener<Args extends unknown[]> = (...args: Args) => unknown;

/** The listener registered on a mocked chrome event. */
function listenerOf(event: { addListener: { mock: { calls: unknown[][] } } }): never {
	const [call] = event.addListener.mock.calls;
	if (!call) throw new Error('listener not registered');
	return call[0] as never;
}

describe('Service Worker', () => {
	let setRateOfVideoWithSrc: (srcUrl: string, rate: number) => void;
	let onInstalled: Listener<[]>;
	let onClicked: Listener<[{ menuItemId: string; srcUrl?: string }, { id?: number } | undefined]>;
	let onUpdated: Listener<[number, { status?: string }]>;
	let onMessage: Listener<[MessagingRequestPayload | Record<string, unknown>, { tab?: { id: number } }]>;
	let onStorageChanged: Listener<[Record<string, { newValue?: unknown }>, string]>;
	let onRemoved: Listener<[number]>;
	let onBeforeNavigate: Listener<[{ tabId: number; frameId: number }]>;

	beforeAll(async () => {
		vi.resetModules();
		({ setRateOfVideoWithSrc } = await import('@src/sw'));

		// Capture listeners once; the per-test mock reset clears the registration calls
		onInstalled = listenerOf(chromeMock.runtime.onInstalled);
		onClicked = listenerOf(chromeMock.contextMenus.onClicked);
		onUpdated = listenerOf(chromeMock.tabs.onUpdated);
		onMessage = listenerOf(chromeMock.runtime.onMessage);
		onStorageChanged = listenerOf(chromeMock.storage.onChanged);
		onRemoved = listenerOf(chromeMock.tabs.onRemoved);
		onBeforeNavigate = listenerOf(chromeMock.webNavigation.onBeforeNavigate);
	});

	describe('onInstalled', () => {
		it('replaces the menu with one radio item per shared rate for videos, only 1× checked', async () => {
			await onInstalled();

			expect(chromeMock.contextMenus.removeAll).toHaveBeenCalledBefore(chromeMock.contextMenus.create);
			expect(
				callsOf<[chrome.contextMenus.CreateProperties]>(chromeMock.contextMenus.create).map(([item]) => item)
			).toEqual(
				PLAYBACK_RATES.map((rate) => ({
					id: String(rate),
					type: 'radio',
					title: formatRate(rate),
					contexts: ['video'],
					checked: rate === 1
				}))
			);
		});

		it('injects the content script into existing http(s) tabs that have an id', async () => {
			chromeMock.tabs.query.mockResolvedValue([{ id: 1 }, { id: undefined }, { id: 3 }]);

			await onInstalled();

			expect(chromeMock.tabs.query).toHaveBeenCalledWith({ url: ['http://*/*', 'https://*/*'] });
			const injectedTabIds = callsOf<[{ target: { tabId: number } }]>(chromeMock.scripting.executeScript).map(
				([details]) => details.target.tabId
			);
			expect(injectedTabIds).toEqual([1, 3]);
		});
	});

	describe('context menu click', () => {
		const srcUrl = 'https://example.com/video.mp4';

		it('sets the rate on the clicked video and syncs badge and storage', async () => {
			await onClicked({ menuItemId: '2', srcUrl }, { id: 123 });

			expect(chromeMock.scripting.executeScript).toHaveBeenCalledWith({
				target: { tabId: 123, allFrames: true },
				func: setRateOfVideoWithSrc,
				args: [srcUrl, 2]
			});
			expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId: 123 });
			expect(chromeMock.storage.local.set).toHaveBeenCalledWith({ playbackRate_123: 2 });
		});

		it.each([
			['unknown menu item', { menuItemId: 'invalid', srcUrl }, { id: 1 }],
			['rate outside the shared list', { menuItemId: '7', srcUrl }, { id: 1 }],
			['missing srcUrl', { menuItemId: '2' }, { id: 1 }],
			['missing tab', { menuItemId: '2', srcUrl }, undefined]
		])('ignores clicks with %s', async (_, itemData, tab) => {
			await onClicked(itemData, tab);

			expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
			expect(chromeMock.action.setBadgeText).not.toHaveBeenCalled();
		});
	});

	describe('setRateOfVideoWithSrc (injected into the page)', () => {
		it('changes only the video whose src matches', () => {
			document.body.innerHTML = '<video src="https://a.test/1.mp4"></video><video src="https://a.test/2.mp4"></video>';

			setRateOfVideoWithSrc('https://a.test/2.mp4', 1.75);

			const rates = Array.from(document.querySelectorAll('video'), (v) => v.playbackRate);
			expect(rates).toEqual([1, 1.75]);
		});

		it('does nothing when no video matches', () => {
			document.body.innerHTML = '<video src="https://a.test/1.mp4"></video>';

			setRateOfVideoWithSrc('https://a.test/other.mp4', 3);

			expect(document.querySelector('video')!.playbackRate).toBe(1);
		});
	});

	describe('content script injection on tab load', () => {
		it('injects once a tab completes loading, and only once per tab', () => {
			onUpdated(500, { status: 'loading' });
			onUpdated(500, { status: 'complete' });
			onUpdated(500, { status: 'complete' });

			expect(chromeMock.scripting.executeScript).toHaveBeenCalledExactlyOnceWith(
				{ target: { tabId: 500, allFrames: true }, files: ['/js/contentscript-loader.js'] },
				expect.any(Function)
			);
		});

		it('re-injects after a main frame navigation', () => {
			onUpdated(501, { status: 'complete' });
			onBeforeNavigate({ tabId: 501, frameId: 0 });
			onUpdated(501, { status: 'complete' });

			expect(chromeMock.scripting.executeScript).toHaveBeenCalledTimes(2);
		});
	});

	describe('UPDATE_UI message', () => {
		it('shows the rate on the sender tab badge, checks the closest menu item and stores the rate', async () => {
			onMessage({ action: MessagingAction.UPDATE_UI, playbackRate: 2 }, { tab: { id: 456 } });

			await vi.waitFor(() => {
				expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId: 456 });
			});
			expect(chromeMock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#F7B731', tabId: 456 });
			expect(chromeMock.contextMenus.update).toHaveBeenCalledWith('2', { checked: true }, expect.any(Function));
			expect(chromeMock.storage.local.set).toHaveBeenCalledWith({ playbackRate_456: 2 });
		});

		it('uses the tabId from the popup, which has no sender tab', async () => {
			onMessage({ action: MessagingAction.UPDATE_UI, playbackRate: 1.5, tabId: 789 }, {});

			await vi.waitFor(() => {
				expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '1.5', tabId: 789 });
			});
		});

		it('ignores a tabId in the payload when the message comes from a tab', async () => {
			onMessage({ action: MessagingAction.UPDATE_UI, playbackRate: 3, tabId: 999 }, { tab: { id: 1 } });

			await vi.waitFor(() => expect(chromeMock.action.setBadgeText).toHaveBeenCalled());
			expect(chromeMock.action.setBadgeText).not.toHaveBeenCalledWith(expect.objectContaining({ tabId: 999 }));
		});

		it('clears instead of showing the badge when the badge is disabled', async () => {
			mockStorage.badgeEnabled = false;

			onMessage({ action: MessagingAction.UPDATE_UI, playbackRate: 2 }, { tab: { id: 1 } });

			await vi.waitFor(() => {
				expect(chromeMock.action.setBadgeText).toHaveBeenCalledExactlyOnceWith({ text: '', tabId: 1 });
			});
		});

		it('ignores messages without a numeric playbackRate', () => {
			onMessage({ action: MessagingAction.UPDATE_UI, playbackRate: '2' }, { tab: { id: 1 } });

			expect(chromeMock.contextMenus.update).not.toHaveBeenCalled();
			expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
		});
	});

	it('UPDATE_CONTEXT_MENU checks the closest menu item without touching the badge', () => {
		onMessage({ action: MessagingAction.UPDATE_CONTEXT_MENU, playbackRate: 1.3 }, { tab: { id: 1 } });

		expect(chromeMock.contextMenus.update).toHaveBeenCalledWith('1.25', { checked: true }, expect.any(Function));
		expect(chromeMock.action.setBadgeText).not.toHaveBeenCalled();
	});

	describe('badge setting changes', () => {
		beforeEach(() => {
			chromeMock.tabs.query.mockResolvedValue([{ id: 1 }, { id: 2 }]);
		});

		it('clears the badge on all tabs when the badge gets disabled', async () => {
			await onStorageChanged({ badgeEnabled: { newValue: false } }, 'sync');

			expect(chromeMock.action.setBadgeText.mock.calls).toEqual([[{ text: '', tabId: 1 }], [{ text: '', tabId: 2 }]]);
		});

		it('restores the badge from the stored rates right away when the badge gets re-enabled', async () => {
			chromeMock.storage.local.get.mockResolvedValue({ playbackRate_1: 1.75 });

			await onStorageChanged({ badgeEnabled: { newValue: true } }, 'sync');

			expect(chromeMock.action.setBadgeText.mock.calls).toEqual([
				[{ text: '1.75', tabId: 1 }],
				[{ text: '', tabId: 2 }]
			]);
		});

		it.each([
			['another sync setting changes', { theme: { newValue: 'sap_horizon' } }, 'sync'],
			['the change is in local storage', { badgeEnabled: { newValue: false } }, 'local']
		])('leaves badges alone when %s', async (_, changes, area) => {
			await onStorageChanged(changes, area);

			expect(chromeMock.action.setBadgeText).not.toHaveBeenCalled();
		});
	});

	describe('tab lifecycle', () => {
		it('removes the stored rate when a tab is closed', () => {
			onRemoved(123);

			expect(chromeMock.storage.local.remove).toHaveBeenCalledWith('playbackRate_123');
		});

		it('does not re-inject after a subframe navigation', () => {
			onUpdated(502, { status: 'complete' });
			onBeforeNavigate({ tabId: 502, frameId: 1 });
			onUpdated(502, { status: 'complete' });

			expect(chromeMock.scripting.executeScript).toHaveBeenCalledOnce();
		});
	});
});
