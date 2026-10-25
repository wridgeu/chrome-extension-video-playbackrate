import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chromeMock, mockStorage } from '@tests/unit/setup';
import { initOptions } from '@src/options';
import { PLAYBACK_RATES } from '@src/util/playback';

const themeSwitcher = vi.hoisted(() => ({
	getMode: vi.fn<() => string>(() => 'system'),
	setMode: vi.fn<(mode: string) => Promise<void>>(() => Promise.resolve())
}));
vi.mock('@src/util/ThemeSwitcher.js', () => ({
	ThemeSwitcher: class {
		getMode = themeSwitcher.getMode;
		setMode = themeSwitcher.setMode;
		init() {
			return Promise.resolve(this);
		}
	}
}));

type Control = HTMLElement & { checked: boolean; value: string; selected: boolean };

describe('Options Page', () => {
	let speedSelect: Control;
	let badgeToggle: Control;
	let themeMode: HTMLElement & { selectedItems: Control[] };
	let saveError: HTMLElement;

	const themeItem = (mode: string) => themeMode.querySelector<Control>(`[data-mode="${mode}"]`)!;
	const choose = (value: string) => {
		speedSelect.value = value;
		speedSelect.dispatchEvent(new Event('change'));
	};

	beforeEach(() => {
		document.body.innerHTML = `
			<div id="saveError" hidden></div>
			<div id="defaultSpeed"></div>
			<div id="badgeToggle"></div>
			<div id="themeMode">
				<div data-mode="system"></div><div data-mode="light"></div><div data-mode="dark"></div>
			</div>`;
		saveError = document.querySelector('#saveError')!;
		speedSelect = document.querySelector('#defaultSpeed')!;
		badgeToggle = document.querySelector('#badgeToggle')!;
		themeMode = document.querySelector('#themeMode')!;
		themeMode.selectedItems = [];
	});

	describe('initialization', () => {
		it('offers "Don\'t change" plus every shared rate', async () => {
			await initOptions();

			const values = Array.from(speedSelect.children, (option) => (option as Control).value);
			expect(values).toEqual(['off', ...PLAYBACK_RATES.map(String)]);
			expect(speedSelect.children[0]!.textContent).toBe("Don't change (site default)");
		});

		it('selects the stored default speed and badge setting', async () => {
			Object.assign(mockStorage, { defaults: { enabled: true, playbackRate: 2 }, badgeEnabled: false });

			await initOptions();

			expect(speedSelect.value).toBe('2');
			expect(badgeToggle.checked).toBe(false);
		});

		it('selects "Don\'t change" and the badge when nothing is stored', async () => {
			await initOptions();

			expect(speedSelect.value).toBe('off');
			expect(badgeToggle.checked).toBe(true);
		});

		it('marks the active theme mode', async () => {
			themeSwitcher.getMode.mockReturnValue('dark');

			await initOptions();

			expect([themeItem('system').selected, themeItem('light').selected, themeItem('dark').selected]).toEqual([
				false,
				false,
				true
			]);
		});
	});

	describe('saving', () => {
		beforeEach(async () => {
			mockStorage.defaults = { enabled: false, playbackRate: 1.5 };
			await initOptions();
			chromeMock.storage.sync.set.mockClear();
		});

		it('saves a chosen speed as enabled defaults', () => {
			choose('2.5');

			expect(chromeMock.storage.sync.set).toHaveBeenCalledWith({ defaults: { enabled: true, playbackRate: 2.5 } });
		});

		it('"Don\'t change" disables defaults but keeps the last speed', () => {
			choose('2');
			choose('off');

			expect(chromeMock.storage.sync.set).toHaveBeenLastCalledWith({ defaults: { enabled: false, playbackRate: 2 } });
		});

		it('saves the badge preference', () => {
			badgeToggle.checked = false;
			badgeToggle.dispatchEvent(new Event('change'));

			expect(chromeMock.storage.sync.set).toHaveBeenCalledWith({ badgeEnabled: false });
		});

		it('switches the theme mode on selection', () => {
			themeMode.selectedItems = [themeItem('light')];
			themeMode.dispatchEvent(new Event('selection-change'));

			expect(themeSwitcher.setMode).toHaveBeenCalledWith('light');
		});

		it('shows a failed save and hides the message after the next successful one', async () => {
			chromeMock.storage.sync.set.mockRejectedValueOnce(new Error('MAX_WRITE_OPERATIONS_PER_MINUTE'));

			choose('2');
			await vi.waitFor(() => expect(saveError.hidden).toBe(false));
			expect(saveError.textContent).toBe("Couldn't save settings: MAX_WRITE_OPERATIONS_PER_MINUTE");

			choose('3');
			await vi.waitFor(() => expect(saveError.hidden).toBe(true));
		});
	});

	it('does nothing when the page is missing a control', async () => {
		themeMode.remove();

		await initOptions();

		expect(chromeMock.storage.sync.get).not.toHaveBeenCalled();
	});
});
