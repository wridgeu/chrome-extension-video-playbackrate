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

/** Mock window.matchMedia (missing in jsdom); `prefersDark` controls the `(prefers-color-scheme: dark)` result. */
export function mockColorScheme(prefersDark: boolean): void {
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: (query: string) => ({ matches: prefersDark && query === '(prefers-color-scheme: dark)', media: query })
	});
}

mockColorScheme(false);
