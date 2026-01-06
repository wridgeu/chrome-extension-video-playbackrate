# Code Review Fixes Documentation

This document describes the issues found during a code review of the Video Speed Regulator Chrome extension and explains the fixes applied.

## Table of Contents

1. [CSS Selector Injection Vulnerability](#1-css-selector-injection-vulnerability)
2. [Event Listener Memory Leak](#2-event-listener-memory-leak)
3. [Null Dereference Risk](#3-null-dereference-risk)
4. [Tab ID Null Check](#4-tab-id-null-check)
5. [Async/Await Error Handling](#5-asyncawait-error-handling)
6. [Duplicate Content Script Injection](#6-duplicate-content-script-injection)
7. [parseInt vs parseFloat](#7-parseint-vs-parsefloat)
8. [Single Video Element Handling](#8-single-video-element-handling)
9. [Startup Speed Options Mismatch](#9-startup-speed-options-mismatch)
10. [Manifest Icon Size Mismatch](#10-manifest-icon-size-mismatch)
11. [Minor Typo Fix](#11-minor-typo-fix)

---

## 1. CSS Selector Injection Vulnerability

**File:** `src/contentscript.ts:85`

**Severity:** Critical

### The Problem

The original code directly interpolated user-controlled data into a CSS selector:

```typescript
document.querySelector(`video[src='${request.videoElementSrcAttributeValue}']`)
```

If the `videoElementSrcAttributeValue` contained special characters like `']`, an attacker could break out of the attribute selector and potentially cause unexpected behavior or denial of service.

### The Fix

Use `CSS.escape()` to sanitize the input before interpolating it into the selector:

```typescript
function findVideoElementBySrc(srcUrl: string): HTMLVideoElement | null {
    return document.querySelector(`video[src='${CSS.escape(srcUrl)}']`);
}
```

`CSS.escape()` is a native browser API that escapes any special characters that have meaning in CSS selectors. This allows us to keep using the browser's native CSS selector engine (which is optimized in C++) rather than falling back to a manual JavaScript loop.

---

## 2. Event Listener Memory Leak

**File:** `src/contentscript.ts:63`

**Severity:** Critical

### The Problem

The original code added an event listener inside the MutationObserver callback:

```typescript
const mutObserver = new MutationObserver((mutationList) => {
    for (const mutation of mutationList) {
        // ...
    }
    videoElement.addEventListener('ratechange', () => mutObserver.disconnect());
});
```

Every time the MutationObserver callback fired (on each `src` attribute change), a new `ratechange` event listener was added. This caused listener accumulation—a memory leak that could degrade performance over time.

### The Fix

Move the event listener registration outside the callback and use the `{ once: true }` option:

```typescript
const mutObserver = new MutationObserver((mutationList) => {
    for (const mutation of mutationList) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
            videoElement.playbackRate = playbackRate;
        }
    }
});

// Add ratechange listener once, outside the MutationObserver callback
videoElement.addEventListener('ratechange', () => mutObserver.disconnect(), { once: true });
```

The `{ once: true }` option ensures the listener is automatically removed after firing, preventing any possibility of accumulation.

---

## 3. Null Dereference Risk

**File:** `src/contentscript.ts:85-86`

**Severity:** Critical

### The Problem

The original code used TypeScript's non-null assertion (`!`) on a querySelector result:

```typescript
(document.querySelector(`video[src='...']`)! as HTMLVideoElement).playbackRate = ...
```

If the video element didn't exist (removed from DOM, src changed, etc.), this would throw a runtime error: `Cannot read property 'playbackRate' of null`.

### The Fix

Use the new `findVideoElementBySrc` function with a null check:

```typescript
const targetVideo = findVideoElementBySrc(request.videoElementSrcAttributeValue);
if (targetVideo) {
    targetVideo.playbackRate = request.playbackRate;
}
```

The null check ensures the code gracefully handles missing video elements without throwing.

---

## 4. Tab ID Null Check

**File:** `src/sw.ts:38-39`

**Severity:** Medium

### The Problem

The original code used optional chaining followed by a type cast:

```typescript
chrome.tabs.sendMessage(<number>tab?.id, ...)
```

This pattern is problematic: if `tab` is undefined, `tab?.id` evaluates to `undefined`, which is then cast to `number`. This passes an invalid value to `sendMessage`.

### The Fix

Add an early return guard:

```typescript
if (!tab?.id) return;
chrome.tabs.sendMessage(tab.id, ...)
```

After the guard, TypeScript knows `tab.id` is defined, and the code only executes with a valid tab ID.

---

## 5. Async/Await Error Handling

**File:** `src/popup.ts:43-55`

**Severity:** Medium

### The Problem

The original code checked `chrome.runtime.lastError` after an `await`:

```typescript
const { playbackRate } = await chrome.tabs.sendMessage(...);
if (chrome.runtime.lastError || !playbackRate) {
    slider.value = 1;
}
```

With async/await, Chrome API errors are thrown as exceptions rather than setting `lastError`. The `lastError` check was ineffective.

### The Fix

Use try/catch for proper async error handling:

```typescript
let playbackRate: number | undefined;
try {
    if (currentActiveTabId) {
        const response = await chrome.tabs.sendMessage(currentActiveTabId, ...);
        playbackRate = (response as RetrieveResponse)?.playbackRate;
    }
} catch {
    playbackRate = undefined;
}
slider.value = playbackRate ?? 1;
```

This correctly handles both successful responses and errors (e.g., content script not injected, restricted page).

---

## 6. Duplicate Content Script Injection

**File:** `src/sw.ts:52-68`

**Severity:** Medium

### The Problem

The `onUpdated` listener injected the content script every time a tab reached the 'complete' status:

```typescript
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
        chrome.scripting.executeScript({ files: ['/js/contentscript.js'] });
    }
});
```

For single-page applications or pages with multiple status changes, this could inject the script multiple times, causing duplicate message listeners and potential memory issues.

### The Fix

Track injected tabs using a Set and clear the tracking on navigation:

```typescript
const injectedTabs = new Set<number>();

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
        if (injectedTabs.has(tabId)) return;

        chrome.scripting.executeScript(..., () => {
            if (!chrome.runtime.lastError) {
                injectedTabs.add(tabId);
            }
        });
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
});

chrome.webNavigation?.onBeforeNavigate?.addListener((details) => {
    if (details.frameId === 0) {
        injectedTabs.delete(details.tabId);
    }
});
```

This ensures each tab receives the content script only once per navigation cycle. The `webNavigation` permission was added to the manifest to support this.

---

## 7. parseInt vs parseFloat

**File:** `src/options.ts:22`

**Severity:** Minor

### The Problem

The original code used `parseInt` to parse playback rates:

```typescript
playbackRate: Number.parseInt(playbackRate)
```

While the options were originally integers (1, 2, 3, 4), the popup slider supports 0.25 increments. Using `parseInt` would truncate fractional values (e.g., "1.5" → 1).

### The Fix

Use `parseFloat` to preserve fractional values:

```typescript
playbackRate: Number.parseFloat(playbackRate)
```

This ensures fractional playback rates like 1.5x or 0.75x are stored correctly.

---

## 8. Single Video Element Handling

**File:** `src/contentscript.ts:51,74`

**Severity:** Minor

### The Problem

The original code only handled the first video element on a page:

```typescript
const [videoElement] = document.querySelectorAll('video');
```

Pages with multiple videos (e.g., video galleries, comparison tools) would only have the first video affected.

### The Fix

Iterate over all video elements:

```typescript
const videoElements = document.querySelectorAll('video');
videoElements.forEach((videoElement) => {
    videoElement.playbackRate = playbackRate;
    // ... MutationObserver setup for each
});
```

For the SET action, all videos on the page now receive the new playback rate.

---

## 9. Startup Speed Options Mismatch

**Files:** `src/options.ts`, `public/options.html`

**Severity:** Minor

### The Problem

The options page only offered integer speeds (1, 2, 3, 4), while the popup slider supported 0.25 increments. Users couldn't set fractional default speeds.

### The Fix

Expanded the options dropdown to include common fractional speeds:

```html
<ui5-option id="option-0.5">0.5</ui5-option>
<ui5-option id="option-0.75">0.75</ui5-option>
<ui5-option id="option-1" selected>1</ui5-option>
<ui5-option id="option-1.25">1.25</ui5-option>
<ui5-option id="option-1.5">1.5</ui5-option>
<ui5-option id="option-1.75">1.75</ui5-option>
<ui5-option id="option-2">2</ui5-option>
<ui5-option id="option-2.5">2.5</ui5-option>
<ui5-option id="option-3">3</ui5-option>
<ui5-option id="option-4">4</ui5-option>
```

This provides better alignment between the popup slider capabilities and the default speed settings.

---

## 10. Manifest Icon Size Mismatch

**File:** `public/manifest.json:20,29`

**Severity:** Minor (No code change)

### The Problem

The manifest specifies a 64px icon for the 48px slot:

```json
"48": "./img/icon_64.png"
```

Chrome's extension system expects icons to match their declared sizes for optimal display.

### The Resolution

The project only includes 16, 32, 64, and 128px icons—no 48px icon exists. Chrome will automatically scale the 64px icon down for 48px contexts. This is acceptable behavior, but for optimal quality, creating a dedicated 48px icon is recommended.

---

## 11. Minor Typo Fix

**File:** `src/util/ThemeSwitcher.ts:75`

**Severity:** Trivial

### The Problem

A typo in a JSDoc comment:

```typescript
* Retrieve last set theme from stroage
```

### The Fix

```typescript
* Retrieve last set theme from storage
```

---

## Summary

| Issue | Severity | Files Changed |
|-------|----------|---------------|
| CSS Selector Injection | Critical | contentscript.ts |
| Event Listener Memory Leak | Critical | contentscript.ts |
| Null Dereference | Critical | contentscript.ts |
| Tab ID Null Check | Medium | sw.ts |
| Async Error Handling | Medium | popup.ts |
| Duplicate Script Injection | Medium | sw.ts, manifest.json |
| parseInt vs parseFloat | Minor | options.ts |
| Single Video Handling | Minor | contentscript.ts |
| Startup Speed Options | Minor | options.html |
| Icon Size Mismatch | Minor | (documented only) |
| Typo | Trivial | ThemeSwitcher.ts |
