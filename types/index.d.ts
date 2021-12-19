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
    'RETRIEVE'
}

export type ChromeMessagingRequest = {
    action: ChromeMessagingRequestAction;
    playbackRate?: number;
};

/**
 * rudimentary type including only properties of the Slider slider Component
 * https://sap.github.io/ui5-webcomponents/playground/components/Slider/
 */
export interface UI5Slider extends HTMLElement {
    value: number;
    disabled: boolean;
    labelInterval: number;
    max: number;
    min: number;
    showTickmarks: boolean;
    showTooltip: boolean;
    step: boolean;
}
