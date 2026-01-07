import { vi } from 'vitest';
import { createChromeMock } from './mocks/chrome';

// Create a single mock context for the test suite
const mockContext = createChromeMock();

// Stub global chrome
vi.stubGlobal('chrome', mockContext.chrome);

// Export mock storage for direct access in tests
export const mockStorage = mockContext.syncStorage;

// Export chrome mock and reset function
export const chromeMock = mockContext.chrome;
export const resetChromeMocks = mockContext.reset;

// Individual API exports for backwards compatibility
export const chromeStorageMock = chromeMock.storage;
export const chromeRuntimeMock = chromeMock.runtime;
export const chromeTabsMock = chromeMock.tabs;
export const chromeScriptingMock = chromeMock.scripting;
export const chromeContextMenusMock = chromeMock.contextMenus;
export const chromeWebNavigationMock = chromeMock.webNavigation;
export const chromeActionMock = chromeMock.action;

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

// Set up default mocks for document.getElementById to prevent errors when modules are imported
// Individual tests can override these in beforeEach if needed
if (typeof document !== 'undefined') {
	// Create default mock elements that can be returned
	const defaultMockElements: Record<string, Partial<HTMLElement>> = {
		slider: {
			id: 'slider',
			addEventListener: vi.fn(),
			shadowRoot: {
				querySelector: vi.fn().mockReturnValue(null)
			} as unknown as ShadowRoot
		},
		tooltip: {
			id: 'tooltip',
			textContent: '',
			offsetWidth: 40,
			style: {} as CSSStyleDeclaration,
			getBoundingClientRect: () =>
				({
					width: 40,
					height: 20,
					top: 0,
					left: 0,
					right: 40,
					bottom: 20
				}) as DOMRect
		},
		'no-videos': {
			id: 'no-videos',
			hidden: false
		},
		'slider-container': {
			id: 'slider-container',
			hidden: false
		}
	};

	// Add slider value property
	Object.defineProperty(defaultMockElements.slider, 'value', {
		value: 1,
		writable: true
	});
	Object.defineProperty(defaultMockElements.slider, 'min', {
		value: '0.25',
		writable: true
	});
	Object.defineProperty(defaultMockElements.slider, 'max', {
		value: '4',
		writable: true
	});

	// Add tooltip methods
	Object.assign(defaultMockElements.tooltip, {
		showPopover: vi.fn(),
		hidePopover: vi.fn(),
		matches: vi.fn().mockReturnValue(false)
	});

	// Mock getElementById to return default mocks (tests can override in beforeEach)
	const originalGetElementById = document.getElementById.bind(document);
	document.getElementById = vi.fn((id: string) => {
		return (defaultMockElements[id] as HTMLElement) || originalGetElementById(id);
	}) as typeof document.getElementById;
}

/**
 * Helper to extract an event handler from a mock addEventListener call.
 * Avoids brittle patterns like `.mock.calls.find(call => call[0] === 'input')?.[1]`
 */
export function getEventHandler(
	mockFn: ReturnType<typeof vi.fn>,
	eventName: string
): ((...args: unknown[]) => void) | undefined {
	const call = mockFn.mock.calls.find((c) => c[0] === eventName);
	return call?.[1] as ((...args: unknown[]) => void) | undefined;
}
