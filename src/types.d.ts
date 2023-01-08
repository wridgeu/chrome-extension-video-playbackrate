// Thanks to O'Reillys Programming Typescript
// Used for ambient type declarations (available everywhere in the project without importing)

// Fix:
// "Could not find a declaration file for module '@ui5/webcomponents-base/dist/config/Theme.js'.
// implicitly has an 'any' type."
declare module '@ui5/webcomponents-base/dist/config/Theme.js';

/**
 * Default configuration
 */
type Defaults = {
	defaults: {
		enabled?: boolean;
		playbackRate?: number;
	};
};

type ChromeMessagingResponse = {
	playbackRate: number;
};

type ChromeMessagingRequest = {
	action: ChromeMessagingRequestAction;
	playbackRate?: number;
	videoElementSrcAttributeValue?: string;
};

type ContextMenuStorage = {
	contextMenuOptions: ContextMenuOption[];
};

type ContextMenuOption = {
	id: string;
	title: string;
	playbackRate: number;
	default?: boolean;
};

/**
 * rudimentary type including only properties of the Slider slider Component
 * https://sap.github.io/ui5-webcomponents/playground/components/Slider/
 */
interface IUI5Slider extends HTMLElement {
	value: number;
	disabled: boolean;
	labelInterval: number;
	max: number;
	min: number;
	showTickmarks: boolean;
	showTooltip: boolean;
	step: boolean;
}

interface IUI5Select extends HTMLSelectElement {
	disabled: boolean;
	selectedOption: HTMLOptionElement;
}
