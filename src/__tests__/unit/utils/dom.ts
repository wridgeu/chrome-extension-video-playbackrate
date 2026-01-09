import { vi } from 'vitest';

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
