#!/usr/bin/env node
/**
 * Kinetic type title: one line of text, each word entering with its own move,
 * a highlighted word on an accent block, an accent bar, then a clean exit.
 *
 *   node scripts/kinetic-type-title.mjs <title.json> [--out <dir>] [--no-render]
 */
import { FORMATS, check, compositionHtml, escapeHtml, fail, isMain, parseArgs, prepareProject, readSpec, round, writeAndRender } from "./lib.mjs";

/** One entrance per word, cycled, so a title never moves as a single block. */
const ENTRANCES = [
  "{ yPercent: 110, opacity: 0, rotate: 4 }",
  "{ xPercent: -40, opacity: 0, skewX: 12 }",
  "{ scale: 1.8, opacity: 0, filter: 'blur(14px)' }",
  "{ yPercent: -110, opacity: 0 }",
];
/** Seconds each part takes; the gap between word entrances shrinks when the title is short. */
export const TIMING = { first: 0.35, stagger: 0.22, entrance: 0.75, blockAfter: 0.25, block: 0.5, barAfter: 0.4, bar: 0.6, hold: 0.2, exit: 0.45, exitStagger: 0.05, tail: 0.2 };

/**
 * When each part of the title happens, so every word is in before the exit starts and
 * the last word is out before the clip ends, at any allowed length (3 to 12 s, 1 to 8 words).
 *
 * @param {number} count - words in the title
 * @param {number} seconds - clip length
 * @returns {{ entries: number[], lastIn: number, block: number, bar: number, exit: number, exitEnd: number }} start times in seconds
 */
export function titleTiming(count, seconds) {
  const t = TIMING;
  const exitLength = t.exit + t.exitStagger * (count - 1);
  const exit = seconds - t.tail - exitLength;
  // The bar finishes `hold` before the exit; the last entrance starts early enough for that.
  const lastInLimit = exit - t.hold - t.barAfter - t.bar;
  const stagger = count === 1 ? 0 : Math.max(0, Math.min(t.stagger, (lastInLimit - t.first) / (count - 1)));
  const entries = Array.from({ length: count }, (_, index) => t.first + index * stagger);
  const lastIn = t.first + (count - 1) * stagger;
  return { entries, lastIn, block: lastIn + t.blockAfter, bar: lastIn + t.barAfter, exit, exitEnd: exit + exitLength };
}

function main() {
  const args = parseArgs("kinetic-type-title", "kinetic-title");
  const { raw } = readSpec(args.spec);

  const text = check.text(raw.text, "text", { max: 60 });
  const words = text.split(/\s+/);
  if (words.length > 8) fail(`"text" has ${words.length} words; use 8 at most`);
  const highlight = check.text(raw.highlight, "highlight", { required: false, max: 30 }).toLowerCase();
  const format = check.choice(raw.format, "format", Object.keys(FORMATS), "landscape");
  const accent = check.colour(raw.accent, "accent", "#8b7bff");
  const background = check.colour(raw.background, "background", "#0a0a0b");
  const ink = check.colour(raw.ink, "ink", "#f4f4f5");
  const accentInk = check.colour(raw.accentInk, "accentInk", "#0a0a0b");
  const seconds = check.number(raw.seconds, "seconds", [3, 12], 6);
  const { width, height } = FORMATS[format];

  // Shorter titles get bigger type; the line wraps on narrow formats.
  const fontSize = Math.round(Math.min(230, Math.max(96, 2600 / Math.max(text.length, 8))));
  const stripPunctuation = (word) => word.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "");
  let highlighted = words.findIndex((word) => stripPunctuation(word) === stripPunctuation(highlight));
  if (highlight !== "" && highlighted === -1) fail(`"highlight" must be one of the words in "text"`);
  if (highlight === "") highlighted = words.length - 1;

  const timing = titleTiming(words.length, seconds);
  const { lastIn, exit: exitAt } = timing;

  const body = `      <div id="glow" class="clip" data-start="0" data-duration="${round(seconds)}" data-track-index="0"></div>
      <div id="title" class="clip" data-start="0" data-duration="${round(seconds)}" data-track-index="1">
        <div class="line">${words
          .map((word, index) => `<span class="mask"><span id="w${index}" class="word${index === highlighted ? " hl" : ""}">${index === highlighted ? `<span class="block"></span>` : ""}<span class="txt">${escapeHtml(word)}</span></span></span>`)
          .join(" ")}</div>
        <div id="bar"></div>
      </div>`;

  const css = `      #root { background: ${background}; color: ${ink}; }
      #glow { background: radial-gradient(circle at 50% 55%, ${accent}33 0%, ${accent}00 55%); }
      #title { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: calc(100 * var(--u)); }
      .line { display: flex; flex-wrap: wrap; justify-content: center; gap: 0 calc(${Math.round(fontSize * 0.28)} * var(--u)); text-align: center; }
      .mask { display: inline-block; overflow: hidden; padding: 0.04em 0.06em 0.1em; }
      .word { position: relative; display: inline-block; font-size: calc(${fontSize} * var(--u)); font-weight: 800; letter-spacing: -0.035em; line-height: 1.02; }
      .word .txt { position: relative; }
      .hl { color: ${accentInk}; padding: 0 0.12em; }
      .block { position: absolute; inset: 0.08em 0 0.02em; background: ${accent}; border-radius: calc(14 * var(--u)); transform-origin: 0% 50%; }
      #bar { margin-top: calc(48 * var(--u)); width: calc(${Math.round(Math.min(width, height) * 0.36)} * var(--u)); height: calc(12 * var(--u)); border-radius: 999px; background: ${accent}; transform-origin: 0% 50%; }`;

  const script = [
    `      tl.fromTo("#glow", { scale: 0.8, opacity: 0 }, { scale: 1.15, opacity: 1, duration: ${round(seconds)}, ease: "none" }, 0);`,
    ...words.map((_, index) => `      tl.from("#w${index}", { ...${ENTRANCES[index % ENTRANCES.length]}, duration: ${TIMING.entrance}, ease: "power4.out" }, ${round(timing.entries[index])});`),
    `      tl.from("#w${highlighted} .block", { scaleX: 0, duration: 0.5, ease: "power3.inOut" }, ${round(timing.block)});`,
    `      tl.from("#bar", { scaleX: 0, duration: 0.6, ease: "power3.inOut" }, ${round(timing.bar)});`,
    // A slow push-in while the title holds, so the frame never freezes.
    `      tl.fromTo(".line", { scale: 1 }, { scale: 1.04, duration: ${round(exitAt - lastIn)}, ease: "none" }, ${round(lastIn)});`,
    `      tl.to(".word", { yPercent: -110, opacity: 0, duration: ${TIMING.exit}, stagger: ${TIMING.exitStagger}, ease: "power3.in" }, ${round(exitAt)});`,
    `      tl.to("#bar", { scaleX: 0, transformOrigin: "100% 50%", duration: 0.4, ease: "power3.in" }, ${round(exitAt + 0.1)});`,
  ].join("\n");

  prepareProject(args.project);
  writeAndRender(args.project, compositionHtml({ width, height, duration: seconds, css, body, script }), {
    render: args.render,
    skill: "kinetic-type-title",
    name: "kinetic-title",
    seconds,
  });
}

if (isMain(import.meta.url)) main();
