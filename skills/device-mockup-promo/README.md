# Device mockup promo

A free agent skill for Claude Code, Codex and Cursor. It puts your app or website screenshots inside a phone or laptop and turns them into a short promo video with captions and a call to action. It renders on your own computer with
[HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), so there is no API key and no cost per video.

See it and a real sample at https://glidezo.com/skills/device-mockup-promo

## Install

Copy this folder into your agent's skills folder, for example `~/.claude/skills/device-mockup-promo` for Claude Code, then ask your
agent for the video. `SKILL.md` tells it what to collect and which script to run.

Needs Node.js 22+ and FFmpeg. HyperFrames downloads its own headless Chrome on first run.

## Run it by hand

```bash
node scripts/device-mockup-promo.mjs examples/promo.json              # build and render
node scripts/device-mockup-promo.mjs examples/promo.json --no-render  # only write the HyperFrames project
```

`examples/promo.json` shows every field; put your screenshots in `examples/shots/` and your `logo.svg` next to it.

## Licence

MIT. The videos you make are yours.
