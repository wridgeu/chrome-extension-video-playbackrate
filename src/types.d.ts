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

type ThemeId =
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
