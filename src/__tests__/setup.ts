import { vi } from 'vitest';

// Mock Chrome Storage API
const mockStorage: Record<string, unknown> = {};

const chromeStorageMock = {
  sync: {
    get: vi.fn((keys: string | string[] | null, callback?: (items: Record<string, unknown>) => void) => {
      const result: Record<string, unknown> = {};
      if (keys === null) {
        Object.assign(result, mockStorage);
      } else if (typeof keys === 'string') {
        if (keys in mockStorage) {
          result[keys] = mockStorage[keys];
        }
      } else if (Array.isArray(keys)) {
        keys.forEach((key) => {
          if (key in mockStorage) {
            result[key] = mockStorage[key];
          }
        });
      }
      if (callback) {
        callback(result);
      }
      return Promise.resolve(result);
    }),
    set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
      Object.assign(mockStorage, items);
      if (callback) {
        callback();
      }
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[], callback?: () => void) => {
      const keysArray = typeof keys === 'string' ? [keys] : keys;
      keysArray.forEach((key) => {
        delete mockStorage[key];
      });
      if (callback) {
        callback();
      }
      return Promise.resolve();
    }),
    clear: vi.fn((callback?: () => void) => {
      Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
      if (callback) {
        callback();
      }
      return Promise.resolve();
    }),
  },
  local: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
};

// Mock Chrome Runtime API
const chromeRuntimeMock = {
  sendMessage: vi.fn(),
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
  },
  onInstalled: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
  },
  getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
  lastError: null as chrome.runtime.LastError | null,
};

// Mock Chrome Tabs API
const chromeTabsMock = {
  query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
  sendMessage: vi.fn(),
  onUpdated: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
  },
};

// Mock Chrome Scripting API
const chromeScriptingMock = {
  executeScript: vi.fn().mockResolvedValue([]),
  registerContentScripts: vi.fn().mockResolvedValue(undefined),
};

// Mock Chrome Context Menus API
const chromeContextMenusMock = {
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  removeAll: vi.fn(),
  onClicked: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
  },
};

// Assemble the chrome mock object
const chromeMock = {
  storage: chromeStorageMock,
  runtime: chromeRuntimeMock,
  tabs: chromeTabsMock,
  scripting: chromeScriptingMock,
  contextMenus: chromeContextMenusMock,
};

// Set chrome as a global
vi.stubGlobal('chrome', chromeMock);

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
    dispatchEvent: vi.fn(),
  })),
});

// Export for use in tests
export {
  chromeMock,
  chromeStorageMock,
  chromeRuntimeMock,
  chromeTabsMock,
  chromeScriptingMock,
  chromeContextMenusMock,
  mockStorage,
};

// Helper to reset all mocks between tests
export function resetChromeMocks() {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  vi.clearAllMocks();
}
