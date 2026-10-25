import '@ui5/webcomponents/dist/Assets.js';
import { setTheme, getTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

const DARK_THEME = 'sap_horizon_dark';
const LIGHT_THEME = 'sap_horizon';

/** Switches UI5 between light and dark. An explicit toggle is persisted; otherwise the system preference is used. */
export class ThemeSwitcher {
	/** Apply the stored theme, or the system preference if the user never toggled. Returns this for chaining. */
	public async init(): Promise<ThemeSwitcher> {
		const { theme } = (await chrome.storage.sync.get('theme')) as { theme?: string };
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		setTheme(theme ?? (prefersDark ? DARK_THEME : LIGHT_THEME));
		return this;
	}

	/** Check if dark mode is currently active. */
	public isDarkModeActive(): boolean {
		return getTheme() === DARK_THEME;
	}

	/** Toggle between light and dark themes and remember the choice. */
	public async toggle(): Promise<void> {
		const theme = this.isDarkModeActive() ? LIGHT_THEME : DARK_THEME;
		setTheme(theme);
		await chrome.storage.sync.set({ theme });
	}
}
