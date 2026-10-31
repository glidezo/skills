#!/usr/bin/env node
/**
 * Animated captions: burns word-by-word captions into a talking video. A few
 * words show at a time; the word being spoken pops in the accent colour.
 * Word timings come from a transcript file or from `hyperframes transcribe`.
 *
 *   node scripts/animated-captions.mjs <captions.json> [--out <dir>] [--no-render]
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import {
  HYPERFRAMES_VERSION,
  VIDEO_TYPES,
  check,
  compositionHtml,
  copyAsset,
  escapeHtml,
  fail,
  isMain,
  parseArgs,
  prepareProject,
  readSpec,
  round,
  runNpx,
  say,
  writeAndRender,
} from "./lib.mjs";

/** Longest side of the output; bigger sources are scaled down (captions don't need 4K). */
export const MAX_SIDE = 1920;
/** A pause longer than this (seconds) starts a new caption group. */
export const GROUP_GAP = 0.5;
/** A group stays this long (seconds) after its last word when silence follows. */
export const LINGER = 0.4;
/** Shortest time (seconds) a group is on screen, unless the next one starts sooner. */
export const MIN_GROUP = 0.2;

/** @typedef {{ text: string, start: number, end: number }} Word */
/** @typedef {{ words: Word[], start: number, end: number }} Group */

/**
 * Whether a transcript path is word JSON (any letter case), not an SRT/VTT to import.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isJsonTranscript(path) {
  return extname(path).toLowerCase() === ".json";
}

/**
 * Size, duration and audio of a video from ffprobe's JSON. Width and height are
 * as displayed: a phone clip stored landscape with a 90° rotation flag is portrait.
 *
 * @param {any} info - ffprobe's parsed `-of json` output
 * @returns {{ width: number, height: number, duration: number, audio: boolean }}
 * @throws {Error} when there is no video stream or no readable duration
 */
export function readProbe(info) {
  const streams = Array.isArray(info?.streams) ? info.streams : [];
  const picture = streams.find((stream) => stream.codec_type === "video");
  if (picture === undefined || !(picture.width > 0) || !(picture.height > 0)) throw new Error("the file has no video stream");
  const rotation = [
    ...(Array.isArray(picture.side_data_list) ? picture.side_data_list.map((data) => data.rotation) : []),
    picture.tags?.rotate,
  ]
    .map(Number)
    .find((value) => Number.isFinite(value) && value !== 0);
  const turned = rotation !== undefined && Math.abs(Math.round(rotation / 90)) % 2 === 1;
  const duration = [info?.format?.duration, picture.duration].map(Number).find((value) => Number.isFinite(value) && value > 0);
  if (duration === undefined) throw new Error("ffprobe found no duration; re-save the video as MP4 (for example with ffmpeg -i in.webm out.mp4) and try again");
  return {
    width: turned ? picture.height : picture.width,
    height: turned ? picture.width : picture.height,
    duration,
    audio: streams.some((stream) => stream.codec_type === "audio"),
  };
}

/**
 * An SRT/VTT import gives one entry per subtitle line, not per word: the line's
 * time is shared out across its words by length, so the highlight is approximate.
 */
export function splitEntry(text, start, end) {
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [{ text, start, end }];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  let at = start;
  return parts.map((part) => {
    const length = ((end - start) * part.length) / total;
    const word = { text: part, start: at, end: at + length };
    at += length;
    return word;
  });
}

/** Keeps the words inside the trimmed part, with times relative to its start. */
export function shiftWords(list, start, end) {
  return list
    .filter((word) => word.start >= start && word.end <= end + 0.05)
    .map((word) => ({ text: word.text, start: word.start - start, end: Math.min(word.end, end) - start }));
}

/**
 * Splits words into caption groups: first into phrases (sentence ends, commas,
 * pauses), then each phrase into the fewest groups of at most `maxWords`, sized
 * evenly, so no line is a lone leftover word. A group stays until the next one
 * starts, or `LINGER` after its last word when silence follows; groups never overlap.
 *
 * @param {Word[]} list - words with `start`/`end` in seconds, in order
 * @param {{ maxWords: number, length: number }} options - `maxWords` per group and the clip `length` in seconds
 * @returns {Group[]}
 */
export function groupWords(list, { maxWords, length }) {
  const phrases = [];
  let phrase = [];
  list.forEach((word, index) => {
    phrase.push(word);
    const next = list[index + 1];
    const sentenceEnd = /[.?!…]$/.test(word.text);
    const pause = next !== undefined && next.start - word.end > GROUP_GAP;
    const comma = /[,;:]$/.test(word.text) && phrase.length >= 2;
    if (sentenceEnd || pause || comma || next === undefined) {
      phrases.push(phrase);
      phrase = [];
    }
  });
  const result = phrases.flatMap((words) => {
    const count = Math.ceil(words.length / maxWords);
    const size = Math.floor(words.length / count);
    const longer = words.length % count;
    let at = 0;
    return Array.from({ length: count }, (_, index) => {
      const group = words.slice(at, at + size + (index < longer ? 1 : 0));
      at += group.length;
      return group;
    });
  });
  return result.map((group, index) => {
    const start = group[0].start;
    const last = group[group.length - 1];
    const nextStart = result[index + 1]?.[0].start ?? length;
    // Silence after the group: clear it LINGER after the last word. Otherwise hold until the next group.
    const wanted = Math.max(last.end + LINGER, start + MIN_GROUP);
    return { words: group, start, end: Math.max(start + 0.01, Math.min(wanted, nextStart)) };
  });
}

function main() {
  const args = parseArgs("animated-captions", "captions");
  const { raw, base } = readSpec(args.spec);

  const video = check.file(raw.video, "video", base, VIDEO_TYPES);
  const transcriptFile = check.file(raw.transcript, "transcript", base, [".json", ".srt", ".vtt"], { required: false });
  const position = check.choice(raw.position, "position", ["bottom", "middle", "top"], "bottom");
  const accent = check.colour(raw.accent, "accent", "#facc15");
  const ink = check.colour(raw.ink, "ink", "#ffffff");
  const maxWords = check.number(raw.maxWords, "maxWords", [1, 8], 4);
  const uppercase = raw.uppercase ?? true;
  if (typeof uppercase !== "boolean") fail(`"uppercase" must be true or false`);
  const language = check.text(raw.language, "language", { required: false, max: 10 }) || "en";

  const probe = probeVideo(video);
  const from = check.number(raw.from, "from", [0, probe.duration], 0);
  const to = check.number(raw.to, "to", [from + 0.5, probe.duration], probe.duration);
  const length = to - from;
  const scale = Math.min(1, MAX_SIDE / Math.max(probe.width, probe.height));
  // Even sizes: H.264 needs them.
  const width = Math.round((probe.width * scale) / 2) * 2;
  const height = Math.round((probe.height * scale) / 2) * 2;

  prepareProject(args.project);
  const words = shiftWords(readTranscript(transcriptFile, video, args.project, language), from, to);
  if (words.length === 0) fail(`no words between ${from} s and ${to} s; check "from", "to" and the transcript`);
  const groups = groupWords(words, { maxWords, length });
  const videoSrc = copyAsset(args.project, video, "source");

  const placement = { bottom: "align-items: flex-end; padding-bottom: 14%;", middle: "align-items: center;", top: "align-items: flex-start; padding-top: 12%;" }[position];
  const body = [
    `      <video id="source" class="clip" src="${videoSrc}" data-start="0" data-duration="${round(length)}" data-media-start="${round(from)}" data-track-index="0" playsinline${probe.audio ? ` data-has-audio="true"` : " muted"}></video>`,
    ...groups.map(
      (group, index) =>
        `      <div id="g${index}" class="clip group" data-start="${round(group.start)}" data-duration="${round(group.end - group.start)}" data-track-index="1"><p>${group.words
          .map((word, wordIndex) => `<span id="g${index}w${wordIndex}" class="w">${escapeHtml(uppercase ? word.text.toUpperCase() : word.text)}</span>`)
          .join("")}</p></div>`,
    ),
  ].join("\n");

  const css = `      #root { background: #000; }
      #source { width: 100%; height: 100%; object-fit: cover; }
      .group { display: flex; justify-content: center; ${placement} padding-left: 8%; padding-right: 8%; }
      .group p { text-align: center; font-size: calc(${width > height ? 64 : 76} * var(--u)); font-weight: 900; line-height: 1.15; letter-spacing: -0.01em; color: ${ink};
        -webkit-text-stroke: calc(10 * var(--u)) rgba(0, 0, 0, 0.9); paint-order: stroke fill; text-shadow: 0 calc(6 * var(--u)) calc(18 * var(--u)) rgba(0, 0, 0, 0.55); }
      .w { display: inline-block; margin: 0 0.14em; }`;

  const script = groups
    .flatMap((group, index) => [
      `      tl.from("#g${index} p", { scale: 0.82, opacity: 0, duration: 0.16, ease: "back.out(2.2)" }, ${round(group.start)});`,
      ...group.words.flatMap((word, wordIndex) => {
        const id = `#g${index}w${wordIndex}`;
        const next = group.words[wordIndex + 1];
        return [
          `      tl.set("${id}", { color: "${accent}" }, ${round(word.start)});`,
          `      tl.fromTo("${id}", { scale: 1 }, { scale: 1.12, duration: 0.08, ease: "power2.out" }, ${round(word.start)});`,
          `      tl.to("${id}", { scale: 1, duration: 0.12, ease: "power2.in" }, ${round(word.start + 0.08)});`,
          // The word goes back to white when the next one starts; the group's last word stays lit.
          next === undefined ? "" : `      tl.set("${id}", { color: "${ink}" }, ${round(next.start)});`,
        ].filter(Boolean);
      }),
    ])
    .join("\n");

  writeAndRender(args.project, compositionHtml({ width, height, duration: length, css, body, script }), {
    render: args.render,
    skill: "animated-captions",
    name: "captioned",
    seconds: length,
  });
}

/** Runs ffprobe (installed with FFmpeg) on the video. */
function probeVideo(path) {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type,width,height,duration:stream_side_data=rotation:stream_tags=rotate:format=duration", "-of", "json", path],
    { encoding: "utf8" },
  );
  if (result.error !== undefined || result.status !== 0) fail(`ffprobe couldn't read ${path}; is FFmpeg installed? ${result.error?.message ?? result.stderr ?? ""}`);
  try {
    return readProbe(JSON.parse(result.stdout));
  } catch (error) {
    return fail(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Word timings as HyperFrames writes them: `[{ text, start, end }]` in seconds.
 * A JSON file is read as is; an SRT/VTT file or the video itself goes through `hyperframes transcribe`.
 */
function readTranscript(transcriptFile, video, project, language) {
  let file = transcriptFile;
  if (file === undefined || !isJsonTranscript(file)) {
    const input = file ?? video;
    const target = join(project, "transcript.json");
    rmSync(target, { force: true });
    say(file === undefined ? "transcribing the video on this computer (first run downloads the speech model)" : `importing ${file}`);
    const problem = runNpx(["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, "transcribe", input, "--dir", project, "--language", language]);
    if (problem !== undefined || !existsSync(target)) {
      fail(`transcription failed${problem === undefined ? "" : ` (${problem})`}. Install a local speech model once with "npx hyperframes@${HYPERFRAMES_VERSION} models install parakeet", or give a "transcript" file`);
    }
    file = target;
  }
  let list;
  try {
    list = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`can't read ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(list)) list = list?.words;
  if (!Array.isArray(list)) fail(`${file} must be a list of { "text", "start", "end" } words`);
  return list.flatMap((entry, index) => {
    const text = check.text(entry?.text ?? entry?.word, `transcript entry ${index} text`, { max: 300 });
    const start = Number(entry.start);
    const end = Number(entry.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) fail(`transcript entry ${index} ("${text}") has bad start/end times`);
    return splitEntry(text, start, end);
  });
}

if (isMain(import.meta.url)) main();
