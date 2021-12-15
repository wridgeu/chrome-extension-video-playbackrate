import '@ui5/webcomponents/dist/CheckBox';
import '@ui5/webcomponents/dist/Select';
import '@ui5/webcomponents/dist/Option';
import '@ui5/webcomponents/dist/Label';

/**
 * @todo add types, refactor saving mechanism -> central save (shaking of data)
 */
document.addEventListener('DOMContentLoaded', async () => {
    const defaultsEnabledCheckbox = <any>document.getElementById('defaultsEnabledCheckbox')!;
    const defaultSpeedSelector = <any>document.getElementById('defaultSpeedSelector')!;

    // @todo refactor
    const { defaults } = await chrome.storage.sync.get('defaults');
    defaultsEnabledCheckbox.checked = defaults?.enabled || false;
    if (defaultsEnabledCheckbox.checked) {
        defaultSpeedSelector.disabled = false;
    }
    if (defaults?.playbackrate) {
        document.getElementById(`option-${defaults.playbackrate}`)?.setAttribute('selected', '');
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
                playbackrate: defaultSpeedSelector.selectedOption.getInnerHTML()
            }
        });
    });

    defaultSpeedSelector.addEventListener('change', async (event: any) => {
        await chrome.storage.sync.set({
            defaults: {
                enabled: defaultsEnabledCheckbox.checked,
                playbackrate: defaultSpeedSelector.selectedOption.getInnerHTML()
            }
        });
    });
});

// let page = <HTMLDivElement>document.getElementById("buttonDiv");
// let selectedClassName = "current";
// const presetButtonColors = ["#3aa757", "#e8453c", "#f9bb2d", "#4688f1"];

// // Reacts to a button click by marking the selected button and saving
// // the selection
// function handleButtonClick(event: any) {
//   // Remove styling from the previously selected color
//   let current = event.target.parentElement.querySelector(
//     `.${selectedClassName}`
//   );
//   if (current && current !== event.target) {
//     current.classList.remove(selectedClassName);
//   }

//   // Mark the button as selected
//   let color = event.target.dataset.color;
//   event.target.classList.add(selectedClassName);
//   chrome.storage.sync.set({ color });
// }

// // Add a button to the page for each supplied color
// function constructOptions(buttonColors: any) {
//   chrome.storage.sync.get("color", (data) => {
//     let currentColor = data.color;
//     // For each color we were provided…
//     for (let buttonColor of buttonColors) {
//       // …create a button with that color…
//       let button = document.createElement("button");
//       button.dataset.color = buttonColor;
//       button.style.backgroundColor = buttonColor;

//       // …mark the currently selected color…
//       if (buttonColor === currentColor) {
//         button.classList.add(selectedClassName);
//       }

//       // …and register a listener for when that button is clicked
//       button.addEventListener("click", handleButtonClick);
//       page.appendChild(button);
//     }
//   });
// }

// // Initialize the page by constructing the color options
// constructOptions(presetButtonColors);
