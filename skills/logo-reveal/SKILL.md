---
name: logo-reveal
description: Make a logo reveal / logo intro animation video (MP4) from a logo file (SVG, PNG, JPG or WebP), with the brand name and a tagline. Accent lines converge, a ring draws and bursts, the logo lands with a light sweep across it, then the name and tagline come in and hold. Use for brand intros, outros, YouTube channel intros and end cards. Renders locally with HyperFrames; no API key, no cost.
license: MIT
metadata:
  author: glidezo
  homepage: https://glidezo.com/skills/logo-reveal
  engine: hyperframes@0.8.223
---

# Logo reveal

A 3 to 10 second logo intro: four accent lines shoot in and meet on the logo, a ring draws around it and bursts, the
logo lands (scale, turn and blur into focus), a light sweep runs across the logo's own shape, then the brand name
comes in letter by letter and the tagline fades up. It ends on a held card, so it also works as an outro.

## Requirements

Node.js 22+, FFmpeg on the PATH. HyperFrames downloads its own Chrome on first run.

## Steps

1. **Get the logo file.** SVG is best (sharp at any size); a PNG with a transparent background also works. The light
   sweep follows the logo's transparent areas, so a logo on a solid rectangle gets a rectangular sweep.
2. **Ask for** the brand name and tagline (both optional), accent, background and text colours, length and format.
3. **Write `logo.json`** next to the logo (see `examples/logo.json`):

   ```json
   { "logo": "logo.svg", "name": "Glidezo", "tagline": "Video skills for your coding agent", "accent": "#8b7bff", "background": "#0a0a0b", "ink": "#f4f4f5", "seconds": 5, "format": "landscape" }
   ```

   Only `logo` is required. `name` is up to 32 characters (a long name is set smaller so it fits the frame),
   `tagline` up to 60, `seconds` 3 to 10 (in a short clip the letters come in faster so the tagline still lands).
4. **Check, then render:**

   ```bash
   node scripts/logo-reveal.mjs logo.json --no-render
   (cd logo-reveal && npx --yes hyperframes@0.8.223 snapshot --at 0.7,1.5,4.5)
   node scripts/logo-reveal.mjs logo.json
   ```

   The MP4 is written to `logo-reveal/renders/logo-reveal.mp4`. A 5 s reveal renders in about 15 s on a 4-core laptop.

Only use logos the user owns or may use.

## Changing the look

Edit `scripts/logo-reveal.mjs` (CSS and tweens), not the generated `index.html`. `scripts/lib.mjs` holds the shared
HyperFrames helpers.
