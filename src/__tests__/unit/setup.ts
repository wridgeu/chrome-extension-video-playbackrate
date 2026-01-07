import { vi } from 'vitest';

// Make jest-chrome compatible with vitest by providing global jest stub
// jest-chrome expects jest.fn() which creates mocks with a different structure than vitest
globalThis.jest = {
	fn: (implementation?: any) => {
		const mockFn = vi.fn(implementation);
		// Ensure the mock has the expected structure
		if (!mockFn.mock) {
			(mockFn as any).mock = {
				calls: [],
				results: [],
				instances: []
			};
		}
		return mockFn;
	}
} as any;

import { chrome } from 'jest-chrome';

// Set chrome as a global using jest-chrome
vi.stubGlobal('chrome', chrome);

// jest-chrome doesn't include chrome.scripting API - add it manually
if (!chrome.scripting) {
	(chrome as any).scripting = {
		executeScript: vi.fn().mockResolvedValue([]),
		registerContentScripts: vi.fn().mockResolvedValue(undefined),
		unregisterContentScripts: vi.fn().mockResolvedValue(undefined),
		getRegisteredContentScripts: vi.fn().mockResolvedValue([])
	};
}

// jest-chrome doesn't include onChanged for storage.local - add it manually
if (chrome.storage.local && !(chrome.storage.local as any).onChanged) {
	(chrome.storage.local as any).onChanged = {
		addListener: vi.fn(),
		removeListener: vi.fn(),
		hasListener: vi.fn()
	};
}

// Ensure chrome.runtime.sendMessage returns a proper Promise by default
if (chrome.runtime && chrome.runtime.sendMessage) {
	(chrome.runtime.sendMessage as any).mockResolvedValue = (value: any) => {
		chrome.runtime.sendMessage = vi.fn().mockResolvedValue(value);
		return chrome.runtime.sendMessage;
	};
	// Default to returning a resolved Promise
	if (!chrome.runtime.sendMessage.getMockImplementation || !chrome.runtime.sendMessage.getMockImplementation()) {
		(chrome.runtime.sendMessage as any) = vi.fn().mockResolvedValue({});
	}
}

// Ensure chrome.tabs.query returns a proper Promise with an array by default
if (chrome.tabs && chrome.tabs.query) {
	(chrome.tabs.query as any).mockResolvedValue = (value: any) => {
		chrome.tabs.query = vi.fn().mockResolvedValue(value);
		return chrome.tabs.query;
	};
	// Default to returning an array
	if (!chrome.tabs.query.getMockImplementation || !chrome.tabs.query.getMockImplementation()) {
		(chrome.tabs.query as any) = vi.fn().mockResolvedValue([{ id: 1 }]);
	}
}

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
export const chromeScriptingMock = (chrome as any).scripting;
export const chromeContextMenusMock = chrome.contextMenus;
export const chromeWebNavigationMock = chrome.webNavigation;
export const chromeActionMock = chrome.action;

// Ensure chrome.storage.sync.get returns proper objects
if (chrome.storage.sync && chrome.storage.sync.get) {
	(chrome.storage.sync.get as any) = vi.fn(() => {
		// Return an empty object by default (tests can override)
		return Promise.resolve({});
	});
}

// Helper to reset all mocks between tests
export function resetChromeMocks() {
	// Clear only chrome API mocks, not document/window spies
	// This preserves test-specific spies like document.getElementById
	Object.values(chrome).forEach((api: any) => {
		if (api && typeof api === 'object') {
			Object.values(api).forEach((method: any) => {
				if (method && typeof method.mockClear === 'function') {
					method.mockClear();
				}
			});
		}
	});

	// Ensure critical mocks return Promises after reset
	if (chrome.runtime.sendMessage) {
		(chrome.runtime.sendMessage as any) = vi.fn().mockResolvedValue({});
	}
	if (chrome.tabs.query) {
		(chrome.tabs.query as any) = vi.fn().mockResolvedValue([{ id: 1 }]);
	}
	if (chrome.storage.sync.get) {
		(chrome.storage.sync.get as any) = vi.fn().mockResolvedValue({});
	}
	if (chrome.storage.local.get) {
		(chrome.storage.local.get as any) = vi.fn().mockResolvedValue({});
	}
}
