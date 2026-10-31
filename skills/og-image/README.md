# OG image

A free agent skill for Claude Code, Codex and Cursor. It makes a 1200x630 Open Graph image (the link preview on X, LinkedIn, Facebook and Slack) with a title that sizes itself to fit. It renders on your own computer with
[HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), so there is no API key and no cost per image.

See it and a real sample at https://glidezo.com/skills/og-image

## Install

Copy this folder into your agent's skills folder, for example `~/.claude/skills/og-image` for Claude Code, then ask your
agent for the image. `SKILL.md` tells it what to collect and which script to run.

Needs Node.js 22+. HyperFrames downloads its own headless Chrome on first run.

## Run it by hand

```bash
node scripts/og-image.mjs examples/og.json              # build and render
node scripts/og-image.mjs examples/og.json --no-render  # only write the HyperFrames project
```

`examples/og.json` shows every field; put your `logo.svg` and `screenshot.png` next to it, or remove those fields.

## Licence

MIT. The images you make are yours.
