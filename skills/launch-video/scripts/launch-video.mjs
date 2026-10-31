#!/usr/bin/env node
/**
 * Launch video: a hook line, the product name and tagline, one scene per
 * feature (screenshot in a browser frame that scrolls, title and line of text
 * beside it), then a call to action with the URL.
 *
 *   node scripts/launch-video.mjs <launch.json> [--out <dir>] [--no-render]
 */
import {
  AUDIO_TYPES,
  FORMATS,
  IMAGE_TYPES,
  check,
  compositionHtml,
  copyAsset,
  escapeHtml,
  isMain,
  parseArgs,
  prepareProject,
  readSpec,
  round,
  writeAndRender,
} from "./lib.mjs";

/** Scenes overlap by this much so each one dissolves into the next. */
export const OVERLAP = 0.4;
/** Scene lengths in seconds (before the overlap is added). */
export const SCENE_SECONDS = { hook: 2.6, brand: 3, cta: 3.8 };

/**
 * The scenes in order with start, length and track. Each scene runs `OVERLAP` into
 * the next one for the dissolve, so neighbours alternate between tracks 1 and 2:
 * clips on one track never overlap.
 *
 * @param {{ hook: boolean, features: number, perFeature: number }} options
 * @returns {{ scenes: { id: string, start: number, length: number, track: number }[], total: number }} the scenes and the total length in seconds
 */
export function scenePlan({ hook, features, perFeature }) {
  const lengths = [
    ...(hook ? [["hook", SCENE_SECONDS.hook]] : []),
    ["brand", SCENE_SECONDS.brand],
    ...Array.from({ length: features }, (_, index) => [`f${index}`, perFeature]),
    ["cta", SCENE_SECONDS.cta],
  ];
  let at = 0;
  const scenes = lengths.map(([id, length], index) => {
    const item = { id, start: at, length: length + OVERLAP, track: 1 + (index % 2) };
    at += length;
    return item;
  });
  return { scenes, total: round(at + OVERLAP) };
}

function main() {

  const args = parseArgs("launch-video", "launch");
  const { raw, base } = readSpec(args.spec);

  const product = check.text(raw.product, "product", { max: 32 });
  const tagline = check.text(raw.tagline, "tagline", { max: 70 });
  const hook = check.text(raw.hook, "hook", { required: false, max: 60 });
  const logo = check.file(raw.logo, "logo", base, IMAGE_TYPES, { required: false });
  const cta = check.text(raw.cta, "cta", { required: false, max: 30 }) || "Try it today";
  const url = check.text(raw.url, "url", { required: false, max: 40 });
  const music = check.file(raw.music, "music", base, AUDIO_TYPES, { required: false });
  const format = check.choice(raw.format, "format", Object.keys(FORMATS), "landscape");
  const accent = check.colour(raw.accent, "accent", "#8b7bff");
  const accentInk = check.colour(raw.accentInk, "accentInk", "#0a0a0b");
  const background = check.colour(raw.background, "background", "#0a0a0b");
  const ink = check.colour(raw.ink, "ink", "#f4f4f5");
  const perFeature = check.number(raw.secondsPerFeature, "secondsPerFeature", [3, 8], 4.5);
  const features = check.list(raw.features, "features", [1, 6]).map((feature, index) => ({
    title: check.text(feature?.title, `features[${index}].title`, { max: 40 }),
    text: check.text(feature?.text, `features[${index}].text`, { required: false, max: 110 }),
    image: check.file(feature?.image, `features[${index}].image`, base, IMAGE_TYPES, { required: false }),
  }));
  const { width, height } = FORMATS[format];
  const tall = height > width;

  prepareProject(args.project);
  const logoSrc = logo === undefined ? undefined : copyAsset(args.project, logo, "logo");
  // The closing card gets its own copy: HyperFrames flags one file used by two clips.
  const ctaLogoSrc = logo === undefined ? undefined : copyAsset(args.project, logo, "logo-cta");
  const musicSrc = music === undefined ? undefined : copyAsset(args.project, music, "music");
  const imageSrcs = features.map((feature, index) => (feature.image === undefined ? undefined : copyAsset(args.project, feature.image, `feature-${index + 1}`)));

  const { scenes, total } = scenePlan({ hook: hook !== "", features: features.length, perFeature });
  const scene = Object.fromEntries(scenes.map((item) => [item.id, item]));
  const clip = (id, inner, extra = "") =>
    `      <div id="${id}" class="clip scene${extra}" data-start="${round(scene[id].start)}" data-duration="${round(scene[id].length)}" data-track-index="${scene[id].track}">${inner}</div>`;
  const logoHtml = (id, src) => (src === undefined ? "" : `<img id="${id}" class="logo" src="${src}" alt="" />`);

  const body = [
    `      <div id="bg" class="clip" data-start="0" data-duration="${total}" data-track-index="0"></div>`,
    hook !== "" ? clip("hook", `<h1 class="hook">${hook.split(/\s+/).map((word) => `<span class="mask"><span class="hw">${escapeHtml(word)}</span></span>`).join(" ")}</h1>`) : "",
    clip("brand", `${logoHtml("brand-logo", logoSrc)}<h1 class="product">${escapeHtml(product)}</h1><p class="tagline">${escapeHtml(tagline)}</p>`),
    ...features.map((feature, index) =>
      clip(
        `f${index}`,
        `<div class="copy"><span class="num">${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(feature.title)}</h2>${feature.text === "" ? "" : `<p>${escapeHtml(feature.text)}</p>`}</div>${
          imageSrcs[index] === undefined
            ? ""
            : `<div class="frame"><div class="chrome"><i></i><i></i><i></i></div><div class="shot"><img src="${imageSrcs[index]}" alt="" /></div></div>`
        }`,
        imageSrcs[index] === undefined ? " text-only" : "",
      ),
    ),
    clip("cta", `${logoHtml("cta-logo", ctaLogoSrc)}<h2 class="cta-product">${escapeHtml(product)}</h2><span class="button">${escapeHtml(cta)}</span>${url === "" ? "" : `<p class="url">${escapeHtml(url)}</p>`}`),
    musicSrc === undefined ? "" : `      <audio id="music" class="clip" src="${musicSrc}" data-start="0" data-duration="${total}" data-track-index="3" data-volume="0.6"></audio>`,
  ]
    .filter(Boolean)
    .join("\n");

  const css = `      #root { background: ${background}; color: ${ink}; }
      #bg { background: radial-gradient(circle at 20% 15%, ${accent}38 0%, ${accent}00 45%), radial-gradient(circle at 85% 90%, ${accent}26 0%, ${accent}00 40%); }
      .scene { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: calc(110 * var(--u)); }
      .mask { display: inline-block; overflow: hidden; padding-bottom: 0.08em; }
      .hook { font-size: calc(${tall ? 118 : 108} * var(--u)); font-weight: 800; letter-spacing: -0.035em; line-height: 1.05; max-width: calc(${tall ? 900 : 1500} * var(--u)); }
      .hw { display: inline-block; }
      .logo { width: calc(170 * var(--u)); height: calc(170 * var(--u)); object-fit: contain; margin-bottom: calc(40 * var(--u)); }
      .product { font-size: calc(150 * var(--u)); font-weight: 800; letter-spacing: -0.04em; line-height: 1; }
      .tagline { margin-top: calc(28 * var(--u)); font-size: calc(46 * var(--u)); opacity: 0.8; max-width: calc(1100 * var(--u)); }
      .scene:is([id^="f"]) { flex-direction: ${tall ? "column-reverse" : "row"}; gap: calc(${tall ? 60 : 90} * var(--u)); text-align: left; }
      .copy { flex: 0 0 ${tall ? "auto" : "30%"}; ${tall ? "width: 100%;" : ""} }
      .text-only .copy { flex: 0 1 auto; text-align: center; }
      .num { font-size: calc(30 * var(--u)); font-weight: 700; color: ${accent}; letter-spacing: 0.12em; }
      .copy h2 { margin-top: calc(14 * var(--u)); font-size: calc(${tall ? 78 : 70} * var(--u)); font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; }
      .copy p { margin-top: calc(22 * var(--u)); font-size: calc(${tall ? 40 : 36} * var(--u)); line-height: 1.4; opacity: 0.8; }
      .frame { flex: 1 1 auto; ${tall ? "width: 100%; height: 55%;" : "height: 84%;"} display: flex; flex-direction: column; border-radius: calc(20 * var(--u)); overflow: hidden;
        background: #16161a; border: calc(2 * var(--u)) solid #2a2a30; box-shadow: 0 calc(40 * var(--u)) calc(90 * var(--u)) rgba(0, 0, 0, 0.55); }
      .chrome { flex: 0 0 auto; display: flex; gap: calc(10 * var(--u)); padding: calc(16 * var(--u)) calc(20 * var(--u)); background: #1b1b1f; }
      .chrome i { width: calc(14 * var(--u)); height: calc(14 * var(--u)); border-radius: 50%; background: #3a3a42; }
      .shot { flex: 1 1 auto; position: relative; overflow: hidden; }
      .shot img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 0%; }
      #cta { background: ${accent}; color: ${accentInk}; }
      .cta-product { font-size: calc(110 * var(--u)); font-weight: 800; letter-spacing: -0.04em; }
      .button { margin-top: calc(40 * var(--u)); padding: calc(24 * var(--u)) calc(56 * var(--u)); border-radius: calc(16 * var(--u)); background: ${accentInk}; color: ${accent};
        font-size: calc(46 * var(--u)); font-weight: 700; }
      .url { margin-top: calc(34 * var(--u)); font-size: calc(42 * var(--u)); font-weight: 600; letter-spacing: 0.01em; }`;

  const fadeIn = (id) => (scene[id].start === 0 ? "" : `      tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: ${OVERLAP}, ease: "none" }, ${round(scene[id].start)});`);
  const script = [
    `      tl.fromTo("#bg", { scale: 1, rotate: 0 }, { scale: 1.25, rotate: 8, duration: ${total}, ease: "none" }, 0);`,
    hook !== "" ? `      tl.from(".hw", { yPercent: 110, duration: 0.6, stagger: 0.09, ease: "power4.out" }, 0.15);` : "",
    fadeIn("brand"),
    logoSrc === undefined ? "" : `      tl.from("#brand-logo", { scale: 0.4, opacity: 0, rotate: -12, duration: 0.7, ease: "back.out(1.7)" }, ${round(scene.brand.start + 0.15)});`,
    `      tl.from("#brand .product", { y: 60, opacity: 0, duration: 0.7, ease: "power3.out" }, ${round(scene.brand.start + 0.3)});`,
    `      tl.from("#brand .tagline", { y: 30, opacity: 0, duration: 0.6, ease: "power3.out" }, ${round(scene.brand.start + 0.6)});`,
    ...features.flatMap((_, index) => {
      const id = `f${index}`;
      const start = scene[id].start;
      return [
        fadeIn(id),
        `      tl.from("#${id} .copy > *", { x: ${tall ? 0 : -50}, y: ${tall ? 30 : 0}, opacity: 0, duration: 0.6, stagger: 0.1, ease: "power3.out" }, ${round(start + 0.2)});`,
        imageSrcs[index] === undefined
          ? ""
          : `      tl.from("#${id} .frame", { y: 120, rotateX: 12, opacity: 0, duration: 0.8, ease: "power3.out" }, ${round(start + 0.1)});
      tl.to("#${id} .shot img", { objectPosition: "50% 100%", duration: ${round(perFeature)}, ease: "power1.inOut" }, ${round(start + 0.5)});`,
      ];
    }),
    fadeIn("cta"),
    logoSrc === undefined ? "" : `      tl.from("#cta-logo", { scale: 0.5, opacity: 0, duration: 0.6, ease: "back.out(1.7)" }, ${round(scene.cta.start + 0.2)});`,
    `      tl.from("#cta .cta-product", { y: 40, opacity: 0, duration: 0.6, ease: "power3.out" }, ${round(scene.cta.start + 0.3)});`,
    `      tl.from("#cta .button", { scale: 0.7, opacity: 0, duration: 0.5, ease: "back.out(2)" }, ${round(scene.cta.start + 0.6)});`,
    url === "" ? "" : `      tl.from("#cta .url", { y: 20, opacity: 0, duration: 0.5, ease: "power2.out" }, ${round(scene.cta.start + 0.85)});`,
  ]
    .filter(Boolean)
    .join("\n");

  writeAndRender(args.project, compositionHtml({ width, height, duration: total, css, body, script }), {
    render: args.render,
    skill: "launch-video",
    name: "launch",
    seconds: total,
  });
}

if (isMain(import.meta.url)) main();
