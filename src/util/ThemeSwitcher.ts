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
	| 'sap_belize'
	| 'sap_belize_hcb'
	| 'sap_belize_hcw'
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
	 * In case we have one already saved (so set previously), use this one.
	 * If we don't have one saved, set based on preference.
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
	 * @public
	 * @return {boolean}
	 */
	public async isDarkModeActive(): Promise<boolean> {
		const currentActiveTheme = (await this.getLatestTheme()) || getTheme();
		if (currentActiveTheme === Theme.dark) {
			return true;
		} else {
			return false;
		}
	}

	/**
	 * Retrieve last set theme from stroage
	 * @private
	 * @param {string} currentTheme
	 */
	private async getLatestTheme(): Promise<string> {
		const { theme } = await chrome.storage.sync.get('theme');
		return theme;
	}

	/**
	 * Write current theme into storage
	 * @private
	 * @param {ThemeId} currentTheme
	 */
	private async setLatestTheme(currentTheme: ThemeId): Promise<void> {
		await chrome.storage.sync.set({
			theme: currentTheme
		});
	}

	/**
	 * In addition to setting the theme, we have to adjust the
	 * background of the body as it has no connection to UI5/Fiori
	 * @private
	 * @param {string} color
	 */
	private setBackgroundColor(color: string): void {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const currentHtmlBody = <HTMLBodyElement>document.querySelector('body')!;
		currentHtmlBody.style.backgroundColor = color;
	}

	/**
	 * @private
	 * @param {ThemeId} themeName
	 * @param {string} backgroundColor
	 */
	private setTheme(themeName: ThemeId, backgroundColor: string): void {
		setTheme(themeName);
		this.setBackgroundColor(backgroundColor);
		this.setLatestTheme(themeName);
	}
}
