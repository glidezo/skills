---
name: real-estate-slideshow-maker
description: Make a real estate listing slideshow video (MP4) from property photos plus the address, price, beds, baths and agent details. Opens on a "just listed" card, moves through each room with a slow pan and a room label, and ends on a price and contact card. Use when someone asks for a listing video, property slideshow, house tour reel or real estate slideshow from photos. Renders locally with HyperFrames; no API key, no cost.
license: MIT
metadata:
  author: glidezo
  homepage: https://glidezo.com/skills/real-estate-slideshow-maker
  engine: hyperframes@0.8.223
---

# Real estate slideshow maker

Turns 2 to 20 listing photos and a few listing facts into a 1080p slideshow video:

1. **Intro** (4 s): the first photo (use the front of the home) with a tag such as "Just listed", the address, the
   town and the price.
2. **One shot per photo** (3 s each): a slow pan and zoom, a crossfade into the next photo, and an optional room label.
3. **Closing card** (4 s): price, address, beds / baths / area and the agent's name, phone and brokerage over the
   first photo.

Five photos make a 20 s video. Landscape (1920x1080), portrait (1080x1920, for Reels, TikTok and Shorts) and square
(1080x1080) are supported.

## Requirements

- Node.js 22 or newer
- FFmpeg on the PATH
- Chrome for HyperFrames (it downloads its own on first run; `npx hyperframes@0.8.223 doctor` checks everything)

## Steps

1. **Collect the facts.** Ask for whatever is missing: the photos (folder or files), address, price, and optionally the
   town, beds, baths, floor area, agent name, phone, brokerage, a tag line ("Just listed", "Open house Sat 2-4 pm"),
   an accent colour, the format, and a music file the user has the rights to. Never invent a price, address or
   phone number.
2. **Order the photos.** Front of the home first, then the main living space, kitchen, bedrooms, bathrooms, garden
   or view. Give each photo after the first a short room label (40 characters max) if you can tell the room.
3. **Write `listing.json`** next to the photos (photo and music paths are relative to this file).
   See `examples/listing.json`:

   ```json
   {
     "format": "landscape",
     "accent": "#8b7bff",
     "tagline": "Just listed",
     "address": "1428 Linden Avenue",
     "city": "Maple Grove",
     "price": "$849,000",
     "beds": 4,
     "baths": 3,
     "area": "2,450 sq ft",
     "agent": { "name": "Alex Morgan", "phone": "(555) 010-2040", "brokerage": "Sample Realty" },
     "secondsPerPhoto": 3,
     "music": "music.mp3",
     "photos": [
       { "file": "photos/01-exterior.jpg" },
       { "file": "photos/02-living.jpg", "label": "Open-plan kitchen" }
     ]
   }
   ```

   Only `address`, `price` and `photos` are required. Limits: `format` is `landscape`, `portrait` or `square`;
   `accent` is a `#rrggbb` colour; `secondsPerPhoto` 1.5 to 8; `introSeconds` and `outroSeconds` 2 to 8; photos are
   JPG, PNG or WebP; music is MP3, WAV or M4A.
4. **Build and check before rendering:**

   ```bash
   node scripts/make-slideshow.mjs path/to/listing.json --no-render
   cd path/to/slideshow
   npx --yes hyperframes@0.8.223 check
   npx --yes hyperframes@0.8.223 snapshot --at 1.5,6,18
   ```

   Look at the snapshot frames. Check that the text is readable on each photo and the important part of each room is
   in frame (photos are cropped to fill the frame). `check` warns about splitting the timeline into sub-compositions
   and, without music, about a silent film; both are expected for this template.
5. **Render:**

   ```bash
   node scripts/make-slideshow.mjs path/to/listing.json
   ```

   The video is written to `slideshow/renders/slideshow.mp4` next to `listing.json` (`--out <dir>` picks another
   project folder). A 20 s landscape video takes about 1.5 minutes on a 4-core laptop.

## Changing the look

The script writes a plain HyperFrames composition to `slideshow/index.html`. For small changes (fonts, colours,
card layout) edit the `compositionHtml` function in `scripts/make-slideshow.mjs` so the change survives the next run.
`scripts/lib.mjs` holds the shared helper that starts HyperFrames (also on Windows).
Keep the HyperFrames rules: every timed element has `data-start` and `data-duration`, the GSAP timeline is paused and
registered on `window.__timelines["main"]`, and nothing random or time-based runs in the page.

## Notes for listings

- Many listing services and local rules ask that virtually staged or edited photos are labelled; this skill does not
  change the photos, but say so if the user's photos were staged.
- Use music the user owns or has licensed; social apps may mute videos with unlicensed music.
