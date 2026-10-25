# Chrome Web Store images

`store-1-popup.png` and `store-2-settings.png` are the store screenshots: 1280×800, 24-bit PNG without alpha, as the store requires.

They are built from real screenshots of the current build: the popup and the settings page in dark and light. Only the browser window around the popup is drawn. Recreate them after UI changes so the store shows what users get.

## Visual style

Use these for any store graphic (screenshots, the small promo tile, marquee) so they look like one family. The colours come from the icon.

| Element                                                  | Value                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Logo                                                     | `docs/img/icon_512.png`, unchanged (no recolouring or cropping)                                 |
| Background                                               | Linear gradient at 135°: `#f4ec3c` 0%, `#fbc52f` 38%, `#f9a53a` 70%, `#f26b35` 100%             |
| Text and dark accent (the icon's arrows)                 | `#2f343b`                                                                                       |
| Body text on the gradient                                | `#3d3a33`                                                                                       |
| Bullet check marks                                       | `#fbc52f` tick on a `#2f343b` circle                                                            |
| Speed badge (the extension's own colours in `src/sw.ts`) | `#F7B731` background, `#000000` text                                                            |
| Font                                                     | [Inter](https://fonts.google.com/specimen/Inter): 800 headline, 700 name, 500 bullets, 400 body |
| Shadows                                                  | Warm, never grey: `0 30px 60px -12px rgba(80, 30, 0, 0.45)`                                     |

**Type sizes at 1280×800:** headline 58px with tight tracking (`-0.03em`), lead text 22px, bullets 19px, product name 22px next to the 64px icon.

**Layout:** copy on the left (80px margin, about 460px wide, vertically centred), the product UI on the right in a card with 14–16px corner radius. Keep the copy short: a headline of up to five words, one sentence of lead text, and three bullets.

**Product UI:** always real screenshots of the current build, in both themes where it matters. Speeds are written with the × sign (`1.75×`), as in the extension.

## What you need

- The repo with its dependencies (`npm ci`) and the Puppeteer Chrome (`npx puppeteer browsers install chrome`)
- [uv](https://docs.astral.sh/uv/) (`uvx` runs Pillow without installing it), or any Python with Pillow
- An internet connection: the headline font (Inter) comes from Google Fonts

## Steps

1. Build the extension: `npm run build`
2. Save the two scripts below in the **repo root** as `.store-capture.mjs` and `.store-compose.mjs`. They import Puppeteer from the repo's `node_modules`, so they have to be inside it.
3. Capture the screenshots into a work folder, then compose the images:

   ```sh
   mkdir -p store-work
   cp docs/img/icon_512.png store-work/icon.png
   node .store-capture.mjs . store-work   # popup-dark.png, options-dark.png, options-light.png
   node .store-compose.mjs store-work     # store-1-popup.raw.png, store-2-settings.raw.png
   ```

4. Flatten to 24-bit PNG (Chrome's screenshots carry an alpha channel, which the store rejects):

   ```sh
   uvx --with pillow python -c "from PIL import Image; [Image.open(f'store-work/{n}.raw.png').convert('RGB').save(f'docs/store/{n}.png', optimize=True) for n in ('store-1-popup', 'store-2-settings')]"
   ```

5. Check the two images in `docs/store/`, then delete `store-work/`, `.store-capture.mjs` and `.store-compose.mjs`.

To change the headline, the bullets or the layout, edit the HTML and CSS in `.store-compose.mjs`. The speed and theme shown come from `.store-capture.mjs`: 1.75× in the popup, a 1.5× default in the settings.

## .store-capture.mjs

Loads the built extension, serves a page with the test video, and screenshots the popup and the settings page at 3× resolution. The popup is opened in a normal tab, because Puppeteer can't resize the real popup window. A one-line shim points its active-tab lookup at the video tab; everything else is the real extension code.

```js
import { launch } from 'puppeteer';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [repo, out] = process.argv.slice(2);
const video = fs.readFileSync(path.join(repo, 'src/__tests__/fixtures/test-video.mp4'));
const server = http
  .createServer((req, res) => {
    if (req.url.startsWith('/v.mp4')) {
      res.writeHead(200, { 'Content-Type': 'video/mp4' });
      return res.end(video);
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>Video</title><video src="/v.mp4" width="640"></video>');
  })
  .listen(3344, '127.0.0.1');

const browser = await launch({
  headless: true,
  enableExtensions: [path.resolve(repo, 'dist')],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 }
});
const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker');
const sw = await swTarget.worker();
const id = new URL(sw.url()).host;
const setSync = (items) => sw.evaluate((i) => chrome.storage.sync.set(i), items);

async function popupShot(theme, file) {
  await setSync({ theme });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3344/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    document.querySelector('video').playbackRate = 1.75;
  });
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1:3344/*' }))[0].id);
  const popup = await browser.newPage();
  await popup.setViewport({ width: 477, height: 64, deviceScaleFactor: 3 });
  // Capture only: the popup runs in a tab here, so point its active-tab lookup at the video tab
  await popup.evaluateOnNewDocument((id) => {
    chrome.tabs.query = async () => [{ id }];
  }, tabId);
  await popup.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'networkidle0' });
  await popup.waitForFunction(() => !document.querySelector('#slider-container').hidden);
  await new Promise((r) => setTimeout(r, 800));
  await popup.screenshot({ path: path.join(out, file) });
  await popup.close();
  await page.close();
}

async function optionsShot(theme, file) {
  await setSync({ theme, defaults: { enabled: true, playbackRate: 1.5 }, badgeEnabled: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 560, height: 400, deviceScaleFactor: 3 });
  await page.goto(`chrome-extension://${id}/options.html`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 800));
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: path.join(out, file), clip: { x: 0, y: 0, width: 560, height: h } });
  await page.close();
}

await popupShot('sap_horizon_dark', 'popup-dark.png');
await optionsShot('sap_horizon_dark', 'options-dark.png');
await optionsShot('sap_horizon', 'options-light.png');
await browser.close();
server.close();
```

## .store-compose.mjs

Lays the screenshots out on the icon's gradient with the existing icon, a headline and three bullets, and saves 1280×800 images.

```js
import { launch } from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const img = (f) => `data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}`;

const base = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; }
body { width: 1280px; height: 800px; overflow: hidden; font-family: Inter, 'Segoe UI', sans-serif; color: #2f343b;
	background: linear-gradient(135deg, #f4ec3c 0%, #fbc52f 38%, #f9a53a 70%, #f26b35 100%); position: relative; }
.copy { position: absolute; left: 80px; top: 0; bottom: 0; width: 460px; display: flex; flex-direction: column; justify-content: center; }
.brand { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.brand img { width: 64px; height: 64px; filter: drop-shadow(0 4px 10px rgba(120,60,0,.25)); }
.brand span { font-size: 22px; font-weight: 700; letter-spacing: -.01em; }
h1 { font-size: 58px; line-height: 1.05; font-weight: 800; letter-spacing: -.03em; margin-bottom: 22px; }
p.lead { font-size: 22px; line-height: 1.45; margin-bottom: 30px; color: #3d3a33; }
ul { list-style: none; padding: 0; display: grid; gap: 14px; }
li { font-size: 19px; font-weight: 500; display: flex; gap: 12px; align-items: center; }
li::before { content: '✓'; flex: none; width: 28px; height: 28px; border-radius: 50%; background: #2f343b; color: #fbc52f;
	display: grid; place-items: center; font-size: 15px; font-weight: 800; }
.shadow { box-shadow: 0 30px 60px -12px rgba(80,30,0,.45), 0 12px 24px -8px rgba(80,30,0,.3); }
</style>`;

const browserShot = `${base}
<style>
.window { position: absolute; left: 600px; top: 120px; width: 620px; height: 470px; border-radius: 14px; overflow: hidden; background: #202124; }
.bar { height: 52px; background: #35363a; display: flex; align-items: center; gap: 10px; padding: 0 14px; }
.dots { display: flex; gap: 7px; } .dots i { width: 12px; height: 12px; border-radius: 50%; background: #5f6368; display: block; }
.url { flex: 1; height: 32px; border-radius: 16px; background: #202124; color: #9aa0a6; font-size: 14px; display: flex; align-items: center; padding: 0 16px; }
.ext { position: relative; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; background: #4a4c50; }
.ext img { width: 20px; height: 20px; }
.badge { position: absolute; right: -10px; bottom: -6px; background: #F7B731; color: #000; font-size: 11px; font-weight: 700;
	padding: 1px 4px; border-radius: 4px; line-height: 14px; }
.video { position: absolute; left: 0; right: 0; top: 52px; bottom: 0; background: radial-gradient(ellipse at 30% 30%, #3b4a63, #12161d 70%); }
.play { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: 84px; height: 84px; border-radius: 50%; background: rgba(255,255,255,.18); }
.play::after { content: ''; position: absolute; left: 33px; top: 25px; border-left: 26px solid #fff; border-top: 17px solid transparent; border-bottom: 17px solid transparent; }
.controls { position: absolute; left: 22px; right: 22px; bottom: 22px; display: flex; align-items: center; gap: 14px; color: #fff; font-size: 14px; font-weight: 600; }
.track { flex: 1; height: 5px; border-radius: 3px; background: rgba(255,255,255,.3); position: relative; }
.track::before { content: ''; position: absolute; inset: 0 62% 0 0; background: #f9a53a; border-radius: 3px; }
.speed { background: rgba(0,0,0,.55); padding: 4px 9px; border-radius: 6px; }
.popup { position: absolute; left: 676px; top: 182px; width: 530px; border-radius: 10px; overflow: hidden; border: 1px solid #3c4043; }
.popup img { display: block; width: 100%; }
</style>
<div class="copy">
	<div class="brand"><img src="${img('icon.png')}"><span>Video Speed Regulator</span></div>
	<h1>Any video,<br>your speed.</h1>
	<p class="lead">Slow down or speed up videos on any website, from 0.25× to 4×.</p>
	<ul><li>One slider for every video on the page</li><li>Speed shown on the toolbar icon</li><li>Right-click a video to pick a speed</li></ul>
</div>
<div class="window shadow">
	<div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="url">example.com/watch</div>
		<div class="ext"><img src="${img('icon.png')}"><span class="badge">1.75</span></div></div>
	<div class="video"><div class="play"></div><div class="controls"><span>4:12 / 11:05</span><div class="track"></div><span class="speed">1.75×</span></div></div>
</div>
<div class="popup shadow"><img src="${img('popup-dark.png')}"></div>`;

const settingsShot = `${base}
<style>
.card { position: absolute; width: 470px; border-radius: 16px; overflow: hidden; }
.card img { display: block; width: 100%; }
.dark { left: 610px; top: 64px; } .light { left: 760px; top: 392px; }
</style>
<div class="copy">
	<div class="brand"><img src="${img('icon.png')}"><span>Video Speed Regulator</span></div>
	<h1>Set it once.</h1>
	<p class="lead">Every new video starts at your favorite speed, and the look follows your system.</p>
	<ul><li>Default speed for new videos</li><li>Speed badge on or off</li><li>System, light or dark theme</li></ul>
</div>
<div class="card dark shadow"><img src="${img('options-dark.png')}"></div>
<div class="card light shadow"><img src="${img('options-light.png')}"></div>`;

const browser = await launch({ headless: true, defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
const page = await browser.newPage();
for (const [name, html] of [
  ['store-1-popup', browserShot],
  ['store-2-settings', settingsShot]
]) {
  await page.setContent(`<!doctype html><meta charset="utf-8">${html}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(dir, `${name}.raw.png`) });
}
await browser.close();
```
