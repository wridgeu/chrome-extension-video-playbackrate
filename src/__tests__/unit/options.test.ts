import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chromeMock, mockStorage } from '@tests/unit/setup';
import { initOptions } from '@src/options';

const themeSwitcher = vi.hoisted(() => ({
	init: vi.fn<() => Promise<unknown>>(() => Promise.resolve()),
	isDarkModeActive: vi.fn<() => boolean>(),
	toggle: vi.fn<() => Promise<void>>()
}));
vi.mock('@src/util/ThemeSwitcher.js', () => ({
	ThemeSwitcher: class {
		init = () => themeSwitcher.init().then(() => this);
		isDarkModeActive = themeSwitcher.isDarkModeActive;
		toggle = themeSwitcher.toggle;
	}
}));

type Control = HTMLElement & { checked: boolean; disabled: boolean; value: string };

describe('Options Page', () => {
	let defaultsCheckbox: Control;
	let speedSelector: Control;
	let badgeCheckbox: Control;
	let themeToggle: Control;

	/** Toggle a checkbox/switch like a user click would, then let async handlers settle. */
	const toggle = (control: Control) => {
		control.checked = !control.checked;
		control.dispatchEvent(new Event('change'));
	};

	beforeEach(() => {
		document.body.innerHTML = `
			<div id="defaultsEnabledCheckbox"></div>
			<div id="defaultSpeedSelector"></div>
			<div id="badgeEnabledCheckbox"></div>
			<div id="themeToggle"></div>`;
		[defaultsCheckbox, speedSelector, badgeCheckbox, themeToggle] = Array.from(document.body.children) as [
			Control,
			Control,
			Control,
			Control
		];
		speedSelector.value = '1';
	});

	describe('initialization', () => {
		it('restores enabled defaults, the chosen speed and the badge setting', async () => {
			Object.assign(mockStorage, { defaults: { enabled: true, playbackRate: 2 }, badgeEnabled: false });

			await initOptions();

			expect(defaultsCheckbox.checked).toBe(true);
			expect(speedSelector.disabled).toBe(false);
			expect(speedSelector.value).toBe('2');
			expect(badgeCheckbox.checked).toBe(false);
		});

		it('starts with defaults off, selector disabled at 1x and badge on when nothing is stored', async () => {
			await initOptions();

			expect(defaultsCheckbox.checked).toBe(false);
			expect(speedSelector.disabled).toBe(true);
			expect(speedSelector.value).toBe('1');
			expect(badgeCheckbox.checked).toBe(true);
		});

		it('reflects the active theme in the dark mode switch', async () => {
			themeSwitcher.isDarkModeActive.mockReturnValue(true);

			await initOptions();

			expect(themeToggle.checked).toBe(true);
		});
	});

	describe('saving', () => {
		beforeEach(async () => {
			await initOptions();
			chromeMock.storage.sync.set.mockClear();
		});

		it('enables the selector and saves defaults with the selected speed when defaults get enabled', () => {
			speedSelector.value = '1.5';
			toggle(defaultsCheckbox);

			expect(speedSelector.disabled).toBe(false);
			expect(chromeMock.storage.sync.set).toHaveBeenCalledWith({ defaults: { enabled: true, playbackRate: 1.5 } });
		});

		it('disables the selector again when defaults get disabled', () => {
			toggle(defaultsCheckbox);
			toggle(defaultsCheckbox);

			expect(speedSelector.disabled).toBe(true);
			expect(chromeMock.storage.sync.set).toHaveBeenLastCalledWith({ defaults: { enabled: false, playbackRate: 1 } });
		});

		it('saves a newly selected speed', () => {
			speedSelector.value = '2.5';
			speedSelector.dispatchEvent(new Event('change'));

			expect(chromeMock.storage.sync.set).toHaveBeenCalledWith({ defaults: { enabled: false, playbackRate: 2.5 } });
		});

		it('saves the badge preference', () => {
			toggle(badgeCheckbox);

			expect(chromeMock.storage.sync.set).toHaveBeenCalledWith({ badgeEnabled: false });
		});

		it('toggles the theme from the dark mode switch', () => {
			toggle(themeToggle);

			expect(themeSwitcher.toggle).toHaveBeenCalledOnce();
		});
	});

	it('does nothing when the page is missing a control', async () => {
		themeToggle.remove();

		await initOptions();

		expect(chromeMock.storage.sync.get).not.toHaveBeenCalled();
	});
});
