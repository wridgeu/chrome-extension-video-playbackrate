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
	let onMessage: Listener<[MessagingRequestPayload | Record<string, unknown>, { tab?: { id: number } }]>;
	let onStorageChanged: Listener<[Record<string, { newValue?: unknown }>, string]>;
	let onRemoved: Listener<[number]>;
	let onCommitted: Listener<[{ tabId: number; frameId: number }]>;

	beforeAll(async () => {
		vi.resetModules();
		({ setRateOfVideoWithSrc } = await import('@src/sw'));

		// Capture listeners once; the per-test mock reset clears the registration calls
		onInstalled = listenerOf(chromeMock.runtime.onInstalled);
		onClicked = listenerOf(chromeMock.contextMenus.onClicked);
		onMessage = listenerOf(chromeMock.runtime.onMessage);
		onStorageChanged = listenerOf(chromeMock.storage.onChanged);
		onRemoved = listenerOf(chromeMock.tabs.onRemoved);
		onCommitted = listenerOf(chromeMock.webNavigation.onCommitted);
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

		it('injects the self-contained content script into existing http(s) tabs that have an id', async () => {
			chromeMock.tabs.query.mockResolvedValue([{ id: 1 }, { id: undefined }, { id: 3 }]);

			await onInstalled();

			expect(chromeMock.tabs.query).toHaveBeenCalledWith({ url: ['http://*/*', 'https://*/*'] });
			expect(
				callsOf<[{ target: { tabId: number; allFrames: boolean }; files: string[] }]>(
					chromeMock.scripting.executeScript
				)
			).toEqual([
				[{ target: { tabId: 1, allFrames: true }, files: ['/js/contentscript.js'] }],
				[{ target: { tabId: 3, allFrames: true }, files: ['/js/contentscript.js'] }]
			]);
		});

		it('continues injecting remaining tabs when one tab rejects executeScript', async () => {
			chromeMock.tabs.query.mockResolvedValue([{ id: 1 }, { id: 2 }]);
			chromeMock.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access page'));

			await expect(onInstalled()).resolves.toBeUndefined();
			expect(chromeMock.scripting.executeScript).toHaveBeenCalledTimes(2);
		});
	});

	describe('context menu click', () => {
		const srcUrl = 'https://example.com/video.mp4';

		it('sets the rate on the clicked video and syncs badge and session storage', async () => {
			await onClicked({ menuItemId: '2', srcUrl }, { id: 123 });

			expect(chromeMock.scripting.executeScript).toHaveBeenCalledWith({
				target: { tabId: 123, allFrames: true },
				func: setRateOfVideoWithSrc,
				args: [srcUrl, 2]
			});
			expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId: 123 });
			expect(chromeMock.storage.session.set).toHaveBeenCalledWith({ playbackRate_123: 2 });
		});

		it('handles executeScript rejection without throwing', async () => {
			chromeMock.scripting.executeScript.mockRejectedValueOnce(new Error('No tab with id'));

			await expect(onClicked({ menuItemId: '2', srcUrl }, { id: 123 })).resolves.toBeUndefined();
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

	describe('UPDATE_UI message', () => {
		it('shows the rate on the sender tab badge, checks the closest menu item and stores the rate in session', async () => {
			onMessage({ action: MessagingAction.UPDATE_UI, playbackRate: 2 }, { tab: { id: 456 } });

			await vi.waitFor(() => {
				expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId: 456 });
			});
			expect(chromeMock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#F7B731', tabId: 456 });
			expect(chromeMock.contextMenus.update).toHaveBeenCalledWith('2', { checked: true }, expect.any(Function));
			expect(chromeMock.storage.session.set).toHaveBeenCalledWith({ playbackRate_456: 2 });
		});

		it('rounds non-step rates cleanly on the badge', async () => {
			onMessage({ action: MessagingAction.UPDATE_UI, playbackRate: 1.3333333 }, { tab: { id: 456 } });

			await vi.waitFor(() => {
				expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '1.33', tabId: 456 });
			});
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
			expect(chromeMock.storage.session.set).not.toHaveBeenCalled();
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

		it('restores the badge from the stored session rates right away when the badge gets re-enabled', async () => {
			chromeMock.storage.session.get.mockResolvedValue({ playbackRate_1: 1.75 });

			await onStorageChanged({ badgeEnabled: { newValue: true } }, 'sync');

			expect(chromeMock.action.setBadgeText.mock.calls).toEqual([
				[{ text: '1.75', tabId: 1 }],
				[{ text: '', tabId: 2 }]
			]);
		});

		it('continues updating remaining tabs if a tab closes mid-update', async () => {
			chromeMock.action.setBadgeText.mockRejectedValueOnce(new Error('No tab with id: 1'));

			await expect(onStorageChanged({ badgeEnabled: { newValue: false } }, 'sync')).resolves.toBeUndefined();
			expect(chromeMock.action.setBadgeText).toHaveBeenCalledTimes(2);
		});

		it.each([
			['another sync setting changes', { theme: { newValue: 'sap_horizon' } }, 'sync'],
			['the change is in session storage', { badgeEnabled: { newValue: false } }, 'session']
		])('leaves badges alone when %s', async (_, changes, area) => {
			await onStorageChanged(changes, area);

			expect(chromeMock.action.setBadgeText).not.toHaveBeenCalled();
		});
	});

	describe('tab lifecycle', () => {
		it('removes the stored rate when a tab is closed', () => {
			onRemoved(123);

			expect(chromeMock.storage.session.remove).toHaveBeenCalledWith('playbackRate_123');
		});

		it('forgets the old page rate when a main-frame navigation commits', () => {
			onCommitted({ tabId: 501, frameId: 0 });

			expect(chromeMock.storage.session.remove).toHaveBeenCalledExactlyOnceWith('playbackRate_501');
		});

		it('does not forget the rate after a subframe navigation commits', () => {
			onCommitted({ tabId: 502, frameId: 1 });

			expect(chromeMock.storage.session.remove).not.toHaveBeenCalled();
		});
	});
});
