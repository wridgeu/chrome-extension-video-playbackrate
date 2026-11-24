import { vi } from 'vitest';

/** Loose signature for chrome API mocks; Chrome's overloaded (callback/promise) signatures don't map onto vi.fn generics. */
type MockFn = (...args: never) => unknown;

/** Creates a mock Chrome event with standard listener methods */
function createMockEvent() {
	return {
		addListener: vi.fn<MockFn>(),
		removeListener: vi.fn<MockFn>()
	};
}

/** Creates mock storage area backed by a plain object, mirroring chrome.storage get/set/remove semantics */
function createMockStorageArea(store: Record<string, unknown>) {
	return {
		get: vi.fn<MockFn>((key?: string | string[]) => {
			if (!key) return Promise.resolve({ ...store });
			const keys = typeof key === 'string' ? [key] : key;
			return Promise.resolve(Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]])));
		}),
		set: vi.fn<MockFn>((items: Record<string, unknown>) => {
			Object.assign(store, items);
			return Promise.resolve();
		}),
		remove: vi.fn<MockFn>((key: string | string[]) => {
			const keys = typeof key === 'string' ? [key] : key;
			keys.forEach((k) => delete store[k]);
			return Promise.resolve();
		}),
		onChanged: createMockEvent()
	};
}

/** Creates the chrome mock object structure (only the APIs the extension uses) */
function createChromeMockObject(syncStorage: Record<string, unknown>, sessionStorage: Record<string, unknown>) {
	const resolved = (value?: unknown) => vi.fn<MockFn>(() => Promise.resolve(value));
	return {
		runtime: {
			sendMessage: resolved({}),
			onMessage: createMockEvent(),
			onInstalled: createMockEvent(),
			lastError: null as chrome.runtime.LastError | null
		},
		storage: {
			sync: createMockStorageArea(syncStorage),
			session: createMockStorageArea(sessionStorage),
			onChanged: createMockEvent()
		},
		tabs: {
			query: resolved([{ id: 1 }]),
			onRemoved: createMockEvent()
		},
		scripting: {
			executeScript: resolved([])
		},
		action: {
			setBadgeText: resolved(),
			setBadgeBackgroundColor: resolved(),
			setBadgeTextColor: resolved()
		},
		contextMenus: {
			create: vi.fn<MockFn>(),
			update: resolved(),
			removeAll: resolved(),
			onClicked: createMockEvent()
		},
		webNavigation: {
			onCommitted: createMockEvent()
		}
	};
}

export type ChromeMock = ReturnType<typeof createChromeMockObject>;

/** Creates a fresh Chrome mock with its own state */
export function createChromeMock() {
	const syncStorage: Record<string, unknown> = {};
	const sessionStorage: Record<string, unknown> = {};
	const chromeMock = createChromeMockObject(syncStorage, sessionStorage);

	/** Clear stored data and restore every mock's original implementation, so per-test overrides don't leak. */
	const reset = () => {
		Object.keys(syncStorage).forEach((k) => delete syncStorage[k]);
		Object.keys(sessionStorage).forEach((k) => delete sessionStorage[k]);
		vi.resetAllMocks();
	};

	return { chrome: chromeMock, syncStorage, sessionStorage, reset };
}
