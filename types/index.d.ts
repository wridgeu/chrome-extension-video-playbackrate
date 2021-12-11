export type VideoElementIdentifier = {
    src: string;
};

export type TabHistoryEntry = {
    tabId: number;
    targetSpeed: number;
};

export type Defaults = {
    defaults: {
        defaultSpeed: number;
    };
};

/**
 * rudimentary type with only added what I currently "need"
 */
export interface UI5Slider extends HTMLElement {
    value: number;
}
