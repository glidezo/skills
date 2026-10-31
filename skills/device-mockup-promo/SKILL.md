---
name: device-mockup-promo
description: Make a device mockup promo video (MP4) from app or website screenshots shown inside a phone or laptop drawn in CSS. The device rises in with a 3D turn, each screenshot slides in (and scrolls when it is a tall full-page capture) with a numbered caption beside it, then a call-to-action button and URL. Use for app promos, App Store / Play Store previews, website showcases, feature tours and social ads. Renders locally with HyperFrames; no API key, no cost.
license: MIT
metadata:
  author: glidezo
  homepage: https://glidezo.com/skills/device-mockup-promo
  engine: hyperframes@0.8.223
---

# Device mockup promo

A 6 to 44 second promo: the headline comes in word by word while a phone (19.5:9 screen) or laptop (16:10 screen)
rises into view and turns slowly. Each screenshot gets 2.5 to 8 seconds: it slides in over the last one, scrolls down
if it is taller than the screen (at most 1.5 screens, so a full-page capture doesn't race past), and its caption shows
beside the device as "01 Pick a skill". It ends on the call to action and URL.

Landscape (text left, device right), portrait or square (headline on top, device below).

## Requirements

Node.js 22+, FFmpeg on the PATH. HyperFrames downloads its own Chrome on first run.

## Steps

1. **Get real screenshots** of the user's app or site, 1 to 5. Phone: capture at the phone's width (for a web page,
   390 px wide at 3x scale). Laptop: a 1440x900 window at 2x. Crop a full-page capture to the part worth showing:
   the scroll stops where the image ends. Never mock up screens the product doesn't have.
2. **Write `promo.json`** next to the screenshots (see `examples/promo.json`):

   ```json
   {
     "device": "phone",
     "headline": "Video skills in your pocket",
     "subline": "Browse every Glidezo skill and its real result on your phone.",
     "screens": [ { "image": "shots/phone-home.png", "caption": "Pick a skill" } ],
     "cta": "Get the free skills", "url": "glidezo.com", "logo": "logo.svg",
     "accent": "#8b7bff", "accentInk": "#0a0a0b", "background": "#0a0a0b", "ink": "#f4f4f5",
     "secondsPerScreen": 3.5, "format": "landscape"
   }
   ```

   Required: `headline` (up to 60 characters; a long one is set smaller) and `screens` (each with an `image`).
   `caption` up to 50, `subline` up to 90, `cta` up to 30, `url` up to 40. Images: PNG, JPG, WebP or SVG.
3. **Check, then render:**

   ```bash
   node scripts/device-mockup-promo.mjs promo.json --no-render
   (cd device-promo && npx --yes hyperframes@0.8.223 check && npx --yes hyperframes@0.8.223 snapshot --at 1,4,8,13)
   node scripts/device-mockup-promo.mjs promo.json
   ```

   The MP4 is written to `device-promo/renders/device-promo.mp4`. A 14 s promo renders in about a minute on a 4-core
   laptop. `check` warns about splitting the timeline into sub-compositions; that is expected.

Only use screenshots of products the user owns or may show. Phone and laptop are generic shapes, not any maker's design.

## Changing the look

Edit `scripts/device-mockup-promo.mjs` (device shapes, CSS, tweens), not the generated `index.html`. `scripts/lib.mjs`
holds the shared HyperFrames helpers.
