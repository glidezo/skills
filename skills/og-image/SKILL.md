---
name: og-image
description: Make an Open Graph image / social share card / link preview image (1200x630 PNG) for a web page, blog post or product, with a title that sizes itself to fit, a kicker, description, logo, site name and an optional screenshot or picture. Checks the size (1200x630) and file size (under 5,000,000 bytes, LinkedIn's 5 MB limit). Use when a page needs og:image / twitter:image, for blog post covers, launch posts and link previews on X, LinkedIn, Facebook, Slack and iMessage. Renders locally with HyperFrames; no API key, no cost.
license: MIT
metadata:
  author: glidezo
  homepage: https://glidezo.com/skills/og-image
  engine: hyperframes@0.8.223
---

# OG image

One 1200x630 PNG card for a link preview: kicker (small caps in the accent colour), a big title, an optional
description, and a footer with the logo and site name. With a picture (a screenshot works well), the text takes the
left side and the picture sits on the right in a rounded frame.

The title starts at the largest size that fits its box and shrinks in the browser until the real glyphs fit, so long
titles (up to 110 characters) never spill.

**Sizes** (checked 2026-10-31): Facebook recommends at least 1200x630 at 1.91:1 and takes up to 8 MB; LinkedIn wants at
least 1200x627 and up to 5 MB. The script fails unless the image is exactly
1200x630, and saves a JPEG instead if a PNG would pass 5,000,000 bytes (only possible with a very noisy photo).

## Requirements

Node.js 22+. HyperFrames downloads its own Chrome on first run; FFmpeg only for the JPEG fallback.

## Steps

1. **Collect** the page title (use the page's real title), a kicker such as the section or "New", one line of
   description, the site name or URL, and optional logo and picture the user owns.
2. **Write `og.json`** (see `examples/og.json`):

   ```json
   {
     "kicker": "Free agent skill", "title": "Turn your logo into an intro video",
     "description": "Logo Reveal renders on your own computer with HyperFrames. No API key, no cost per video.",
     "logo": "logo.svg", "site": "glidezo.com/skills/logo-reveal", "image": "screenshot.png",
     "accent": "#8b7bff", "background": "#0a0a0b", "ink": "#f4f4f5"
   }
   ```

   Only `title` is required (up to 110 characters). `kicker` up to 40, `description` up to 140, `site` up to 40.
3. **Render:**

   ```bash
   node scripts/og-image.mjs og.json
   ```

   The image is written to `og-image/renders/og-image.png` (about 13 s, most of it starting Chrome). Look at it, then
   add it to the page:

   ```html
   <meta property="og:image" content="https://example.com/og/page.png" />
   <meta property="og:image:width" content="1200" />
   <meta property="og:image:height" content="630" />
   <meta name="twitter:card" content="summary_large_image" />
   ```

   `hyperframes check` on a still reports `line_unread` (the "film" is 1 s long); that is expected for an image.

## Changing the look

Edit `scripts/og-image.mjs` (layout and CSS), not the generated `index.html`. `scripts/lib.mjs` holds the shared
HyperFrames helpers, including the still capture and size checks.
