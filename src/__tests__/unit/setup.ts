import { vi, afterEach } from 'vitest';
import { createChromeMock } from '@tests/unit/mocks/chrome';

// Create a single mock context for the test suite
const mockContext = createChromeMock();

vi.stubGlobal('chrome', mockContext.chrome);

// Automatically reset chrome mocks after each test
afterEach(() => {
	mockContext.reset();
});

// Export mock storage for direct access in tests
export const mockStorage = mockContext.syncStorage;
export const chromeMock = mockContext.chrome;
export const resetChromeMocks = mockContext.reset;

/** Typed view of a chrome mock's recorded calls (the mocks themselves are loosely typed, see MockFn). */
export function callsOf<Args extends unknown[]>(fn: { mock: { calls: unknown[] } }): Args[] {
	return fn.mock.calls as Args[];
}

const colorScheme = { prefersDark: false, listeners: new Set<() => void>() };

/** Mock window.matchMedia (missing in jsdom); `prefersDark` drives `(prefers-color-scheme: dark)` and notifies listeners. */
export function mockColorScheme(prefersDark: boolean): void {
	colorScheme.prefersDark = prefersDark;
	colorScheme.listeners.forEach((listener) => listener());
}

Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: (query: string) => ({
		get matches() {
			return colorScheme.prefersDark && query === '(prefers-color-scheme: dark)';
		},
		media: query,
		addEventListener: (_type: 'change', listener: () => void) => colorScheme.listeners.add(listener)
	})
});
afterEach(() => {
	colorScheme.prefersDark = false;
	colorScheme.listeners.clear();
});
