import '@ui5/webcomponents/dist/Assets.js';
import { setTheme, getTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

enum Theme {
	dark = 'sap_horizon_dark',
	light = 'sap_horizon'
}

enum ThemeBackgroundColor {
	dark = '#1d232a',
	light = '#fff'
}

type ThemeId =
	| 'sap_fiori_3'
	| 'sap_fiori_3_dark'
	| 'sap_fiori_3_hcb'
	| 'sap_fiori_3_hcw'
	| 'sap_horizon_dark'
	| 'sap_horizon'
	| string;

/**
 * Class responsible for switching themes and adjusting the body (background color).
 * @class
 */
export class ThemeSwitcher {
	/**
	 * Initialize (set) the currently active theme.
	 *
	 * In case we have one already saved (user already set previously), use this one.
	 * If we don't have one saved, set based on preference.
	 * @returns {Promise<ThemeSwitcher>} The ThemeSwitcher instance for chaining
	 */
	public async init(): Promise<ThemeSwitcher> {
		const activeTheme = await this.getLatestTheme();
		if (!activeTheme) {
			if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
				this.setTheme(Theme.dark, ThemeBackgroundColor.dark);
			} else {
				this.setTheme(Theme.light, ThemeBackgroundColor.light);
			}
		} else {
			this.setTheme(
				activeTheme,
				activeTheme === Theme.dark ? ThemeBackgroundColor.dark : ThemeBackgroundColor.light
			);
		}
		return this;
	}

	/**
	 * Toggle between the themes!
	 * @public
	 */
	public async toggle(): Promise<void> {
		if (await this.isDarkModeActive()) {
			this.setTheme(Theme.light, ThemeBackgroundColor.light);
		} else {
			this.setTheme(Theme.dark, ThemeBackgroundColor.dark);
		}
	}

	/**
	 * Check if dark mode is currently active.
	 * @public
	 * @returns {Promise<boolean>} True if dark mode is active
	 */
	public async isDarkModeActive(): Promise<boolean> {
		const currentActiveTheme = (await this.getLatestTheme()) || getTheme();
		return currentActiveTheme === Theme.dark;
	}

	/**
	 * Retrieve last set theme from storage.
	 * @private
	 * @returns {Promise<string>} The stored theme ID or empty string
	 */
	private async getLatestTheme(): Promise<string> {
		const { theme } = (await chrome.storage.sync.get('theme')) as { theme?: string };
		return theme ?? '';
	}

	/**
	 * Write current theme into storage.
	 * @private
	 * @param {ThemeId} currentTheme - The theme ID to store
	 */
	private async setLatestTheme(currentTheme: ThemeId): Promise<void> {
		await chrome.storage.sync.set({
			theme: currentTheme
		});
	}

	/**
	 * In addition to setting the theme, we have to adjust the
	 * background of the body as it has no connection to UI5/Fiori.
	 * @private
	 * @param {string} color - The background color to set
	 */
	private setBackgroundColor(color: string): void {
		const currentHtmlBody = <HTMLBodyElement>document.querySelector('body')!;
		currentHtmlBody.style.backgroundColor = color;
	}

	/**
	 * Set the theme and background color.
	 * @private
	 * @param {ThemeId} themeName - The theme ID to apply
	 * @param {string} backgroundColor - The background color for the theme
	 */
	private setTheme(themeName: ThemeId, backgroundColor: string): void {
		setTheme(themeName);
		this.setBackgroundColor(backgroundColor);
		this.setLatestTheme(themeName);
	}
}
