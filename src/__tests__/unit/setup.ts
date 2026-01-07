import { vi } from 'vitest';

// Mock storage object for ThemeSwitcher tests
export const mockStorage: Record<string, any> = {};

// Create comprehensive chrome API mocks using Vitest
const chrome = {
	runtime: {
		sendMessage: vi.fn().mockResolvedValue({}),
		onMessage: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
			hasListener: vi.fn()
		},
		onInstalled: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
			hasListener: vi.fn()
		},
		id: 'test-extension-id'
	},
	storage: {
		sync: {
			get: vi.fn().mockImplementation((key?: string | string[]) => {
				if (!key) return Promise.resolve(mockStorage);
				if (typeof key === 'string') {
					return Promise.resolve({ [key]: mockStorage[key] });
				}
				const result: Record<string, any> = {};
				key.forEach((k) => {
					if (mockStorage[k] !== undefined) {
						result[k] = mockStorage[k];
					}
				});
				return Promise.resolve(result);
			}),
			set: vi.fn().mockImplementation((items: Record<string, any>) => {
				Object.assign(mockStorage, items);
				return Promise.resolve();
			}),
			remove: vi.fn().mockImplementation((key: string | string[]) => {
				const keys = typeof key === 'string' ? [key] : key;
				keys.forEach((k) => delete mockStorage[k]);
				return Promise.resolve();
			}),
			clear: vi.fn().mockImplementation(() => {
				Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
				return Promise.resolve();
			})
		},
		local: {
			get: vi.fn().mockResolvedValue({}),
			set: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
			clear: vi.fn().mockResolvedValue(undefined),
			onChanged: {
				addListener: vi.fn(),
				removeListener: vi.fn(),
				hasListener: vi.fn()
			}
		},
		onChanged: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
			hasListener: vi.fn()
		}
	},
	tabs: {
		query: vi.fn().mockResolvedValue([{ id: 1 }]),
		get: vi.fn().mockResolvedValue({ id: 1 }),
		update: vi.fn().mockResolvedValue(undefined),
		sendMessage: vi.fn().mockResolvedValue(undefined),
		onActivated: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
			hasListener: vi.fn()
		},
		onUpdated: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
			hasListener: vi.fn()
		},
		onRemoved: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
			hasListener: vi.fn()
		}
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
		onClicked: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
			hasListener: vi.fn()
		}
	},
	webNavigation: {
		onCommitted: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
			hasListener: vi.fn()
		},
		onCompleted: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
			hasListener: vi.fn()
		}
	}
};

// Set chrome as a global
vi.stubGlobal('chrome', chrome);

// Mock window.matchMedia (required for ThemeSwitcher)
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn()
	}))
});

// Add CSS.escape polyfill for JSDOM
if (typeof CSS === 'undefined' || !CSS.escape) {
	globalThis.CSS = {
		escape: (str: string) => {
			// Simple CSS.escape polyfill for testing
			return str.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&');
		}
	} as any;
}

// Export chrome and its sub-APIs for use in tests
export const chromeMock = chrome;
export const chromeStorageMock = chrome.storage;
export const chromeRuntimeMock = chrome.runtime;
export const chromeTabsMock = chrome.tabs;
export const chromeScriptingMock = chrome.scripting;
export const chromeContextMenusMock = chrome.contextMenus;
export const chromeWebNavigationMock = chrome.webNavigation;
export const chromeActionMock = chrome.action;

// Helper to reset all mocks between tests
export function resetChromeMocks() {
	// Clear mockStorage
	Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);

	// Reset all chrome API mocks
	vi.mocked(chrome.runtime.sendMessage).mockClear();
	vi.mocked(chrome.runtime.onMessage.addListener).mockClear();
	vi.mocked(chrome.runtime.onMessage.removeListener).mockClear();
	vi.mocked(chrome.runtime.onMessage.hasListener).mockClear();
	vi.mocked(chrome.runtime.onInstalled.addListener).mockClear();
	vi.mocked(chrome.runtime.onInstalled.removeListener).mockClear();
	vi.mocked(chrome.runtime.onInstalled.hasListener).mockClear();

	vi.mocked(chrome.storage.sync.get).mockClear();
	vi.mocked(chrome.storage.sync.set).mockClear();
	vi.mocked(chrome.storage.sync.remove).mockClear();
	vi.mocked(chrome.storage.sync.clear).mockClear();

	vi.mocked(chrome.storage.local.get).mockClear();
	vi.mocked(chrome.storage.local.set).mockClear();
	vi.mocked(chrome.storage.local.remove).mockClear();
	vi.mocked(chrome.storage.local.clear).mockClear();
	vi.mocked(chrome.storage.local.onChanged.addListener).mockClear();
	vi.mocked(chrome.storage.local.onChanged.removeListener).mockClear();
	vi.mocked(chrome.storage.local.onChanged.hasListener).mockClear();

	vi.mocked(chrome.storage.onChanged.addListener).mockClear();
	vi.mocked(chrome.storage.onChanged.removeListener).mockClear();
	vi.mocked(chrome.storage.onChanged.hasListener).mockClear();

	vi.mocked(chrome.tabs.query).mockClear();
	vi.mocked(chrome.tabs.get).mockClear();
	vi.mocked(chrome.tabs.update).mockClear();
	vi.mocked(chrome.tabs.sendMessage).mockClear();
	vi.mocked(chrome.tabs.onActivated.addListener).mockClear();
	vi.mocked(chrome.tabs.onActivated.removeListener).mockClear();
	vi.mocked(chrome.tabs.onActivated.hasListener).mockClear();
	vi.mocked(chrome.tabs.onUpdated.addListener).mockClear();
	vi.mocked(chrome.tabs.onUpdated.removeListener).mockClear();
	vi.mocked(chrome.tabs.onUpdated.hasListener).mockClear();
	vi.mocked(chrome.tabs.onRemoved.addListener).mockClear();
	vi.mocked(chrome.tabs.onRemoved.removeListener).mockClear();
	vi.mocked(chrome.tabs.onRemoved.hasListener).mockClear();

	vi.mocked(chrome.scripting.executeScript).mockClear();
	vi.mocked(chrome.scripting.registerContentScripts).mockClear();
	vi.mocked(chrome.scripting.unregisterContentScripts).mockClear();
	vi.mocked(chrome.scripting.getRegisteredContentScripts).mockClear();

	vi.mocked(chrome.action.setBadgeText).mockClear();
	vi.mocked(chrome.action.setBadgeBackgroundColor).mockClear();
	vi.mocked(chrome.action.setBadgeTextColor).mockClear();
	vi.mocked(chrome.action.setIcon).mockClear();
	vi.mocked(chrome.action.setTitle).mockClear();

	vi.mocked(chrome.contextMenus.create).mockClear();
	vi.mocked(chrome.contextMenus.update).mockClear();
	vi.mocked(chrome.contextMenus.remove).mockClear();
	vi.mocked(chrome.contextMenus.removeAll).mockClear();
	vi.mocked(chrome.contextMenus.onClicked.addListener).mockClear();
	vi.mocked(chrome.contextMenus.onClicked.removeListener).mockClear();
	vi.mocked(chrome.contextMenus.onClicked.hasListener).mockClear();

	vi.mocked(chrome.webNavigation.onCommitted.addListener).mockClear();
	vi.mocked(chrome.webNavigation.onCommitted.removeListener).mockClear();
	vi.mocked(chrome.webNavigation.onCommitted.hasListener).mockClear();
	vi.mocked(chrome.webNavigation.onCompleted.addListener).mockClear();
	vi.mocked(chrome.webNavigation.onCompleted.removeListener).mockClear();
	vi.mocked(chrome.webNavigation.onCompleted.hasListener).mockClear();

	// Reset default mock return values
	vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({});
	vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1 }] as any);
	vi.mocked(chrome.storage.local.get).mockResolvedValue({});
}
