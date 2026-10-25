import { describe, it, expect, vi } from 'vitest';
import { mockColorScheme, mockStorage } from '@tests/unit/setup';

// Stateful stand-in for UI5's theme config
const ui5 = vi.hoisted(() => ({ theme: '' }));
vi.mock('@ui5/webcomponents/dist/Assets.js', () => ({}));
vi.mock('@ui5/webcomponents-base/dist/config/Theme.js', () => ({
	setTheme: (theme: string) => {
		ui5.theme = theme;
	}
}));

import { ThemeSwitcher } from '@src/util/ThemeSwitcher';

describe('ThemeSwitcher', () => {
	describe('init', () => {
		it.each([
			[false, 'sap_horizon'],
			[true, 'sap_horizon_dark']
		])('follows the system preference (dark: %s) in system mode', async (prefersDark, theme) => {
			mockColorScheme(prefersDark);

			const switcher = await new ThemeSwitcher().init();

			expect(switcher.getMode()).toBe('system');
			expect(ui5.theme).toBe(theme);
			expect(mockStorage.theme).toBeUndefined();
		});

		it('prefers a stored explicit choice over the system preference', async () => {
			mockColorScheme(true);
			mockStorage.theme = 'sap_horizon';

			const switcher = await new ThemeSwitcher().init();

			expect(switcher.getMode()).toBe('light');
			expect(ui5.theme).toBe('sap_horizon');
		});
	});

	it('keeps following OS changes in system mode, but not after an explicit choice', async () => {
		const switcher = await new ThemeSwitcher().init();

		mockColorScheme(true);
		expect(ui5.theme).toBe('sap_horizon_dark');

		await switcher.setMode('light');
		mockColorScheme(true);
		expect(ui5.theme).toBe('sap_horizon');
	});

	it('remembers explicit modes and forgets them when going back to system', async () => {
		const switcher = await new ThemeSwitcher().init();

		await switcher.setMode('dark');
		expect(ui5.theme).toBe('sap_horizon_dark');
		expect(mockStorage.theme).toBe('sap_horizon_dark');

		await switcher.setMode('system');
		expect(ui5.theme).toBe('sap_horizon');
		expect(mockStorage).not.toHaveProperty('theme');
	});
});
