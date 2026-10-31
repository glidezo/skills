---
name: animated-captions
description: Add word-by-word animated captions (burned-in subtitles) to a talking video, in the style of TikTok, Reels and YouTube Shorts. Transcribes the speech on your computer (or uses a transcript you give it), shows a few words at a time and pops the word being spoken in an accent colour. Use when someone asks for captions, subtitles, auto captions or karaoke-style text on a video. Renders locally with HyperFrames; no API key, no cost.
license: MIT
metadata:
  author: glidezo
  homepage: https://glidezo.com/skills/animated-captions
  engine: hyperframes@0.8.223
---

# Animated captions

Burns captions into a video with its sound kept: words are grouped into short lines (split at sentence ends, commas
and pauses, at most `maxWords` a line, sized evenly), each line pops in when its first word is spoken, and the spoken
word turns the accent colour and pops slightly. A line clears 0.4 s after its last word when a pause follows. The
output keeps the source's shape as displayed (vertical stays vertical, phone clips saved sideways with a rotation flag
included) and is scaled down to 1920 px on the long side at most.

## Requirements

- Node.js 22+, FFmpeg (with ffprobe) on the PATH. HyperFrames downloads its own Chrome on first run.
- For automatic word timings, a local speech model, installed once:
  `npx hyperframes@0.8.223 models install parakeet` (about 640 MB, runs on your computer, free). Without it, give a
  transcript file instead.

## Steps

1. **Get the video** and ask: which part (`from` / `to` in seconds, default the whole clip), where the captions go
   (`bottom`, `middle` or `top`; use `top` or `middle` if the bottom of the frame is busy), the accent colour, words
   per line and the spoken language.
2. **Write `captions.json`** next to the video (see `examples/captions.json`):

   ```json
   { "video": "talk.mp4", "from": 14.6, "to": 25.8, "position": "bottom", "accent": "#facc15", "ink": "#ffffff", "maxWords": 4, "uppercase": true, "language": "en" }
   ```

   Only `video` is required. Optional `"transcript"`: a word-timing JSON as HyperFrames writes it
   (`[{ "text": "Hello", "start": 0.4, "end": 0.7 }]`), or an `.srt` / `.vtt` file, which is imported with
   `hyperframes transcribe`. Subtitle files only time whole lines, so each line's time is shared out across its words
   and the highlight is approximate; transcribing gives exact word timings. Without a transcript the script
   transcribes the video itself.
3. **Build and look before rendering:**

   ```bash
   node scripts/animated-captions.mjs captions.json --no-render
   (cd captions && npx --yes hyperframes@0.8.223 snapshot --at 1,3,6)
   ```

   The word timings are saved in `captions/transcript.json`. Read the caption lines in `captions/index.html`; if a word
   was misheard, fix it in `transcript.json`, set `"transcript": "captions/transcript.json"` in `captions.json` (copy
   it elsewhere first, the project folder is rewritten) and run again.
4. **Render:** `node scripts/animated-captions.mjs captions.json`. The MP4 is written to
   `captions/renders/captioned.mp4`. A 10.5 s 1080p clip renders in about 40 s on a 4-core laptop.

`check` warns that lines are on screen for less time than a reader needs (`line_unread`). For captions synced to
speech that is the speaker's pace, and expected; lower `maxWords` if lines feel rushed.

Only caption videos the user owns or may use.

## Changing the look

Edit `scripts/animated-captions.mjs` (the CSS for `.group p` and the per-word tweens), not the generated
`index.html`. `scripts/lib.mjs` holds the shared HyperFrames helpers.
