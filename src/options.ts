import type MessageStrip from '@ui5/webcomponents/dist/MessageStrip.js';
import type SegmentedButton from '@ui5/webcomponents/dist/SegmentedButton.js';
import type Select from '@ui5/webcomponents/dist/Select.js';
import type Switch from '@ui5/webcomponents/dist/Switch.js';
import '@ui5/webcomponents/dist/Form.js';
import '@ui5/webcomponents/dist/FormGroup.js';
import '@ui5/webcomponents/dist/FormItem.js';
import '@ui5/webcomponents/dist/Label.js';
import '@ui5/webcomponents/dist/MessageStrip.js';
import '@ui5/webcomponents/dist/Option.js';
import '@ui5/webcomponents/dist/SegmentedButton.js';
import '@ui5/webcomponents/dist/SegmentedButtonItem.js';
import '@ui5/webcomponents/dist/Select.js';
import '@ui5/webcomponents/dist/Switch.js';

import type { DefaultsStorage } from '@src/types';
import { PLAYBACK_RATES, formatRate } from '@src/util/playback';
import { ThemeSwitcher, type ThemeMode } from '@src/util/ThemeSwitcher';

type OptionsStorage = DefaultsStorage & { badgeEnabled?: boolean };

/** Speed select value for "leave the site's speed alone" (= defaults disabled). */
const OFF = 'off';

/** Run a storage write; a failure (e.g. the sync write quota) is shown in the strip instead of silently lost. */
type Save = (write: () => Promise<unknown>) => Promise<void>;

function createSave(errorStrip: MessageStrip): Save {
	return async (write) => {
		try {
			await write();
			errorStrip.hidden = true;
		} catch (error) {
			errorStrip.textContent = `Couldn't save settings: ${error instanceof Error ? error.message : String(error)}`;
			errorStrip.hidden = false;
		}
	};
}

/** Fill the speed select with "Don't change" plus every shared rate, select the stored choice and save changes. */
function initSpeedSelect(select: Select, defaults: OptionsStorage['defaults'], save: Save): void {
	const choices: [string, string][] = [
		[OFF, "Don't change (site default)"],
		...PLAYBACK_RATES.map((rate): [string, string] => [String(rate), formatRate(rate)])
	];
	select.append(
		...choices.map(([value, text]) => Object.assign(document.createElement('ui5-option'), { value, textContent: text }))
	);

	// "Off" keeps the last chosen rate, so switching back on restores it (same storage format as before)
	let lastRate = defaults?.playbackRate ?? 1;
	select.value = defaults?.enabled ? String(lastRate) : OFF;
	select.addEventListener('change', () => {
		const enabled = select.value !== OFF;
		if (enabled) lastRate = Number(select.value);
		save(() => chrome.storage.sync.set({ defaults: { enabled, playbackRate: lastRate } }));
	});
}

/** Reflect the active theme mode in the segmented button and switch modes on selection. */
async function initThemeMode(themeMode: SegmentedButton, save: Save): Promise<void> {
	const themeSwitcher = await new ThemeSwitcher().init();
	for (const item of themeMode.querySelectorAll<HTMLElement & { selected: boolean }>('[data-mode]')) {
		item.selected = item.dataset.mode === themeSwitcher.getMode();
	}
	themeMode.addEventListener('selection-change', () => {
		const mode = themeMode.selectedItems[0]?.dataset.mode as ThemeMode | undefined;
		if (mode) save(() => themeSwitcher.setMode(mode));
	});
}

/** Initialize options page. Exported for testing. */
export async function initOptions(): Promise<void> {
	const speedSelect = document.querySelector<Select>('#defaultSpeed');
	const badgeToggle = document.querySelector<Switch>('#badgeToggle');
	const themeMode = document.querySelector<SegmentedButton>('#themeMode');
	const saveError = document.querySelector<MessageStrip>('#saveError');
	if (!speedSelect || !badgeToggle || !themeMode || !saveError) return;

	const save = createSave(saveError);
	const { defaults, badgeEnabled } = (await chrome.storage.sync.get(['defaults', 'badgeEnabled'])) as OptionsStorage;
	initSpeedSelect(speedSelect, defaults, save);

	// Badge is enabled unless explicitly turned off
	badgeToggle.checked = badgeEnabled !== false;
	badgeToggle.addEventListener('change', () =>
		save(() => chrome.storage.sync.set({ badgeEnabled: badgeToggle.checked }))
	);

	await initThemeMode(themeMode, save);
}

if (import.meta.env.MODE !== 'test') {
	await initOptions();
}
