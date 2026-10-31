---
name: data-chart-video
description: Make an animated data chart video / chart animation (MP4) from labels and numbers. A bar chart grows bar by bar (or a line chart draws point by point) with gridlines, values that count up, an optional highlighted point, a title, subtitle and source line. Handles tiny and huge numbers (0.00042, 12.4K, 3.1M, 2.5B), negatives, and long labels (bars turn sideways). Use for stats in social posts, reports, explainers, YouTube and investor updates. Renders locally with HyperFrames; no API key, no cost.
license: MIT
metadata:
  author: glidezo
  homepage: https://glidezo.com/skills/data-chart-video
  engine: hyperframes@0.8.223
---

# Data-chart video

A 5 to 20 second chart clip: the title is on screen from the first frame (social players use it as the thumbnail), the
gridlines come in, then each bar grows (or the line draws to each point) while its value counts up to the real number.
A highlighted point lights up at the end, and the chart holds so the numbers can be read.

- **Bar** (default): vertical bars with labels underneath. Bars turn **horizontal** in portrait, and in landscape or
  square when the labels together are too long to sit under the bars. Negative values hang below a zero line.
- **Line**: a line drawn left to right with a dot and value at each point; labels at dips go under the point.

Numbers are formatted for reading: `12,345` becomes `12.3K`, then `M`, `B`, `T`; tiny values keep two significant
digits (`0.00042`), and anything past a quadrillion or below 0.0001 uses `1.2e15` / `1.2e-7`. Set `decimals` to fix
the decimals instead.

## Requirements

Node.js 22+, FFmpeg on the PATH. HyperFrames downloads its own Chrome on first run.

## Steps

1. **Collect** the numbers and where they come from. Use the user's real data and put the source in `source`; never
   invent or round numbers the user didn't give. Up to 12 points; labels up to 24 characters.
2. **Write `chart.json`** (see `examples/chart.json`):

   ```json
   {
     "title": "How long our sample videos took to render",
     "subtitle": "Seconds to render each 1080p clip on a 4-core computer",
     "source": "Source: Glidezo, 2026-10-31",
     "type": "bar",
     "data": [ { "label": "Logo reveal (5 s)", "value": 13 }, { "label": "Launch video (23 s)", "value": 79 } ],
     "prefix": "", "suffix": " s", "highlight": "Logo reveal (5 s)",
     "accent": "#8b7bff", "background": "#0a0a0b", "ink": "#f4f4f5", "seconds": 8, "format": "landscape"
   }
   ```

   Required: `title` (up to 80 characters) and `data` (1 to 12 points for bars, 2 to 12 for a line; each `value` a
   plain number, no quotes or units). `prefix` (up to 4, e.g. `$`) and `suffix` (up to 8, e.g. `%` or ` ms`; a leading
   space is kept) go around every number. `highlight` is one of the labels. `seconds` is 5 to 20; with many points in a
   short clip the bars come in faster so the last one still lands 1.5 s before the end.
3. **Check, then render:**

   ```bash
   node scripts/data-chart-video.mjs chart.json --no-render
   (cd data-chart && npx --yes hyperframes@0.8.223 check && npx --yes hyperframes@0.8.223 snapshot --at 1.5,7.9)
   node scripts/data-chart-video.mjs chart.json
   ```

   The MP4 is written to `data-chart/renders/data-chart.mp4`. An 8 s chart renders in about 30 s on a 4-core laptop.
   `check` warns about splitting the timeline into sub-compositions; that is expected.

## Changing the look

Edit `scripts/data-chart-video.mjs` (timing, CSS, tweens), not the generated `index.html`. `scripts/lib.mjs` holds the
shared HyperFrames helpers.
