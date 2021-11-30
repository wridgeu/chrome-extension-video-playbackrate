export type VideoElementIdentifier = {
    class: DOMTokenList
    src: string
}

/**
 * rudimentary type with only added what I currently "need"
 */
export interface UI5Slider extends HTMLElement {
    value: number
}
