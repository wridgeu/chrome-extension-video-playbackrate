import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetChromeMocks, mockStorage } from '@tests/unit/setup';

// Mock UI5 theme functions before importing ThemeSwitcher
vi.mock('@ui5/webcomponents/dist/Assets.js', () => ({}));
vi.mock('@ui5/webcomponents-base/dist/config/Theme.js', () => ({
	setTheme: vi.fn(),
	getTheme: vi.fn(() => 'sap_horizon')
}));

import { ThemeSwitcher } from '@src/util/ThemeSwitcher';
import { setTheme, getTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

describe('ThemeSwitcher', () => {
	let themeSwitcher: ThemeSwitcher;
	let bodyElement: HTMLBodyElement;

	beforeEach(() => {
		resetChromeMocks();
		themeSwitcher = new ThemeSwitcher();

		// Create a body element for testing
		bodyElement = document.createElement('body');
		document.documentElement.appendChild(bodyElement);

		// Reset mocks
		vi.mocked(setTheme).mockClear();
		vi.mocked(getTheme).mockClear();
	});

	afterEach(() => {
		bodyElement.remove();
	});

	describe('init', () => {
		it('should initialize and return the ThemeSwitcher instance', async () => {
			const result = await themeSwitcher.init();
			expect(result).toBe(themeSwitcher);
		});

		it('should use stored theme if available', async () => {
			mockStorage['theme'] = 'sap_horizon_dark';

			await themeSwitcher.init();

			expect(setTheme).toHaveBeenCalledWith('sap_horizon_dark');
		});

		it('should use light theme when no stored theme and system prefers light', async () => {
			// Mock matchMedia to return light preference
			Object.defineProperty(window, 'matchMedia', {
				writable: true,
				value: vi.fn().mockImplementation((query) => ({
					matches: query === '(prefers-color-scheme: light)',
					media: query,
					onchange: null,
					addListener: vi.fn(),
					removeListener: vi.fn(),
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
					dispatchEvent: vi.fn()
				}))
			});

			await themeSwitcher.init();

			expect(setTheme).toHaveBeenCalledWith('sap_horizon');
		});

		it('should use dark theme when no stored theme and system prefers dark', async () => {
			// Mock matchMedia to return dark preference
			Object.defineProperty(window, 'matchMedia', {
				writable: true,
				value: vi.fn().mockImplementation((query) => ({
					matches: query === '(prefers-color-scheme: dark)',
					media: query,
					onchange: null,
					addListener: vi.fn(),
					removeListener: vi.fn(),
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
					dispatchEvent: vi.fn()
				}))
			});

			await themeSwitcher.init();

			expect(setTheme).toHaveBeenCalledWith('sap_horizon_dark');
		});
	});

	describe('toggle', () => {
		it('should toggle from light to dark theme', async () => {
			mockStorage['theme'] = 'sap_horizon';
			vi.mocked(getTheme).mockReturnValue('sap_horizon');

			await themeSwitcher.toggle();

			expect(setTheme).toHaveBeenCalledWith('sap_horizon_dark');
		});

		it('should toggle from dark to light theme', async () => {
			mockStorage['theme'] = 'sap_horizon_dark';
			vi.mocked(getTheme).mockReturnValue('sap_horizon_dark');

			await themeSwitcher.toggle();

			expect(setTheme).toHaveBeenCalledWith('sap_horizon');
		});
	});

	describe('isDarkModeActive', () => {
		it('should return true when dark theme is active', async () => {
			mockStorage['theme'] = 'sap_horizon_dark';

			const result = await themeSwitcher.isDarkModeActive();

			expect(result).toBe(true);
		});

		it('should return false when light theme is active', async () => {
			mockStorage['theme'] = 'sap_horizon';

			const result = await themeSwitcher.isDarkModeActive();

			expect(result).toBe(false);
		});

		it('should fall back to getTheme when no stored theme', async () => {
			vi.mocked(getTheme).mockReturnValue('sap_horizon_dark');

			const result = await themeSwitcher.isDarkModeActive();

			expect(result).toBe(true);
		});
	});

	describe('storage integration', () => {
		it('should store theme in chrome.storage.sync when setting theme', async () => {
			await themeSwitcher.init();

			expect(chrome.storage.sync.set).toHaveBeenCalled();
		});

		it('should retrieve theme from chrome.storage.sync on init', async () => {
			await themeSwitcher.init();

			expect(chrome.storage.sync.get).toHaveBeenCalledWith('theme');
		});
	});
});
