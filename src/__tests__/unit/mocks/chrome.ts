import { vi } from 'vitest';

/** Creates a mock Chrome event with standard listener methods */
function createMockEvent() {
	return {
		addListener: vi.fn(),
		removeListener: vi.fn(),
		hasListener: vi.fn()
	};
}

/** Creates mock storage area with working get/set */
function createMockStorageArea(store: Record<string, unknown> = {}) {
	return {
		get: vi.fn((key?: string | string[]) => {
			if (!key) return Promise.resolve({ ...store });
			if (typeof key === 'string') {
				return Promise.resolve({ [key]: store[key] });
			}
			const result: Record<string, unknown> = {};
			key.forEach((k) => {
				if (store[k] !== undefined) {
					result[k] = store[k];
				}
			});
			return Promise.resolve(result);
		}),
		set: vi.fn((items: Record<string, unknown>) => {
			Object.assign(store, items);
			return Promise.resolve();
		}),
		remove: vi.fn((key: string | string[]) => {
			const keys = typeof key === 'string' ? [key] : key;
			keys.forEach((k) => delete store[k]);
			return Promise.resolve();
		}),
		clear: vi.fn(() => {
			Object.keys(store).forEach((k) => delete store[k]);
			return Promise.resolve();
		}),
		onChanged: createMockEvent()
	};
}

/** Creates the chrome mock object structure */
function createChromeMockObject(syncStorage: Record<string, unknown>, localStorage: Record<string, unknown>) {
	return {
		runtime: {
			sendMessage: vi.fn().mockResolvedValue({}),
			onMessage: createMockEvent(),
			onInstalled: createMockEvent(),
			id: 'test-extension-id',
			lastError: null
		},
		storage: {
			sync: createMockStorageArea(syncStorage),
			local: createMockStorageArea(localStorage),
			onChanged: createMockEvent()
		},
		tabs: {
			query: vi.fn().mockResolvedValue([{ id: 1 }]),
			get: vi.fn().mockResolvedValue({ id: 1 }),
			update: vi.fn().mockResolvedValue(undefined),
			sendMessage: vi.fn().mockResolvedValue(undefined),
			onActivated: createMockEvent(),
			onUpdated: createMockEvent(),
			onRemoved: createMockEvent()
		},
		scripting: {
			executeScript: vi.fn().mockResolvedValue([]),
			registerContentScripts: vi.fn().mockResolvedValue(undefined),
			unregisterContentScripts: vi.fn().mockResolvedValue(undefined),
			getRegisteredContentScripts: vi.fn().mockResolvedValue([])
		},
		action: {
			setBadgeText: vi.fn().mockResolvedValue(undefined),
			setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
			setBadgeTextColor: vi.fn().mockResolvedValue(undefined),
			setIcon: vi.fn().mockResolvedValue(undefined),
			setTitle: vi.fn().mockResolvedValue(undefined)
		},
		contextMenus: {
			create: vi.fn(),
			update: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
			removeAll: vi.fn().mockResolvedValue(undefined),
			onClicked: createMockEvent()
		},
		webNavigation: {
			onCommitted: createMockEvent(),
			onCompleted: createMockEvent(),
			onBeforeNavigate: createMockEvent()
		}
	};
}

export type ChromeMock = ReturnType<typeof createChromeMockObject>;

export interface ChromeMockContext {
	chrome: ChromeMock;
	syncStorage: Record<string, unknown>;
	localStorage: Record<string, unknown>;
	reset: () => void;
}

/** Creates a fresh Chrome mock with its own state */
export function createChromeMock(): ChromeMockContext {
	const syncStorage: Record<string, unknown> = {};
	const localStorage: Record<string, unknown> = {};

	const chromeMock = createChromeMockObject(syncStorage, localStorage);

	const reset = () => {
		// Clear storage objects
		Object.keys(syncStorage).forEach((k) => delete syncStorage[k]);
		Object.keys(localStorage).forEach((k) => delete localStorage[k]);

		// Clear all mocks
		vi.clearAllMocks();

		// Reset default return values
		chromeMock.runtime.sendMessage.mockResolvedValue({});
		chromeMock.tabs.query.mockResolvedValue([{ id: 1 }] as chrome.tabs.Tab[]);
		chromeMock.storage.local.get.mockResolvedValue({});
	};

	return {
		chrome: chromeMock,
		syncStorage,
		localStorage,
		reset
	};
}
