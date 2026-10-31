---
name: kinetic-type-title
description: Make a kinetic typography title video (MP4) from a short line of text. Each word enters with its own move, one word sits on an accent-colour block, an accent bar wipes in, then the title exits. Use for video openers, YouTube intros, launch titles, social posts or any request for an animated text title. Renders locally with HyperFrames; no API key, no cost.
license: MIT
metadata:
  author: glidezo
  homepage: https://glidezo.com/skills/kinetic-type-title
  engine: hyperframes@0.8.223
---

# Kinetic type title

Turns one to eight words into a 3 to 12 second title clip: the words enter one after another (rise, slide, zoom from
blur, drop), one word is highlighted on an accent block, an accent bar wipes in under the line, the title holds with a
slow push-in, and the words exit upward. Landscape (1920x1080), portrait (1080x1920) or square (1080x1080).

## Requirements

Node.js 22+, FFmpeg on the PATH. HyperFrames downloads its own Chrome on first run
(`npx hyperframes@0.8.223 doctor` checks everything).

## Steps

1. **Ask for the words** (8 words, 60 characters at most) and, if the user cares: which word to highlight (default:
   the last), accent colour, background and text colours, length and format. Short titles read best at 4 to 8 seconds.
2. **Write `title.json`** (see `examples/title.json`):

   ```json
   { "text": "Ideas that move", "highlight": "move", "accent": "#8b7bff", "background": "#0a0a0b", "ink": "#f4f4f5", "accentInk": "#0a0a0b", "seconds": 6, "format": "landscape" }
   ```

   Only `text` is required. `seconds` is 3 to 12 (with many words in a short clip the words come in faster, so every
   word is in before the exit); `format` is `landscape`, `portrait` or `square`; colours are `#rrggbb`.
   `accentInk` is the colour of the highlighted word on the accent block; pick it for contrast.
3. **Check, then render:**

   ```bash
   node scripts/kinetic-type-title.mjs title.json --no-render
   (cd kinetic-title && npx --yes hyperframes@0.8.223 snapshot --at 1,2.5,5)
   node scripts/kinetic-type-title.mjs title.json
   ```

   Look at the snapshot frames before rendering. The MP4 is written to `kinetic-title/renders/kinetic-title.mp4` next to
   `title.json` (`--out <dir>` picks another folder). A 6 s title renders in about 15 s on a 4-core laptop.

`npx hyperframes check` warns that frame 0 is empty (the title builds from nothing) and about splitting the timeline
into sub-compositions; both are expected for this template.

## Changing the look

Edit `scripts/kinetic-type-title.mjs` (the `ENTRANCES` list, the CSS and the tweens), not the generated `index.html`,
so the change survives the next run. `scripts/lib.mjs` holds the shared HyperFrames helpers.
