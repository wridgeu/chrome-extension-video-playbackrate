import type { Mock } from 'vitest';

/** Base mock element with event listener methods */
export interface MockElement extends Partial<HTMLElement> {
	addEventListener: Mock;
	removeEventListener?: Mock;
}

/** Mock slider element matching UI5 Slider interface */
export interface MockSlider extends MockElement {
	value: number;
	min: string;
	max: string;
	shadowRoot: ShadowRoot;
}

/** Mock tooltip element with Popover API methods */
export interface MockTooltip extends Partial<HTMLElement> {
	textContent: string;
	offsetWidth: number;
	style: CSSStyleDeclaration;
	getBoundingClientRect: () => DOMRect;
	showPopover: Mock;
	hidePopover: Mock;
	matches: Mock;
}

/** Mock checkbox element */
export interface MockCheckbox extends MockElement {
	checked: boolean;
	disabled?: boolean;
}

/** Mock select element */
export interface MockSelect extends MockElement {
	disabled: boolean;
	selectedOption: {
		innerText: string;
	} | null;
}
