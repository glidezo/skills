# Animated captions

A free agent skill for Claude Code, Codex and Cursor. It burns word-by-word animated captions into a talking video, Shorts and TikTok style, with the spoken word highlighted. It renders on your own computer with
[HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), so there is no API key and no cost per video.

See it and a real sample at https://glidezo.com/skills/animated-captions

## Install

Copy this folder into your agent's skills folder, for example `~/.claude/skills/animated-captions` for Claude Code, then ask your
agent for the video. `SKILL.md` tells it what to collect and which script to run.

Needs Node.js 22+ and FFmpeg. HyperFrames downloads its own headless Chrome on first run.

## Run it by hand

```bash
node scripts/animated-captions.mjs examples/captions.json              # build and render
node scripts/animated-captions.mjs examples/captions.json --no-render  # only write the HyperFrames project
```

`examples/captions.json` shows every field; put your video next to it. For automatic word timings install the local speech model once: `npx hyperframes@0.8.223 models install parakeet` (about 640 MB, free).

## Licence

MIT. The videos you make are yours.
