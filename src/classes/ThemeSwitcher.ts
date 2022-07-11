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

/**
 * Class responsible for switching themes and adjusting the body (background color).
 * @class
 */
export class ThemeSwitcher {
	/**
	 * Initialize the currently active theme.
	 *
	 * In case we have one already saved (so set previously), use this one.
	 * If we don't have one saved, use and set one based on preference.
	 * @constructor
	 */
	constructor() {
		this.getLatestTheme()
			.then((currentActiveTheme) => {
				if (!currentActiveTheme) {
					if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
						this.setTheme(Theme.dark, ThemeBackgroundColor.dark);
					} else {
						this.setTheme(Theme.light, ThemeBackgroundColor.light);
					}
				} else {
					this.setTheme(
						currentActiveTheme,
						currentActiveTheme === Theme.dark ? ThemeBackgroundColor.dark : ThemeBackgroundColor.light
					);
				}
			})
			.catch((e) => {
				console.log(e);
			});
	}

	/**
	 * Toggle between the themes!
	 * @public
	 */
	public async toggle(): Promise<void> {
		if (await this.isCurrentModeDarkMode()) {
			this.setTheme(Theme.light, ThemeBackgroundColor.light);
		} else {
			this.setTheme(Theme.dark, ThemeBackgroundColor.dark);
		}
	}

	/**
	 * @public
	 * @return {boolean}
	 */
	public async getIsDarkMode(): Promise<boolean> {
		return this.isCurrentModeDarkMode();
	}

	/**
	 * @private
	 * @return {boolean}
	 */
	private async isCurrentModeDarkMode(): Promise<boolean> {
		const currentActiveTheme = (await this.getLatestTheme()) || getTheme();
		if (currentActiveTheme === Theme.dark) {
			return true;
		} else {
			return false;
		}
	}

	/**
	 * Write currently set theme into memory
	 * @private
	 * @param {string} currentTheme
	 */
	private async storeLatestTheme(currentTheme: string): Promise<void> {
		await chrome.storage.sync.set({
			theme: currentTheme
		});
	}

	/**
	 * Write currently set theme into memory
	 * @private
	 */
	private async getLatestTheme(): Promise<string> {
		const { theme } = await chrome.storage.sync.get('theme');
		return theme;
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
	 * @param {Theme} themeName
	 * @param {string} backgroundColor
	 */
	private setTheme(themeName: string, backgroundColor: string): void {
		setTheme(themeName);
		this.setBackgroundColor(backgroundColor);
		this.storeLatestTheme(themeName);
	}
}
