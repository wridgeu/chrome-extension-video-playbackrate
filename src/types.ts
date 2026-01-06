/**
 * Shared types and enums for messaging between extension components.
 * This file is kept separate to avoid importing content script code into the service worker.
 */

// Using const object instead of const enum for better bundler compatibility
// See: https://biomejs.dev/linter/rules/no-const-enum/
export const MessagingAction = {
    SET: 0,
    SETSPECIFIC: 1,
    RETRIEVE: 2,
    UPDATE_CONTEXT_MENU: 3,
    UPDATE_BADGE: 4
} as const;

export type MessagingAction = (typeof MessagingAction)[keyof typeof MessagingAction];

type SetSpecificActionPayload = {
    action: typeof MessagingAction.SETSPECIFIC;
    playbackRate: number;
    videoElementSrcAttributeValue: string;
};

type SetActionPayload = {
    action: typeof MessagingAction.SET;
    playbackRate: number;
};

type RetrieveActionPayload = {
    action: typeof MessagingAction.RETRIEVE;
};

type UpdateContextMenuPayload = {
    action: typeof MessagingAction.UPDATE_CONTEXT_MENU;
    playbackRate: number;
};

type UpdateBadgePayload = {
    action: typeof MessagingAction.UPDATE_BADGE;
    playbackRate: number;
};

/** Discriminated union for messaging between popup/service worker and content script. */
export type MessagingRequestPayload =
    | SetSpecificActionPayload
    | SetActionPayload
    | RetrieveActionPayload
    | UpdateContextMenuPayload
    | UpdateBadgePayload;

export type RetrieveResponse = {
    playbackRate: number;
    videoCount: number;
};

/** User's default playback rate configuration stored in sync storage. */
export type Defaults = {
    defaults: {
        enabled?: boolean;
        playbackRate?: number;
    };
};
