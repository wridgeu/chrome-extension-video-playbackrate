import { describe, it, expect, vi } from 'vitest';
import { mockColorScheme, mockStorage } from '@tests/unit/setup';

// Stateful stand-in for UI5's theme config
const ui5 = vi.hoisted(() => ({ theme: 'sap_horizon' }));
vi.mock('@ui5/webcomponents/dist/Assets.js', () => ({}));
vi.mock('@ui5/webcomponents-base/dist/config/Theme.js', () => ({
	setTheme: (theme: string) => {
		ui5.theme = theme;
	},
	getTheme: () => ui5.theme
}));

import { ThemeSwitcher } from '@src/util/ThemeSwitcher';

describe('ThemeSwitcher', () => {
	describe('init', () => {
		it.each([
			[false, 'sap_horizon'],
			[true, 'sap_horizon_dark']
		])('follows the system preference (dark: %s) when the user never toggled', async (prefersDark, theme) => {
			mockColorScheme(prefersDark);

			await new ThemeSwitcher().init();

			expect(ui5.theme).toBe(theme);
			expect(mockStorage.theme).toBeUndefined();
			mockColorScheme(false);
		});

		it('prefers the stored theme over the system preference', async () => {
			mockColorScheme(true);
			mockStorage.theme = 'sap_horizon';

			await new ThemeSwitcher().init();

			expect(ui5.theme).toBe('sap_horizon');
			mockColorScheme(false);
		});
	});

	it('toggles between light and dark and remembers the choice', async () => {
		const switcher = await new ThemeSwitcher().init();
		expect(switcher.isDarkModeActive()).toBe(false);

		await switcher.toggle();
		expect(switcher.isDarkModeActive()).toBe(true);
		expect(mockStorage.theme).toBe('sap_horizon_dark');

		await switcher.toggle();
		expect(switcher.isDarkModeActive()).toBe(false);
		expect(mockStorage.theme).toBe('sap_horizon');
	});
});
