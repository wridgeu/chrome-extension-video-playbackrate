import '@ui5/webcomponents/dist/CheckBox';
import '@ui5/webcomponents/dist/Select';
import '@ui5/webcomponents/dist/Option';
import '@ui5/webcomponents/dist/Label';
import { Defaults } from '../types';

/**
 * @todo add types, refactor saving mechanism -> central save (shaking of data)
 */
document.addEventListener('DOMContentLoaded', async () => {
    const defaultsEnabledCheckbox = <any>document.getElementById('defaultsEnabledCheckbox')!;
    const defaultSpeedSelector = <any>document.getElementById('defaultSpeedSelector')!;

    // @todo refactor
    const { defaults } = <Defaults>await chrome.storage.sync.get('defaults');
    defaultsEnabledCheckbox.checked = defaults?.enabled || false;
    if (defaultsEnabledCheckbox.checked) {
        defaultSpeedSelector.disabled = false;
    }
    if (defaults?.playbackRate) {
        document.getElementById(`option-${defaults.playbackRate}`)?.setAttribute('selected', '');
    }

    defaultsEnabledCheckbox.addEventListener('change', async (event: any) => {
        if (event.target.checked === true) {
            defaultSpeedSelector.disabled = false;
        } else {
            defaultSpeedSelector.disabled = true;
        }
        await chrome.storage.sync.set({
            defaults: {
                enabled: event.target.checked,
                playbackRate: defaultSpeedSelector.selectedOption.getInnerHTML()
            }
        });
    });

    defaultSpeedSelector.addEventListener('change', async () => {
        await chrome.storage.sync.set({
            defaults: {
                enabled: defaultsEnabledCheckbox.checked,
                playbackRate: defaultSpeedSelector.selectedOption.getInnerHTML()
            }
        });
    });
});
