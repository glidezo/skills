# Kinetic type title

A free agent skill for Claude Code, Codex and Cursor. It turns a short line of text into an animated kinetic-typography title video: each word enters with its own move, one word is highlighted, an accent bar wipes in. It renders on your own computer with
[HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), so there is no API key and no cost per video.

See it and a real sample at https://glidezo.com/skills/kinetic-type-title

## Install

Copy this folder into your agent's skills folder, for example `~/.claude/skills/kinetic-type-title` for Claude Code, then ask your
agent for the video. `SKILL.md` tells it what to collect and which script to run.

Needs Node.js 22+ and FFmpeg. HyperFrames downloads its own headless Chrome on first run.

## Run it by hand

```bash
node scripts/kinetic-type-title.mjs examples/title.json              # build and render
node scripts/kinetic-type-title.mjs examples/title.json --no-render  # only write the HyperFrames project
```

`examples/title.json` shows every field.

## Licence

MIT. The videos you make are yours.
