import { MessagingAction, type MessagingRequestPayload } from '@src/types';
import {
	PLAYBACK_RATES,
	findClosestRate,
	formatBadgeRate,
	formatRate,
	getPlaybackRateStorageKey
} from '@src/util/playback';

/** Badge background color - matches the icon's golden yellow */
const BADGE_BACKGROUND_COLOR = '#F7B731';
/** Badge text color - black for contrast */
const BADGE_TEXT_COLOR = '#000000';

/** Log expected Chrome API failures (e.g. a tab closing mid-call) in dev only. */
function warnInDev(context: string, error: unknown): void {
	if (import.meta.env.DEV) {
		console.warn(`${context}:`, error);
	}
}

/** Check the context menu entry (id = the rate) closest to the given playback rate. */
function updateContextMenu(playbackRate: number): void {
	// Callback handles case where menu item doesn't exist after service worker restart
	chrome.contextMenus.update(String(findClosestRate(playbackRate)), { checked: true }, () => {
		if (chrome.runtime.lastError) {
			warnInDev('Context menu update skipped', chrome.runtime.lastError.message);
		}
	});
}

/** Show `playbackRate` on the tab's badge, or clear the badge when it is undefined. */
async function setBadge(playbackRate: number | undefined, tabId: number): Promise<void> {
	try {
		if (playbackRate === undefined) {
			await chrome.action.setBadgeText({ text: '', tabId });
			return;
		}
		await Promise.all([
			chrome.action.setBadgeText({ text: formatBadgeRate(playbackRate), tabId }),
			chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR, tabId }),
			chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR, tabId })
		]);
	} catch (error) {
		warnInDev('Badge update skipped', error);
	}
}

/** Sync the badge (unless disabled), the context menu and the per-tab rate the popup listens to. */
async function handleRateUpdate(playbackRate: number, tabId: number | undefined): Promise<void> {
	updateContextMenu(playbackRate);
	if (tabId === undefined) return;

	await chrome.storage.session.set({ [getPlaybackRateStorageKey(tabId)]: playbackRate });

	const { badgeEnabled } = await chrome.storage.sync.get('badgeEnabled');
	await setBadge(badgeEnabled === false ? undefined : playbackRate, tabId);
}

/**
 * Injected into the page by the context menu: sets the rate of the video playing `srcUrl`.
 * Matches `currentSrc` too, for videos using `<source>` children. Must stay self-contained (it is serialized).
 */
export function setRateOfVideoWithSrc(srcUrl: string, rate: number): void {
	const video = Array.from(document.querySelectorAll('video')).find((v) => v.src === srcUrl || v.currentSrc === srcUrl);
	if (video) video.playbackRate = rate;
}

/** Initialize context menu with playback rate options and inject content script into already-open tabs. */
chrome.runtime.onInstalled.addListener(async () => {
	// Menu items survive extension updates; start fresh so renamed or removed entries don't linger
	await chrome.contextMenus.removeAll();
	PLAYBACK_RATES.forEach((rate) => {
		chrome.contextMenus.create({
			id: String(rate),
			type: 'radio',
			title: formatRate(rate),
			contexts: ['video'],
			checked: rate === 1
		});
	});

	// New pages get the content script declaratively via manifest.json; inject into already-open tabs on install/update
	const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
	await Promise.all(
		tabs
			.filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined)
			.map((tab) =>
				chrome.scripting
					.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['/js/contentscript.js'] })
					.catch((error) => warnInDev('Content script injection failed', error))
			)
	);
});

/** Set playback rate when context menu item is clicked. */
chrome.contextMenus.onClicked.addListener(async (itemData, tab) => {
	const rate = Number(itemData.menuItemId);
	if (!tab?.id || !PLAYBACK_RATES.includes(rate) || !itemData.srcUrl) return;

	// Use executeScript to set playback rate directly, avoiding content script dependency
	await chrome.scripting
		.executeScript({
			target: { tabId: tab.id, allFrames: true },
			func: setRateOfVideoWithSrc,
			args: [itemData.srcUrl, rate]
		})
		.catch((error) => warnInDev('Context menu rate update failed', error));
	await handleRateUpdate(rate, tab.id);
});

// Clean up per-tab session state when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
	void chrome.storage.session.remove(getPlaybackRateStorageKey(tabId));
});

// Forget the old page's rate once a main-frame navigation actually commits (aborted navigations / downloads don't commit)
chrome.webNavigation.onCommitted.addListener((details) => {
	if (details.frameId === 0) {
		void chrome.storage.session.remove(getPlaybackRateStorageKey(details.tabId));
	}
});

/** Handle rate updates from content scripts and the popup. */
chrome.runtime.onMessage.addListener((request: MessagingRequestPayload, sender) => {
	if (typeof request.playbackRate !== 'number') return;

	if (request.action === MessagingAction.UPDATE_CONTEXT_MENU) {
		updateContextMenu(request.playbackRate);
	} else if (request.action === MessagingAction.UPDATE_UI) {
		// Prefer the browser-provided sender tab; only the popup (which has no sender tab) names a tab itself
		void handleRateUpdate(request.playbackRate, sender.tab?.id ?? request.tabId).catch((error) =>
			warnInDev('Rate update failed', error)
		);
	}
});

/** Apply the badge setting to all open tabs right away: clear the badges, or restore them from the stored rates. */
chrome.storage.onChanged.addListener(async (changes, areaName) => {
	if (areaName !== 'sync' || !changes.badgeEnabled) return;

	const enabled = changes.badgeEnabled.newValue !== false;
	const tabIds = (await chrome.tabs.query({})).flatMap((tab) => (tab.id ? [tab.id] : []));
	const storedRates = await chrome.storage.session.get(tabIds.map((tabId) => getPlaybackRateStorageKey(tabId)));
	await Promise.all(
		tabIds.map((tabId) => {
			const rate = storedRates[getPlaybackRateStorageKey(tabId)];
			return setBadge(enabled && typeof rate === 'number' ? rate : undefined, tabId);
		})
	);
});
