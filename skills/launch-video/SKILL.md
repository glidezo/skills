---
name: launch-video
description: Make a product launch video / promo video (MP4) from a product name, tagline, 1 to 6 features with screenshots, and a call to action. Opens on a hook line, shows the product name, then one scene per feature with the screenshot in a browser frame that scrolls, and ends on a call-to-action card with the URL. Use for product launches, Product Hunt videos, feature announcements, app and SaaS promos. Renders locally with HyperFrames; no API key, no cost.
license: MIT
metadata:
  author: glidezo
  homepage: https://glidezo.com/skills/launch-video
  engine: hyperframes@0.8.223
---

# Launch video

A 15 to 40 second launch video built from facts and screenshots:

1. **Hook** (2.6 s, optional): one line, word by word, such as "Your coding agent can make videos now."
2. **Brand** (3 s): logo (optional), product name, tagline.
3. **One scene per feature** (4.5 s each by default): number, title and one line of text beside a browser-style frame
   with the screenshot, which scrolls slowly from top to bottom. Without a screenshot the text stands alone.
4. **Call to action** (3.8 s): accent background, product name, a button-style call to action and the URL.

Landscape (1920x1080), portrait (1080x1920, frame above the text) or square.

## Requirements

Node.js 22+, FFmpeg on the PATH. HyperFrames downloads its own Chrome on first run.

## Steps

1. **Collect** the product name, tagline, hook, 1 to 6 features (title up to 40 characters, one line of text up to
   110), a screenshot per feature, the call to action and URL, optional logo and music the user owns. Use real
   screenshots of the product; never invent features. Tall screenshots (a full page) scroll; wide ones just sit.
   For a web page, a browser's full-page screenshot at about 1100 px wide keeps the text readable in the video.
2. **Write `launch.json`** (see `examples/launch.json`; paths are relative to it):

   ```json
   {
     "product": "Glidezo", "logo": "logo.svg", "hook": "Your coding agent can make videos now.",
     "tagline": "Video and image skills for Claude Code, Codex and Cursor",
     "features": [ { "title": "Skills, not prompts", "text": "Each skill is a tested recipe your agent runs.", "image": "shots/skills.png" } ],
     "cta": "Get the free skills", "url": "glidezo.com", "accent": "#8b7bff", "accentInk": "#0a0a0b",
     "background": "#0a0a0b", "ink": "#f4f4f5", "secondsPerFeature": 4.5, "music": "music.mp3", "format": "landscape"
   }
   ```

   Required: `product`, `tagline`, `features` (each with a `title`). `secondsPerFeature` is 3 to 8; give longer feature
   text more time (about 0.3 s a word plus 1 s).
3. **Check, then render:**

   ```bash
   node scripts/launch-video.mjs launch.json --no-render
   (cd launch && npx --yes hyperframes@0.8.223 check && npx --yes hyperframes@0.8.223 snapshot --at 1,4,8,12)
   node scripts/launch-video.mjs launch.json
   ```

   The MP4 is written to `launch/renders/launch.mp4`. A 23 s video renders in about 1.5 minutes on a 4-core laptop.
   `check` warns about splitting the timeline into sub-compositions and, without music, a silent film; both are
   expected. A `line_unread` warning means a feature's text needs a longer `secondsPerFeature`.

## Changing the look

Edit `scripts/launch-video.mjs` (scene lengths, CSS, tweens), not the generated `index.html`. `scripts/lib.mjs` holds
the shared HyperFrames helpers.
