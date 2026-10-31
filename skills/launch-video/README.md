# Launch video

A free agent skill for Claude Code, Codex and Cursor. It turns a product name, a few features with screenshots and a call to action into a launch or promo video. It renders on your own computer with
[HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), so there is no API key and no cost per video.

See it and a real sample at https://glidezo.com/skills/launch-video

## Install

Copy this folder into your agent's skills folder, for example `~/.claude/skills/launch-video` for Claude Code, then ask your
agent for the video. `SKILL.md` tells it what to collect and which script to run.

Needs Node.js 22+ and FFmpeg. HyperFrames downloads its own headless Chrome on first run.

## Run it by hand

```bash
node scripts/launch-video.mjs examples/launch.json              # build and render
node scripts/launch-video.mjs examples/launch.json --no-render  # only write the HyperFrames project
```

`examples/launch.json` shows every field; put your logo and screenshots next to it (the example's files are not included).

## Licence

MIT. The videos you make are yours.
