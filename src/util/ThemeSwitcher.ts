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

/** Handles theme switching between light/dark modes with UI5 and body background sync. */
export class ThemeSwitcher {
	/** Initialize theme from storage or system preference. Returns this for chaining. */
	public async init(): Promise<ThemeSwitcher> {
		const storedTheme = await this.getLatestTheme();
		const isDark = storedTheme
			? storedTheme === Theme.dark
			: window.matchMedia('(prefers-color-scheme: dark)').matches;

		const theme = isDark ? Theme.dark : Theme.light;
		const backgroundColor = isDark ? ThemeBackgroundColor.dark : ThemeBackgroundColor.light;
		this.setTheme(theme, backgroundColor);
		return this;
	}

	/** Toggle between light and dark themes. */
	public async toggle(): Promise<void> {
		if (await this.isDarkModeActive()) {
			this.setTheme(Theme.light, ThemeBackgroundColor.light);
		} else {
			this.setTheme(Theme.dark, ThemeBackgroundColor.dark);
		}
	}

	/** Check if dark mode is currently active. */
	public async isDarkModeActive(): Promise<boolean> {
		const currentActiveTheme = (await this.getLatestTheme()) || getTheme();
		return currentActiveTheme === Theme.dark;
	}

	/** Retrieve last set theme from storage. */
	private async getLatestTheme(): Promise<string> {
		const { theme } = (await chrome.storage.sync.get('theme')) as { theme?: string };
		return theme ?? '';
	}

	/** Save current theme to storage. */
	private async setLatestTheme(currentTheme: ThemeId): Promise<void> {
		await chrome.storage.sync.set({
			theme: currentTheme
		});
	}

	/** Set body background color (not handled by UI5 theming). */
	private setBackgroundColor(color: string): void {
		const currentHtmlBody = <HTMLBodyElement>document.querySelector('body')!;
		currentHtmlBody.style.backgroundColor = color;
	}

	/** Apply theme to UI5 and sync body background color. */
	private setTheme(themeName: ThemeId, backgroundColor: string): void {
		setTheme(themeName);
		this.setBackgroundColor(backgroundColor);
		this.setLatestTheme(themeName);
	}
}
