---
name: youtube-thumbnail
description: Make a YouTube thumbnail (1280x720 PNG, under YouTube's 2 MB upload limit) with a big headline, one phrase in an accent colour, an optional badge, a background picture (optionally blurred) and a subject cut-out with a white outline and glow. Keeps text clear of the bottom-right corner where YouTube shows the video length. Use for YouTube videos, Shorts covers, podcast and course thumbnails. Renders locally with HyperFrames; no API key, no cost.
license: MIT
metadata:
  author: glidezo
  homepage: https://glidezo.com/skills/youtube-thumbnail
  engine: hyperframes@0.8.223
---

# YouTube thumbnail

One 1280x720 PNG: a headline of a few big words (one phrase in the accent colour), an optional tilted badge above it
("Free", "Part 2", "New"), a background picture darkened on the text side, and a subject on the other side with a
white outline and an accent glow. The text box stays above the bottom strip, so YouTube's time stamp never covers it.

**Limits** (YouTube Help, checked 2026-10-31): JPG or PNG, at least 640 px wide; up to 2 MB from the mobile app and
50 MB on desktop. YouTube now recommends up to 3840x2160; this skill makes 1280x720, which every surface takes. The
script fails unless the image is 1280x720 and saves a JPEG instead if a PNG would pass 2,000,000 bytes.

## Requirements

Node.js 22+. HyperFrames downloads its own Chrome on first run; FFmpeg only for the JPEG fallback.

## Steps

1. **Collect** the headline (3 to 6 words read best at phone size; up to 40 characters), the phrase to colour, a badge,
   and pictures the user owns: a background (a frame from the video works) and a subject. A subject PNG with a
   transparent background gets an outline that follows its shape; a person cut-out should stand on the bottom edge
   (`"subjectAnchor": "bottom"`), a logo or object floats (`"center"`).
2. **Write `thumbnail.json`** (see `examples/thumbnail.json`):

   ```json
   {
     "headline": "Make videos with code", "highlight": "with code", "badge": "Free",
     "image": "background.png", "blur": 8, "subject": "logo.svg", "subjectAnchor": "center",
     "textSide": "left", "accent": "#8b7bff", "accentInk": "#0a0a0b", "background": "#0a0a0b", "ink": "#ffffff"
   }
   ```

   Only `headline` is required. `highlight` must be a phrase from the headline. `badge` up to 14 characters, `blur`
   0 to 30 px, `textSide` `left` or `right`.
3. **Render:**

   ```bash
   node scripts/youtube-thumbnail.mjs thumbnail.json
   ```

   The image is written to `thumbnail/renders/thumbnail.png` (about 13 s). Look at it at 320 px wide too: that is how
   big it shows in most feeds. Upload it in YouTube Studio under Details > Thumbnail.

Only use pictures of people with their permission, and no other brands' logos.

## Changing the look

Edit `scripts/youtube-thumbnail.mjs` (layout and CSS), not the generated `index.html`. `scripts/lib.mjs` holds the
shared HyperFrames helpers, including the still capture and size checks.
