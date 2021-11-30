# Chrome Browser Extension - Video Playback Rate

This extension is primarily for _chrome_ and (so far) mostly based on the getting started tutorial from [Chrome Developers](https://developer.chrome.com/docs/extensions/mv3/getstarted/).

## Why?

Why does this repository/extension exist? Well ... quite simple:

- I wanted to check out how a browser extension is made (a bit more hands-on)
- Wanted to explore some new things
- Even though there are already extensions out there to increase the speed of a video, I wanted my own 🤪

Due to limited time and some irl wrist issues I'm just getting started with this and build it in public in order to hold myself accountable and actually pull through. 🪅

## ToDo

- [ ] Actually implement the core/base functionality.
- [ ] How is an extension being deployed?
- [x] How is a third party library being added (npm)?
  - Kind of answered this myself, although not really using a third party library but WebComponents instead
- [ ] What else could I do with it?
  - [ ] Add button for .X speed adjustments
  - [ ] Rework UI & use ShadowParts (Shadow DOM CSS)
  - [ ] Add list of Video-Elements on popup-page so the user can manually switch in case of multiple `video`-tags
  - [ ] Add proper error-handling
  - [ ] Rework sync. storage usage of chrome
  - [ ] Make extension cross-browser compatible
  - [ ] Learn more about .d.ts files and how to properly declare & add them into the project
  - [ ] Make extension [themable](https://sap.github.io/ui5-webcomponents/playground/advanced/configuration/#theme) (include in options)
  - [ ] Make extension "save" your latest setting & automatically apply them on new pages (include in options)
  - [x] Make UI respect your latest change within the tab (if you selected 2 and reopen the extension it should also reflect speedValue 2)
  - [x] Configure [prettier](https://prettier.io/docs/en/install.html)
  - [x] Add and configure ESLint
- [x] Rethink the folder structure.
- [x] Configure [rollup.js](https://rollupjs.org/guide/en/) for building the project
  - TS => JS => bundle/build/merge JS + Public folder => Dist

## Sources

- [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Build_a_cross_browser_extension)
- [Chrome Developers](https://developer.chrome.com/docs/extensions/mv3/getstarted/)
  - [What are Extensions?](https://developer.chrome.com/docs/extensions/mv3/overview/)
  - [Debugging Extensions](https://developer.chrome.com/docs/extensions/mv3/tut_debugging/)
  - [Extensions API Reference](https://developer.chrome.com/docs/extensions/reference/)
- [FreeCodeCamp](https://www.freecodecamp.org/news/write-your-own-browser-extensions/)
- [Chrome Extensions React+TS Starter](https://github.com/chibat/chrome-extension-typescript-starter)
- [UI5 Web Components - Slider](https://sap.github.io/ui5-webcomponents/playground/components/Slider/)
