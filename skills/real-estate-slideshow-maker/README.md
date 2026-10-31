# Real estate slideshow maker

A free agent skill for Claude Code, Codex and Cursor that turns listing photos into a slideshow video: an intro card
with the address and price, a slow pan through each room with a label, and a closing card with beds, baths, area and
the agent's contact details. It renders on your own computer with [HyperFrames](https://github.com/heygen-com/hyperframes)
(Apache-2.0), so there is no API key and no cost per video.

See it and the sample result at https://glidezo.com/skills/real-estate-slideshow-maker

## Install

Copy this folder into your agent's skills folder, for example `~/.claude/skills/real-estate-slideshow-maker` for
Claude Code, then ask: "Make a listing slideshow from the photos in ./photos for 1428 Linden Avenue, $849,000."

Needs Node.js 22+ and FFmpeg. HyperFrames downloads its own headless Chrome on first run.

## Run it by hand

```bash
node scripts/make-slideshow.mjs examples/listing.json            # build and render
node scripts/make-slideshow.mjs examples/listing.json --no-render # only write the HyperFrames project
```

`examples/listing.json` shows every field. Put your photos next to it in `photos/` (the example's photos are not
included). Landscape, portrait and square output are supported.

## Licence

MIT. The videos you make are yours.
