# Data-chart video

A free agent skill for Claude Code, Codex and Cursor. It turns a list of labels and numbers into an animated bar or line chart video, with values that count up and a highlighted point. It renders on your own computer with
[HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), so there is no API key and no cost per video.

See it and a real sample at https://glidezo.com/skills/data-chart-video

## Install

Copy this folder into your agent's skills folder, for example `~/.claude/skills/data-chart-video` for Claude Code, then ask your
agent for the video. `SKILL.md` tells it what to collect and which script to run.

Needs Node.js 22+ and FFmpeg. HyperFrames downloads its own headless Chrome on first run.

## Run it by hand

```bash
node scripts/data-chart-video.mjs examples/chart.json              # build and render
node scripts/data-chart-video.mjs examples/chart.json --no-render  # only write the HyperFrames project
```

`examples/chart.json` shows every field; the numbers are in the file, so it runs as is.

## Licence

MIT. The videos you make are yours.
