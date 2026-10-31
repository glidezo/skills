# Logo reveal

A free agent skill for Claude Code, Codex and Cursor. It turns your logo into a short intro animation: lines converge, a ring draws, the logo lands with a light sweep, then your brand name and tagline appear. It renders on your own computer with
[HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), so there is no API key and no cost per video.

See it and a real sample at https://glidezo.com/skills/logo-reveal

## Install

Copy this folder into your agent's skills folder, for example `~/.claude/skills/logo-reveal` for Claude Code, then ask your
agent for the video. `SKILL.md` tells it what to collect and which script to run.

Needs Node.js 22+ and FFmpeg. HyperFrames downloads its own headless Chrome on first run.

## Run it by hand

```bash
node scripts/logo-reveal.mjs examples/logo.json              # build and render
node scripts/logo-reveal.mjs examples/logo.json --no-render  # only write the HyperFrames project
```

`examples/logo.json` shows every field; put your `logo.svg` (or PNG) next to it.

## Licence

MIT. The videos you make are yours.
