import '@ui5/webcomponents/dist/Assets.js';
import { setTheme, getTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

/**
 * Class responsible for switching themes and adjusting the body (background color).
 * @class
 */
export class ThemeSwitcher {
	#darkThemeBackgroundColor = '#1d232a';
	#lightThemeBackgroundColor = '#fff';
	#darkTheme = 'sap_horizon_dark';
	#lightTheme = 'sap_horizon';

	/**
	 * Initialize the currently active theme.
	 *
	 * In case we have one already saved (so set previously), use this one.
	 * If we don't have one saved, use and set one based on preference.
	 */
	public async init() {
		const currentActiveTheme = await this.getLatestTheme();
		if (!currentActiveTheme) {
			if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
				this.setDarkTheme();
			} else {
				this.setLightTheme();
			}
		} else if (currentActiveTheme === this.#darkTheme) {
			this.setDarkTheme();
		} else {
			this.setLightTheme();
		}
	}

	/**
	 * Toggle between the themes!
	 */
	public async toggle(): Promise<void> {
		if (await this.isCurrentModeDarkMode()) {
			this.setLightTheme();
		} else {
			this.setDarkTheme();
		}
	}

	/**
	 * @method
	 * @return {boolean}
	 */
	public async getIsDarkMode(): Promise<boolean> {
		return this.isCurrentModeDarkMode();
	}

	/**
	 * @method
	 * @return {boolean}
	 */
	private async isCurrentModeDarkMode(): Promise<boolean> {
		const currentActiveTheme = (await this.getLatestTheme()) || getTheme();
		if (currentActiveTheme === this.#darkTheme) {
			return true;
		} else {
			return false;
		}
	}

	/**
	 * Write currently set theme into memory
	 * @private
	 * @method
	 * @param {string} currentTheme
	 */
	private async storeLatestTheme(currentTheme: string): Promise<void> {
		await chrome.storage.sync.set({
			theme: currentTheme
		});
	}

	/**
	 * Write currently set theme into memory
	 * @method
	 */
	private async getLatestTheme(): Promise<string> {
		const { theme } = await chrome.storage.sync.get('theme');
		return theme;
	}

	/**
	 * In addition to setting the theme, we have to adjust the
	 * background of the body as it has no connection to UI5/Fiori
	 * @method
	 * @private
	 * @param {string} color
	 */
	private adjustBackgroundColor(color: string): void {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const currentHtmlBody = <HTMLBodyElement>document.querySelector('body')!;
		currentHtmlBody.style.backgroundColor = color;
	}

	/**
	 * @method
	 * @private
	 */
	private setDarkTheme() {
		setTheme(this.#darkTheme);
		this.adjustBackgroundColor(this.#darkThemeBackgroundColor);
		this.storeLatestTheme(this.#darkTheme);
	}

	/**
	 * @method
	 * @private
	 */
	private setLightTheme() {
		setTheme(this.#lightTheme);
		this.adjustBackgroundColor(this.#lightThemeBackgroundColor);
		this.storeLatestTheme(this.#lightTheme);
	}
}
