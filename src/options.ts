import type CheckBox from '@ui5/webcomponents/dist/CheckBox.js';
import type Select from '@ui5/webcomponents/dist/Select.js';
import type Switch from '@ui5/webcomponents/dist/Switch.js';
import '@ui5/webcomponents/dist/CheckBox.js';
import '@ui5/webcomponents/dist/Label.js';
import '@ui5/webcomponents/dist/Option.js';
import '@ui5/webcomponents/dist/Select.js';
import '@ui5/webcomponents/dist/Switch.js';
import '@ui5/webcomponents/dist/Title.js';

import type { Defaults } from './types';
import { ThemeSwitcher } from './util/ThemeSwitcher.js';

/** Save default playback settings to sync storage. */
async function saveDefaults(checkBoxState: boolean, playbackRate: string) {
	await chrome.storage.sync.set({
		defaults: {
			enabled: checkBoxState,
			playbackRate: Number.parseFloat(playbackRate) // parseFloat to support fractional rates
		}
	});
}

/** Save badge visibility preference to sync storage. */
async function saveBadgePreference(enabled: boolean) {
	await chrome.storage.sync.set({ badgeEnabled: enabled });
}

/** Initialize badge checkbox from storage. Defaults to enabled if not set. */
async function initBadgePreference(badgeCheckbox: CheckBox): Promise<void> {
	const { badgeEnabled } = await chrome.storage.sync.get('badgeEnabled');
	// Default to true if not set
	badgeCheckbox.checked = badgeEnabled !== false;
}

/** Initialize default settings UI from storage. */
async function initDefaults(defaultsCheckbox: CheckBox, defaultSpeedSelector: Select): Promise<void> {
	const { defaults } = <Defaults>await chrome.storage.sync.get('defaults');
	defaultsCheckbox.checked = defaults?.enabled || false;
	if (defaultsCheckbox.checked) {
		defaultSpeedSelector.disabled = false;
	}
	if (defaults?.playbackRate) {
		document.getElementById(`option-${defaults.playbackRate}`)?.setAttribute('selected', '');
	}
}

/** Initialize theme toggle switch from storage and system preference. */
async function initThemeToggle() {
	const themeSwitcher = await new ThemeSwitcher().init();
	const themeToggleCheckbox = <Switch>document.getElementById('themeToggle')!;
	themeToggleCheckbox.checked = await themeSwitcher.isDarkModeActive();
	themeToggleCheckbox.addEventListener('change', async () => {
		await themeSwitcher.toggle();
	});
}

/** Initialize options page. Exported for testing. */
export async function initOptions(): Promise<void> {
	const defaultsCheckbox = document.getElementById('defaultsEnabledCheckbox') as CheckBox | null;
	const defaultSpeedSelector = document.getElementById('defaultSpeedSelector') as Select | null;
	const badgeCheckbox = document.getElementById('badgeEnabledCheckbox') as CheckBox | null;

	if (!defaultsCheckbox || !defaultSpeedSelector || !badgeCheckbox) {
		return;
	}

	await initDefaults(defaultsCheckbox, defaultSpeedSelector);
	await initBadgePreference(badgeCheckbox);
	await initThemeToggle();

	defaultsCheckbox.addEventListener('change', async (event: Event) => {
		const checkboxIsChecked = (event.target as HTMLInputElement)?.checked;
		defaultSpeedSelector.disabled = !checkboxIsChecked;

		await saveDefaults(checkboxIsChecked, defaultSpeedSelector.selectedOption!.innerText);
	});

	defaultSpeedSelector.addEventListener('change', async () => {
		await saveDefaults(defaultsCheckbox.checked, defaultSpeedSelector.selectedOption!.innerText);
	});

	badgeCheckbox.addEventListener('change', async (event: Event) => {
		const checkboxIsChecked = (event.target as HTMLInputElement)?.checked;
		await saveBadgePreference(checkboxIsChecked);
	});
}

// Auto-initialize when loaded (not in test environment)
// @ts-expect-error - import.meta.vitest is added by vitest
if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && !import.meta.vitest) {
	initOptions();
}
