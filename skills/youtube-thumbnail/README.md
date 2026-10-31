# YouTube thumbnail

A free agent skill for Claude Code, Codex and Cursor. It makes a 1280x720 YouTube thumbnail with a big headline, a badge, a background picture and a subject with an outline and glow. It renders on your own computer with
[HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), so there is no API key and no cost per thumbnail.

See it and a real sample at https://glidezo.com/skills/youtube-thumbnail

## Install

Copy this folder into your agent's skills folder, for example `~/.claude/skills/youtube-thumbnail` for Claude Code, then ask your
agent for the thumbnail. `SKILL.md` tells it what to collect and which script to run.

Needs Node.js 22+. HyperFrames downloads its own headless Chrome on first run.

## Run it by hand

```bash
node scripts/youtube-thumbnail.mjs examples/thumbnail.json              # build and render
node scripts/youtube-thumbnail.mjs examples/thumbnail.json --no-render  # only write the HyperFrames project
```

`examples/thumbnail.json` shows every field; put your `background.png` and `logo.svg` (or a cut-out) next to it, or remove those fields.

## Licence

MIT. The thumbnails you make are yours.
