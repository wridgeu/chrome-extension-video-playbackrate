import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chromeMock, resetChromeMocks } from '@tests/unit/setup';

describe('Options Page', () => {
	// Mock DOM elements
	let mockDefaultsCheckbox: {
		checked: boolean;
		addEventListener: ReturnType<typeof vi.fn>;
	};
	let mockDefaultSpeedSelector: {
		disabled: boolean;
		addEventListener: ReturnType<typeof vi.fn>;
		selectedOption: { innerText: string };
	};
	let mockBadgeCheckbox: {
		checked: boolean;
		addEventListener: ReturnType<typeof vi.fn>;
	};
	let mockThemeToggle: {
		checked: boolean;
		addEventListener: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		vi.resetModules();
		resetChromeMocks();

		// Create fresh mock elements
		mockDefaultsCheckbox = {
			checked: false,
			addEventListener: vi.fn()
		};
		mockDefaultSpeedSelector = {
			disabled: true,
			addEventListener: vi.fn(),
			selectedOption: { innerText: '1.5' }
		};
		mockBadgeCheckbox = {
			checked: true,
			addEventListener: vi.fn()
		};
		mockThemeToggle = {
			checked: false,
			addEventListener: vi.fn()
		};

		// Mock document.getElementById
		vi.spyOn(document, 'getElementById').mockImplementation((id: string) => {
			const elements: Record<string, unknown> = {
				defaultsEnabledCheckbox: mockDefaultsCheckbox,
				defaultSpeedSelector: mockDefaultSpeedSelector,
				badgeEnabledCheckbox: mockBadgeCheckbox,
				themeToggle: mockThemeToggle
			};
			return elements[id] as HTMLElement;
		});
	});

	describe('initOptions', () => {
		it('initializes all UI controls from storage', async () => {
			// Set up storage with existing values
			await chromeMock.storage.sync.set({
				defaults: { enabled: true, playbackRate: 2 },
				badgeEnabled: true
			});

			const { initOptions } = await import('@src/options');
			await initOptions();

			// Verify defaults checkbox was initialized
			expect(mockDefaultsCheckbox.checked).toBe(true);
			expect(mockDefaultSpeedSelector.disabled).toBe(false);

			// Verify badge checkbox was initialized
			expect(mockBadgeCheckbox.checked).toBe(true);

			// Verify event listeners were attached
			expect(mockDefaultsCheckbox.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
			expect(mockDefaultSpeedSelector.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
			expect(mockBadgeCheckbox.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
		});

		it('defaults badge checkbox to enabled when not set in storage', async () => {
			// No badgeEnabled in storage
			await chromeMock.storage.sync.set({ defaults: { enabled: false } });

			const { initOptions } = await import('@src/options');
			await initOptions();

			// Badge should default to enabled
			expect(mockBadgeCheckbox.checked).toBe(true);
		});

		it('disables speed selector when defaults checkbox is unchecked', async () => {
			await chromeMock.storage.sync.set({
				defaults: { enabled: false }
			});

			const { initOptions } = await import('@src/options');
			await initOptions();

			expect(mockDefaultsCheckbox.checked).toBe(false);
			expect(mockDefaultSpeedSelector.disabled).toBe(true);
		});
	});

	describe('defaults checkbox change handler', () => {
		it('enables speed selector when checked', async () => {
			await chromeMock.storage.sync.set({ defaults: { enabled: false } });

			const { initOptions } = await import('@src/options');
			await initOptions();

			// Get the change handler
			const changeHandler = mockDefaultsCheckbox.addEventListener.mock.calls.find(
				(call) => call[0] === 'change'
			)?.[1];

			// Simulate checking the checkbox
			await changeHandler({ target: { checked: true } });

			expect(mockDefaultSpeedSelector.disabled).toBe(false);
		});

		it('disables speed selector when unchecked', async () => {
			await chromeMock.storage.sync.set({ defaults: { enabled: true } });

			const { initOptions } = await import('@src/options');
			await initOptions();

			// Get the change handler
			const changeHandler = mockDefaultsCheckbox.addEventListener.mock.calls.find(
				(call) => call[0] === 'change'
			)?.[1];

			// Simulate unchecking the checkbox
			await changeHandler({ target: { checked: false } });

			expect(mockDefaultSpeedSelector.disabled).toBe(true);
		});

		it('saves defaults to storage when checkbox changes', async () => {
			chromeMock.storage.sync.set.mockClear();

			const { initOptions } = await import('@src/options');
			await initOptions();

			// Get the change handler
			const changeHandler = mockDefaultsCheckbox.addEventListener.mock.calls.find(
				(call) => call[0] === 'change'
			)?.[1];

			// Simulate checking the checkbox
			await changeHandler({ target: { checked: true } });

			expect(chromeMock.storage.sync.set).toHaveBeenCalledWith({
				defaults: { enabled: true, playbackRate: 1.5 }
			});
		});
	});

	describe('speed selector change handler', () => {
		it('saves selected speed to storage', async () => {
			// Initialize with defaults enabled
			await chromeMock.storage.sync.set({
				defaults: { enabled: true, playbackRate: 1.5 }
			});

			const { initOptions } = await import('@src/options');
			await initOptions();

			// Clear storage set calls from initialization
			chromeMock.storage.sync.set.mockClear();

			// Get the change handler
			const changeHandler = mockDefaultSpeedSelector.addEventListener.mock.calls.find(
				(call) => call[0] === 'change'
			)?.[1];

			// Change selected option
			mockDefaultSpeedSelector.selectedOption = { innerText: '2' };

			// Trigger change
			await changeHandler();

			expect(chromeMock.storage.sync.set).toHaveBeenCalledWith({
				defaults: { enabled: true, playbackRate: 2 }
			});
		});
	});

	describe('badge checkbox change handler', () => {
		it('saves badge preference to storage when enabled', async () => {
			chromeMock.storage.sync.set.mockClear();

			const { initOptions } = await import('@src/options');
			await initOptions();

			// Get the change handler
			const changeHandler = mockBadgeCheckbox.addEventListener.mock.calls.find(
				(call) => call[0] === 'change'
			)?.[1];

			// Simulate enabling badge
			await changeHandler({ target: { checked: true } });

			expect(chromeMock.storage.sync.set).toHaveBeenCalledWith({ badgeEnabled: true });
		});

		it('saves badge preference to storage when disabled', async () => {
			chromeMock.storage.sync.set.mockClear();

			const { initOptions } = await import('@src/options');
			await initOptions();

			// Get the change handler
			const changeHandler = mockBadgeCheckbox.addEventListener.mock.calls.find(
				(call) => call[0] === 'change'
			)?.[1];

			// Simulate disabling badge
			await changeHandler({ target: { checked: false } });

			expect(chromeMock.storage.sync.set).toHaveBeenCalledWith({ badgeEnabled: false });
		});
	});
});
