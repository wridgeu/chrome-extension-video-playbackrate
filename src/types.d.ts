// Thanks to O'Reillys Programming Typescript
// Used for ambient type declarations (available everywhere in the project without importing)

// eslint-disable-next-line max-len
// Fix: "Could not find a declaration file for module '@ui5/webcomponents-base/dist/config/Theme.js'. implicitly has an 'any' type."
// Copy from UI5 WebC for react:
// eslint-disable-next-line max-len
// https://github.com/SAP/ui5-webcomponents-react/blob/5e7c990046fb1b8f356803307fe20bc7e1bc2ccf/packages/base/types/Theme.d.ts
declare module '@ui5/webcomponents-base/dist/config/Theme*' {
	export type ThemeId =
		| 'sap_fiori_3'
		| 'sap_fiori_3_dark'
		| 'sap_belize'
		| 'sap_belize_hcb'
		| 'sap_belize_hcw'
		| 'sap_fiori_3_hcb'
		| 'sap_fiori_3_hcw'
		| 'sap_horizon_dark'
		| 'sap_horizon'
		| string;

	/**
	 * Getter for the currenty applied theme.
	 */
	export function getTheme(): ThemeId;

	/**
	 * Apply a new theme to the application.
	 */
	export function setTheme(theme: ThemeId): Promise<void>;
}

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
