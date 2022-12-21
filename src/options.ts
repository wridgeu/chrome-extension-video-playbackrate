import { Defaults, IUi5Select } from './types';
import '@ui5/webcomponents/dist/Switch';
import '@ui5/webcomponents/dist/CheckBox';
import '@ui5/webcomponents/dist/Select';
import '@ui5/webcomponents/dist/Option';
import '@ui5/webcomponents/dist/Label';
import '@ui5/webcomponents/dist/Title';
import { ThemeSwitcher } from './util/ThemeSwitcher';

(async () => {
	const defaultsCheckbox = <HTMLInputElement>document.getElementById('defaultsEnabledCheckbox')!;
	const defaultSpeedSelector = <IUi5Select>document.getElementById('defaultSpeedSelector')!;

	await initDefaults(defaultsCheckbox, defaultSpeedSelector);
	await initThemeToggle();

	defaultsCheckbox.addEventListener('change', async (event: Event) => {
		const checkboxIsChecked = (event.target as HTMLInputElement)?.checked;
		if (checkboxIsChecked === true) {
			defaultSpeedSelector.disabled = false;
		} else {
			defaultSpeedSelector.disabled = true;
		}

		await saveDefaults(checkboxIsChecked, defaultSpeedSelector.selectedOption.innerText);
	});

	defaultSpeedSelector.addEventListener('change', async () => {
		await saveDefaults(defaultsCheckbox.checked, defaultSpeedSelector.selectedOption.innerText);
	});
})();

/**
 * Wrapper for the chrome.storage.sync for default settings.
 *
 * @param {boolean} checkBoxState
 * @param {string} playbackRate
 */
async function saveDefaults(checkBoxState: boolean, playbackRate: string) {
	await chrome.storage.sync.set({
		defaults: {
			enabled: checkBoxState,
			playbackRate: parseInt(playbackRate) // parse our string to a number
		}
	});
}

async function initDefaults(defaultsCheckbox: HTMLInputElement, defaultSpeedSelector: IUi5Select): Promise<void> {
	const { defaults } = <Defaults>await chrome.storage.sync.get('defaults');
	defaultsCheckbox.checked = defaults?.enabled || false;
	if (defaultsCheckbox.checked) {
		defaultSpeedSelector.disabled = false;
	}
	if (defaults?.playbackRate) {
		document.getElementById(`option-${defaults.playbackRate}`)?.setAttribute('selected', '');
	}
}

async function initThemeToggle() {
	const themeSwitcher = await new ThemeSwitcher().init();
	const themeToggleCheckbox = <HTMLInputElement>document.getElementById('themeToggle')!;
	themeToggleCheckbox.checked = await themeSwitcher.isDarkModeActive();
	themeToggleCheckbox.addEventListener('change', async () => {
		await themeSwitcher.toggle();
	});
}
