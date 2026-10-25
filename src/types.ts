/**
 * Shared types and enums for messaging from the popup and content script to the service worker.
 * This file is kept separate to avoid importing content script code into the service worker.
 */

// Using const object instead of const enum for better bundler compatibility
export const MessagingAction = {
	UPDATE_CONTEXT_MENU: 0,
	UPDATE_UI: 1
} as const;

type UpdateContextMenuPayload = {
	action: typeof MessagingAction.UPDATE_CONTEXT_MENU;
	playbackRate: number;
};

type UpdateUiPayload = {
	action: typeof MessagingAction.UPDATE_UI;
	playbackRate: number;
	/** Only set by the popup; content script messages carry the tab in `sender.tab`. */
	tabId?: number;
};

/** User's default playback rate configuration stored in sync storage. */
export type DefaultsStorage = {
	defaults?: {
		enabled?: boolean;
		playbackRate?: number;
	};
};

/** Discriminated union of messages handled by the service worker. */
export type MessagingRequestPayload = UpdateContextMenuPayload | UpdateUiPayload;
