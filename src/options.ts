import type CheckBox from '@ui5/webcomponents/dist/CheckBox.js';
import type Select from '@ui5/webcomponents/dist/Select.js';
import type Switch from '@ui5/webcomponents/dist/Switch.js';
import '@ui5/webcomponents/dist/CheckBox.js';
import '@ui5/webcomponents/dist/Label.js';
import '@ui5/webcomponents/dist/Option.js';
import '@ui5/webcomponents/dist/Select.js';
import '@ui5/webcomponents/dist/Switch.js';
import '@ui5/webcomponents/dist/Title.js';

import type { Defaults } from '@src/types';
import { ThemeSwitcher } from '@src/util/ThemeSwitcher';

type OptionsStorage = Defaults & { badgeEnabled?: boolean };

/** Initialize options page. Exported for testing. */
export async function initOptions(): Promise<void> {
	const defaultsCheckbox = document.querySelector<CheckBox>('#defaultsEnabledCheckbox');
	const defaultSpeedSelector = document.querySelector<Select>('#defaultSpeedSelector');
	const badgeCheckbox = document.querySelector<CheckBox>('#badgeEnabledCheckbox');
	const themeToggle = document.querySelector<Switch>('#themeToggle');
	if (!defaultsCheckbox || !defaultSpeedSelector || !badgeCheckbox || !themeToggle) return;

	const { defaults, badgeEnabled } = (await chrome.storage.sync.get(['defaults', 'badgeEnabled'])) as OptionsStorage;
	defaultsCheckbox.checked = defaults?.enabled ?? false;
	defaultSpeedSelector.disabled = !defaultsCheckbox.checked;
	defaultSpeedSelector.value = String(defaults?.playbackRate ?? 1);
	// Badge is enabled unless explicitly turned off
	badgeCheckbox.checked = badgeEnabled !== false;

	const themeSwitcher = await new ThemeSwitcher().init();
	themeToggle.checked = themeSwitcher.isDarkModeActive();
	themeToggle.addEventListener('change', () => themeSwitcher.toggle());

	const saveDefaults = () =>
		chrome.storage.sync.set({
			defaults: { enabled: defaultsCheckbox.checked, playbackRate: Number(defaultSpeedSelector.value) }
		});

	defaultsCheckbox.addEventListener('change', () => {
		defaultSpeedSelector.disabled = !defaultsCheckbox.checked;
		saveDefaults();
	});
	defaultSpeedSelector.addEventListener('change', saveDefaults);
	badgeCheckbox.addEventListener('change', () => chrome.storage.sync.set({ badgeEnabled: badgeCheckbox.checked }));
}

if (import.meta.env.MODE !== 'test') {
	await initOptions();
}
