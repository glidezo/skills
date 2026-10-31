#!/usr/bin/env node
/**
 * Logo reveal: lines converge, a ring draws and bursts, the logo lands with a
 * light sweep across it, then the brand name and tagline come in and hold.
 *
 *   node scripts/logo-reveal.mjs <logo.json> [--out <dir>] [--no-render]
 */
import { FORMATS, IMAGE_TYPES, check, compositionHtml, copyAsset, escapeHtml, isMain, parseArgs, prepareProject, readSpec, round, writeAndRender } from "./lib.mjs";

/** Seconds: when the name starts, the gap per letter, each piece's animation, and the hold before the end. */
/** Name size in px at 1080 on the short side, and the share of the frame width a long name may fill. */
export const NAME = { size: 120, maxWidth: 0.84, charWidth: 0.56 };

/**
 * Name font size in px: the normal size, or smaller so a long name fits the frame width.
 *
 * @param {number} nameLength - letters in the brand name
 * @param {number} width - frame width in px
 * @param {number} height - frame height in px
 * @returns {number}
 */
export function nameSize(nameLength, width, height) {
  const normal = (NAME.size * Math.min(width, height)) / 1080;
  return Math.min(normal, Math.floor((width * NAME.maxWidth) / (Math.max(nameLength, 1) * NAME.charWidth)));
}

export const TIMING = { name: 1.45, letter: 0.045, piece: 0.6, taglineGap: 0.3, hold: 0.4 };

/**
 * When the name letters and the tagline come in. A long name in a short clip gets a
 * tighter letter stagger, so the tagline still finishes `hold` seconds before the end.
 *
 * @param {number} nameLength - letters in the brand name
 * @param {boolean} hasTagline
 * @param {number} seconds - clip length
 * @returns {{ letter: number, tagline: number, end: number }} gap between letters, tagline start, and when the last piece finishes
 */
export function textTiming(nameLength, hasTagline, seconds) {
  const t = TIMING;
  const tail = hasTagline ? t.taglineGap + t.piece : t.piece;
  const budget = seconds - t.hold - t.name - tail;
  const letter = nameLength <= 1 ? 0 : Math.max(0, Math.min(t.letter, budget / nameLength));
  const tagline = t.name + t.taglineGap + nameLength * letter;
  const end = hasTagline ? tagline + t.piece : t.name + Math.max(0, nameLength - 1) * letter + t.piece;
  return { letter, tagline, end };
}

function main() {

  const args = parseArgs("logo-reveal", "logo-reveal");
  const { raw, base } = readSpec(args.spec);

  const logo = check.file(raw.logo, "logo", base, IMAGE_TYPES);
  const name = check.text(raw.name, "name", { required: false, max: 32 });
  const tagline = check.text(raw.tagline, "tagline", { required: false, max: 60 });
  const format = check.choice(raw.format, "format", Object.keys(FORMATS), "landscape");
  const accent = check.colour(raw.accent, "accent", "#8b7bff");
  const background = check.colour(raw.background, "background", "#0a0a0b");
  const ink = check.colour(raw.ink, "ink", "#f4f4f5");
  const seconds = check.number(raw.seconds, "seconds", [3, 10], 5);
  const { width, height } = FORMATS[format];
  const timing = textTiming([...name].length, tagline !== "", seconds);

  prepareProject(args.project);
  const logoSrc = copyAsset(args.project, logo, "logo");
  const all = round(seconds);
  const lines = ["top", "right", "bottom", "left"];

  const body = `      <div id="glow" class="clip" data-start="0" data-duration="${all}" data-track-index="0"></div>
      <div id="stage" class="clip" data-start="0" data-duration="${all}" data-track-index="2">
        <div id="mark">
${lines.map((side) => `          <div id="line-${side}" class="line ${side}"></div>`).join("\n")}
          <svg id="ring" viewBox="0 0 200 200"><circle cx="100" cy="100" r="96" /></svg>
          <img id="logo" src="${logoSrc}" alt="" />
          <div id="sweep"></div>
        </div>
        ${name === "" ? "" : `<h1 id="name">${[...name].map((char) => `<span>${char === " " ? "&nbsp;" : escapeHtml(char)}</span>`).join("")}</h1>`}
        ${tagline === "" ? "" : `<p id="tagline">${escapeHtml(tagline)}</p>`}
      </div>`;

  const css = `      #root { background: ${background}; color: ${ink}; }
      #glow { background: radial-gradient(circle at 50% 45%, ${accent}40 0%, ${accent}00 50%); }
      /* The lines hang off the logo's centre and reach just past the frame edges, so they always meet on the logo. */
      .line { position: absolute; background: ${accent}; border-radius: 999px; opacity: 0; }
      .top, .bottom { left: calc(50% - 2 * var(--u)); width: calc(4 * var(--u)); height: ${Math.round(height / 2 + 40)}px; }
      .top { bottom: 50%; transform-origin: 50% 0%; }
      .bottom { top: 50%; transform-origin: 50% 100%; }
      .left, .right { top: calc(50% - 2 * var(--u)); height: calc(4 * var(--u)); width: ${Math.round(width / 2 + 40)}px; }
      .left { right: 50%; transform-origin: 0% 50%; }
      .right { left: 50%; transform-origin: 100% 50%; }
      #stage { display: flex; flex-direction: column; align-items: center; justify-content: center; }
      #mark { position: relative; width: calc(300 * var(--u)); height: calc(300 * var(--u)); }
      #ring { position: absolute; inset: calc(-60 * var(--u)); width: calc(420 * var(--u)); height: calc(420 * var(--u)); overflow: visible; }
      #ring circle { fill: none; stroke: ${accent}; stroke-width: 2.5; stroke-dasharray: 604; stroke-dashoffset: 604; transform: rotate(-90deg); transform-origin: 50% 50%; }
      #logo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
      #sweep { position: absolute; inset: 0; -webkit-mask: url(${logoSrc}) center / contain no-repeat; mask: url(${logoSrc}) center / contain no-repeat;
        background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.75) 50%, transparent 70%) no-repeat; background-size: 250% 100%; background-position: 150% 0; }
      #name { margin-top: calc(70 * var(--u)); font-size: ${nameSize([...name].length, width, height)}px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; display: flex; }
      #name span { display: inline-block; }
      #tagline { max-width: ${NAME.maxWidth * 100}%; text-align: center; margin-top: calc(26 * var(--u)); font-size: calc(40 * var(--u)); color: ${ink}; opacity: 0.75; letter-spacing: 0.01em; }`;

  const script = [
    `      tl.fromTo("#glow", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1.1, duration: ${all}, ease: "none" }, 0);`,
    ...lines.map((side, index) => {
      const axis = side === "top" || side === "bottom" ? "scaleY" : "scaleX";
      return `      tl.fromTo("#line-${side}", { ${axis}: 0, opacity: 1 }, { ${axis}: 1, duration: 0.55, ease: "power3.in" }, ${round(0.1 + index * 0.05)});
      tl.to("#line-${side}", { ${axis}: 0, opacity: 0, transformOrigin: "${{ top: "50% 100%", bottom: "50% 0%", left: "100% 50%", right: "0% 50%" }[side]}", duration: 0.3, ease: "power2.out" }, ${round(0.7 + index * 0.05)});`;
    }),
    `      tl.to("#ring circle", { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" }, 0.45);`,
    `      tl.to("#ring", { scale: 1.6, opacity: 0, duration: 0.7, ease: "power2.out" }, 1.05);`,
    `      tl.from("#logo", { scale: 0.35, rotate: -14, opacity: 0, filter: "blur(18px)", duration: 0.9, ease: "back.out(1.6)" }, 0.85);`,
    `      tl.to("#sweep", { backgroundPosition: "-60% 0", duration: 0.9, ease: "power2.inOut" }, 1.6);`,
    name === "" ? "" : `      tl.from("#name span", { opacity: 0, y: 50, rotateX: -70, duration: ${TIMING.piece}, stagger: ${round(timing.letter)}, ease: "power3.out" }, ${TIMING.name});`,
    tagline === "" ? "" : `      tl.from("#tagline", { opacity: 0, y: 24, duration: ${TIMING.piece}, ease: "power2.out" }, ${round(timing.tagline)});`,
    // A slow drift while the logo holds, so the end card isn't a still frame.
    `      tl.fromTo("#stage", { scale: 1 }, { scale: 1.04, duration: ${round(seconds - 1.6)}, ease: "none" }, 1.6);`,
  ]
    .filter(Boolean)
    .join("\n");

  writeAndRender(args.project, compositionHtml({ width, height, duration: seconds, css, body, script }), {
    render: args.render,
    skill: "logo-reveal",
    name: "logo-reveal",
    seconds,
  });
}

if (isMain(import.meta.url)) main();
