/**
 * Default configuration
 */
export type Defaults = {
	defaults: {
		enabled?: boolean;
		playbackRate?: number;
	};
};

export type ChromeMessagingResponse = {
	playbackRate: number;
};

export const enum ChromeMessagingRequestAction {
	'SET',
	'SETSPECIFIC',
	'RETRIEVE'
}

export type ChromeMessagingRequest = {
	action: ChromeMessagingRequestAction;
	playbackRate?: number;
	videoElementSrcAttributeValue?: string;
};

export type ContextMenuStorage = {
	contextMenuOptions: ContextMenuOption[];
};

export type ContextMenuOption = {
	id: string;
	title: string;
	playbackRate: number;
	default?: boolean;
};

/**
 * rudimentary type including only properties of the Slider slider Component
 * https://sap.github.io/ui5-webcomponents/playground/components/Slider/
 */
export interface IUi5Slider extends HTMLElement {
	value: number;
	disabled: boolean;
	labelInterval: number;
	max: number;
	min: number;
	showTickmarks: boolean;
	showTooltip: boolean;
	step: boolean;
}

export interface IUi5Select extends HTMLSelectElement {
	disabled: boolean;
	selectedOption: HTMLOptionElement;
}
