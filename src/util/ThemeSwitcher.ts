import '@ui5/webcomponents/dist/Assets.js';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

const DARK_THEME = 'sap_horizon_dark';
const LIGHT_THEME = 'sap_horizon';

/** `system` follows the OS preference; `light`/`dark` are an explicit, persisted choice. */
export type ThemeMode = 'system' | 'light' | 'dark';

const STORED_MODES: Record<string, ThemeMode> = { [DARK_THEME]: 'dark', [LIGHT_THEME]: 'light' };

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Applies the UI5 theme for the chosen mode and keeps following the OS while in `system` mode. */
export class ThemeSwitcher {
	private mode: ThemeMode = 'system';

	/** Apply the stored mode (or follow the system). Returns this for chaining. */
	public async init(): Promise<ThemeSwitcher> {
		const { theme } = (await chrome.storage.sync.get('theme')) as { theme?: string };
		this.mode = STORED_MODES[theme ?? ''] ?? 'system';
		darkQuery().addEventListener('change', () => this.apply());
		this.apply();
		return this;
	}

	/** The active mode. */
	public getMode(): ThemeMode {
		return this.mode;
	}

	/** Switch to `mode` and remember it; `system` forgets the explicit choice. */
	public async setMode(mode: ThemeMode): Promise<void> {
		this.mode = mode;
		this.apply();
		if (mode === 'system') {
			await chrome.storage.sync.remove('theme');
		} else {
			await chrome.storage.sync.set({ theme: mode === 'dark' ? DARK_THEME : LIGHT_THEME });
		}
	}

	private apply(): void {
		const dark = this.mode === 'dark' || (this.mode === 'system' && darkQuery().matches);
		setTheme(dark ? DARK_THEME : LIGHT_THEME);
	}
}
