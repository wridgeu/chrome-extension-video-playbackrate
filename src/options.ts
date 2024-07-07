import '@ui5/webcomponents/dist/Switch.js';
import '@ui5/webcomponents/dist/CheckBox.js';
import '@ui5/webcomponents/dist/Select.js';
import '@ui5/webcomponents/dist/Option.js';
import '@ui5/webcomponents/dist/Label.js';
import '@ui5/webcomponents/dist/Title.js';
import type Select from '@ui5/webcomponents/dist/Select.js';
import { ThemeSwitcher } from './util/ThemeSwitcher.js';
import type { Defaults } from './contentscript.js';
import type CheckBox from '@ui5/webcomponents/dist/CheckBox.js';
import type Switch from '@ui5/webcomponents/dist/Switch.js';

/**
 * Wrapper for the chrome.storage.sync for default settings.
 * @param {boolean} checkBoxState
 * @param {string} playbackRate
 */
async function saveDefaults(checkBoxState: boolean, playbackRate: string) {
	await chrome.storage.sync.set({
		defaults: {
			enabled: checkBoxState,
			playbackRate: Number.parseInt(playbackRate) // parse our string to a number
		}
	});
}

/**
 *
 * @param defaultsCheckbox
 * @param defaultSpeedSelector
 */
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

/**
 *
 */
async function initThemeToggle() {
	const themeSwitcher = await new ThemeSwitcher().init();
	const themeToggleCheckbox = <Switch>document.getElementById('themeToggle')!;
	themeToggleCheckbox.checked = await themeSwitcher.isDarkModeActive();
	themeToggleCheckbox.addEventListener('change', async () => {
		await themeSwitcher.toggle();
	});
}

(async () => {
	const defaultsCheckbox = <CheckBox>document.getElementById('defaultsEnabledCheckbox')!;
	const defaultSpeedSelector = <Select>document.getElementById('defaultSpeedSelector')!;

	await initDefaults(defaultsCheckbox, defaultSpeedSelector);
	await initThemeToggle();

	defaultsCheckbox.addEventListener('change', async (event: Event) => {
		const checkboxIsChecked = (event.target as HTMLInputElement)?.checked;
		if (checkboxIsChecked === true) {
			defaultSpeedSelector.disabled = false;
		} else {
			defaultSpeedSelector.disabled = true;
		}

		await saveDefaults(checkboxIsChecked, defaultSpeedSelector.selectedOption!.innerText);
	});

	defaultSpeedSelector.addEventListener('change', async () => {
		await saveDefaults(defaultsCheckbox.checked, defaultSpeedSelector.selectedOption!.innerText);
	});
})();
