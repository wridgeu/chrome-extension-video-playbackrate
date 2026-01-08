import { vi } from 'vitest';

/**
 * Sets up default DOM element mocks for popup tests.
 * Call this in beforeEach to ensure clean mock state per test.
 */
export function setupDefaultDomMocks() {
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

	// Mock getElementById to return default mocks
	document.getElementById = vi.fn((id: string) => {
		return (defaultMockElements[id] as HTMLElement) || null;
	}) as typeof document.getElementById;

	return defaultMockElements;
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
