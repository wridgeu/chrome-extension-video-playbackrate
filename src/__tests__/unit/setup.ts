import { vi, afterEach } from 'vitest';
import { createChromeMock } from './mocks/chrome';

// Create a single mock context for the test suite
const mockContext = createChromeMock();

// Stub global chrome
vi.stubGlobal('chrome', mockContext.chrome);

// Automatically reset chrome mocks after each test
afterEach(() => {
	mockContext.reset();
});

// Export mock storage for direct access in tests
export const mockStorage = mockContext.syncStorage;

// Export chrome mock and reset function
export const chromeMock = mockContext.chrome;
export const resetChromeMocks = mockContext.reset;

// CSS.escape polyfill for JSDOM
if (typeof CSS === 'undefined' || !CSS.escape) {
	globalThis.CSS = {
		escape: (str: string) => {
			// Simple CSS.escape polyfill for testing
			return str.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&');
		}
	} as typeof CSS;
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
