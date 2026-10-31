#!/usr/bin/env node
/**
 * Real estate slideshow maker: turns listing photos and a listing.json into a
 * HyperFrames project (one HTML composition), then renders it to MP4.
 *
 *   node scripts/make-slideshow.mjs <listing.json> [--out <dir>] [--no-render]
 *
 * No dependencies besides Node 22+; HyperFrames is run with npx at a pinned
 * version, so a re-render months later gives the same video.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { HYPERFRAMES_VERSION, renderArgs, runNpx } from "./lib.mjs";

/** GSAP build the HyperFrames 0.8 scaffold loads. */
const GSAP_URL = "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js";

const FORMATS = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};
const PHOTO_TYPES = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MUSIC_TYPES = new Set([".mp3", ".wav", ".m4a"]);
const DEFAULTS = { format: "landscape", accent: "#8b7bff", secondsPerPhoto: 3, introSeconds: 4, outroSeconds: 4, fps: 30 };
const LIMITS = { photos: [2, 20], secondsPerPhoto: [1.5, 8], introSeconds: [2, 8], outroSeconds: [2, 8] };
/** Seconds two photos overlap while one fades into the next. */
const CROSSFADE = 0.6;

function fail(message) {
  console.error(`make-slideshow: ${message}`);
  process.exit(1);
}

function text(value, field, { required = true, max = 80 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) fail(`"${field}" is required`);
    return "";
  }
  if (typeof value !== "string" && typeof value !== "number") fail(`"${field}" must be text`);
  const result = String(value).trim();
  if (result.length > max) fail(`"${field}" is longer than ${max} characters`);
  return result;
}

function number(value, field, [min, max], fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(`"${field}" must be a number from ${min} to ${max}`);
  }
  return value;
}

/** Reads and checks listing.json; photo paths are resolved against its folder. */
function readListing(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`can't read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail("listing.json must be a JSON object");
  const base = dirname(resolve(path));
  const format = raw.format ?? DEFAULTS.format;
  if (!Object.hasOwn(FORMATS, format)) fail(`"format" must be one of ${Object.keys(FORMATS).join(", ")}`);
  const accent = raw.accent ?? DEFAULTS.accent;
  if (typeof accent !== "string" || !/^#[0-9a-fA-F]{6}$/.test(accent)) fail(`"accent" must be a hex colour like #8b7bff`);
  if (!Array.isArray(raw.photos)) fail(`"photos" must be a list`);
  const [minPhotos, maxPhotos] = LIMITS.photos;
  if (raw.photos.length < minPhotos || raw.photos.length > maxPhotos) fail(`give ${minPhotos} to ${maxPhotos} photos`);
  const photos = raw.photos.map((photo, index) => {
    const entry = typeof photo === "string" ? { file: photo } : photo;
    if (typeof entry !== "object" || entry === null) fail(`photos[${index}] must be a path or { "file", "label" }`);
    const file = resolve(base, text(entry.file, `photos[${index}].file`, { max: 500 }));
    if (!existsSync(file)) fail(`photo not found: ${file}`);
    if (!PHOTO_TYPES.has(extname(file).toLowerCase())) fail(`photo must be JPG, PNG or WebP: ${file}`);
    return { file, label: text(entry.label, `photos[${index}].label`, { required: false, max: 40 }) };
  });
  let music;
  if (raw.music !== undefined) {
    music = resolve(base, text(raw.music, "music", { max: 500 }));
    if (!existsSync(music)) fail(`music not found: ${music}`);
    if (!MUSIC_TYPES.has(extname(music).toLowerCase())) fail(`music must be MP3, WAV or M4A: ${music}`);
  }
  const agent = raw.agent ?? {};
  return {
    music,
    format,
    accent,
    fps: DEFAULTS.fps,
    secondsPerPhoto: number(raw.secondsPerPhoto, "secondsPerPhoto", LIMITS.secondsPerPhoto, DEFAULTS.secondsPerPhoto),
    introSeconds: number(raw.introSeconds, "introSeconds", LIMITS.introSeconds, DEFAULTS.introSeconds),
    outroSeconds: number(raw.outroSeconds, "outroSeconds", LIMITS.outroSeconds, DEFAULTS.outroSeconds),
    tagline: text(raw.tagline, "tagline", { required: false, max: 40 }),
    address: text(raw.address, "address"),
    city: text(raw.city, "city", { required: false }),
    price: text(raw.price, "price", { max: 30 }),
    specs: [
      raw.beds === undefined ? "" : `${text(raw.beds, "beds", { max: 10 })} bd`,
      raw.baths === undefined ? "" : `${text(raw.baths, "baths", { max: 10 })} ba`,
      text(raw.area, "area", { required: false, max: 20 }),
    ].filter(Boolean),
    agent: {
      name: text(agent.name, "agent.name", { required: false, max: 50 }),
      phone: text(agent.phone, "agent.phone", { required: false, max: 30 }),
      brokerage: text(agent.brokerage, "agent.brokerage", { required: false, max: 60 }),
    },
    photos,
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Start and length of each photo; photos overlap by {@link CROSSFADE} so one fades into the next. */
function schedule(listing) {
  const count = listing.photos.length;
  const slots = listing.photos.map((_, index) => {
    const start = index === 0 ? 0 : listing.introSeconds + (index - 1) * listing.secondsPerPhoto;
    const length = index === 0 ? listing.introSeconds : listing.secondsPerPhoto;
    return { start, length: length + CROSSFADE };
  });
  const outroStart = listing.introSeconds + (count - 1) * listing.secondsPerPhoto;
  return { slots, outroStart, total: round(outroStart + listing.outroSeconds) };
}

function round(seconds) {
  return Math.round(seconds * 1000) / 1000;
}

/** The composition. Sizes use `--u` (1px at 1080 on the short side), so all three formats share one layout. */
function compositionHtml(listing, photoNames, musicName) {
  const { width, height } = FORMATS[listing.format];
  const { slots, outroStart, total } = schedule(listing);
  const tall = height > width;
  const e = escapeHtml;
  const photos = slots
    .map(
      (slot, index) =>
        `      <div id="photo-${index}" class="clip photo" data-layout-allow-overflow data-start="${round(slot.start)}" data-duration="${round(slot.length)}" data-track-index="0">
        <img src="assets/${photoNames[index]}" alt="" />
      </div>`,
    )
    .join("\n");
  const labels = listing.photos
    .map((photo, index) =>
      index === 0 || photo.label === ""
        ? ""
        : `      <div id="label-${index}" class="clip label" data-start="${round(slots[index].start + 0.3)}" data-duration="${round(listing.secondsPerPhoto - 0.3)}" data-track-index="2">${e(photo.label)}</div>`,
    )
    .filter(Boolean)
    .join("\n");
  const agentLines = [listing.agent.name, listing.agent.phone, listing.agent.brokerage].filter(Boolean);
  const tweens = slots
    .map((slot, index) => {
      // Alternate the drift so the camera seems to move around the home, not zoom in on every room.
      const from = index % 2 === 0 ? "scale: 1.02, xPercent: -1" : "scale: 1.1, xPercent: 1";
      const to = index % 2 === 0 ? "scale: 1.1, xPercent: 1" : "scale: 1.02, xPercent: -1";
      const fade = index === 0 ? "" : `\n      tl.fromTo("#photo-${index}", { opacity: 0 }, { opacity: 1, duration: ${CROSSFADE}, ease: "none" }, ${round(slot.start)});`;
      return `      tl.fromTo("#photo-${index} img", { ${from} }, { ${to}, duration: ${round(slot.length)}, ease: "none" }, ${round(slot.start)});${fade}`;
    })
    .join("\n");
  const labelTweens = listing.photos
    .map((photo, index) =>
      index === 0 || photo.label === ""
        ? ""
        : `      tl.from("#label-${index}", { opacity: 0, x: -30, duration: 0.5, ease: "power3.out" }, ${round(slots[index].start + 0.3)});`,
    )
    .filter(Boolean)
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <script src="${GSAP_URL}"></script>
    <style>
      :root {
        --u: ${Math.min(width, height) / 1080}px;
        --accent: ${listing.accent};
        --ink: #ffffff;
        --shade: rgba(10, 10, 11, 0.86);
        --font: "Inter", "Helvetica Neue", Arial, sans-serif;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #0a0a0b; }
      #root { position: relative; width: 100%; height: 100%; font-family: var(--font); color: var(--ink); }
      .clip { position: absolute; inset: 0; }
      .photo { overflow: hidden; }
      .photo img { width: 100%; height: 100%; object-fit: cover; transform-origin: 50% 50%; }
      .scrim { background: linear-gradient(to top, rgba(10,10,11,0.88) 0%, rgba(10,10,11,0.35) 45%, rgba(10,10,11,0) 70%); }
      .card { inset: auto calc(80 * var(--u)) calc(${tall ? 260 : 80} * var(--u)) calc(80 * var(--u)); }
      .tag { display: inline-block; padding: calc(10 * var(--u)) calc(22 * var(--u)); border-radius: calc(12 * var(--u));
        background: var(--accent); color: #0a0a0b; font-weight: 700; font-size: calc(30 * var(--u)); letter-spacing: 0.04em; text-transform: uppercase; }
      .address { margin-top: calc(24 * var(--u)); font-size: calc(${tall ? 84 : 76} * var(--u)); font-weight: 700; line-height: 1.05; letter-spacing: -0.02em; }
      .city { margin-top: calc(12 * var(--u)); font-size: calc(38 * var(--u)); opacity: 0.85; }
      .price { margin-top: calc(28 * var(--u)); font-size: calc(64 * var(--u)); font-weight: 700; color: var(--accent); }
      .label { inset: auto auto calc(${tall ? 260 : 80} * var(--u)) calc(80 * var(--u)); padding: calc(14 * var(--u)) calc(28 * var(--u));
        border-radius: calc(16 * var(--u)); background: var(--shade); border-left: calc(8 * var(--u)) solid var(--accent);
        font-size: calc(40 * var(--u)); font-weight: 600; }
      .outro { display: flex; flex-direction: column; justify-content: center; padding: calc(100 * var(--u)); background: var(--shade); }
      .outro .price { margin-top: 0; font-size: calc(${tall ? 120 : 110} * var(--u)); }
      .outro .address { font-size: calc(54 * var(--u)); }
      .specs { display: flex; flex-wrap: wrap; gap: calc(18 * var(--u)); margin-top: calc(36 * var(--u)); }
      .spec { padding: calc(12 * var(--u)) calc(26 * var(--u)); border: calc(2 * var(--u)) solid rgba(255,255,255,0.35);
        border-radius: calc(12 * var(--u)); font-size: calc(36 * var(--u)); font-weight: 600; }
      .agent { margin-top: calc(56 * var(--u)); padding-top: calc(32 * var(--u)); border-top: calc(4 * var(--u)) solid var(--accent);
        font-size: calc(34 * var(--u)); line-height: 1.45; }
      .agent strong { font-size: calc(42 * var(--u)); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}" data-fps="${listing.fps}">
${photos}
      <div id="intro-scrim" class="clip scrim" data-start="0" data-duration="${round(listing.introSeconds)}" data-track-index="1"></div>
      <div id="intro" class="clip card" data-start="0" data-duration="${round(listing.introSeconds)}" data-track-index="2">
        ${listing.tagline === "" ? "" : `<span class="tag">${e(listing.tagline)}</span>`}
        <h1 class="address">${e(listing.address)}</h1>
        ${listing.city === "" ? "" : `<p class="city">${e(listing.city)}</p>`}
        <p class="price">${e(listing.price)}</p>
      </div>
${labels}
${musicName === undefined ? "" : `      <audio id="music" class="clip" src="assets/${musicName}" data-start="0" data-duration="${total}" data-track-index="4" data-volume="0.6"></audio>`}
      <div id="outro-photo" class="clip photo" data-layout-allow-overflow data-start="${round(outroStart)}" data-duration="${round(listing.outroSeconds)}" data-track-index="0">
        <img src="assets/outro-${photoNames[0]}" alt="" />
      </div>
      <div id="outro" class="clip outro" data-start="${round(outroStart)}" data-duration="${round(listing.outroSeconds)}" data-track-index="3">
        <p class="price">${e(listing.price)}</p>
        <h2 class="address">${e(listing.address)}${listing.city === "" ? "" : `, ${e(listing.city)}`}</h2>
        ${listing.specs.length === 0 ? "" : `<div class="specs">${listing.specs.map((spec) => `<span class="spec">${e(spec)}</span>`).join("")}</div>`}
        ${agentLines.length === 0 ? "" : `<div class="agent">${agentLines.map((line, index) => (index === 0 && listing.agent.name !== "" ? `<strong>${e(line)}</strong>` : e(line))).join("<br />")}</div>`}
      </div>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
${tweens}
      tl.from("#intro > *", { opacity: 0, y: 40, duration: 0.7, stagger: 0.15, ease: "power3.out" }, 0.3);
      tl.to("#intro", { opacity: 0, duration: 0.4, ease: "none" }, ${round(listing.introSeconds - 0.4)});
${labelTweens}
      // The closing card returns to the first photo (usually the front of the home).
      tl.fromTo("#outro-photo", { opacity: 0 }, { opacity: 1, duration: ${CROSSFADE}, ease: "none" }, ${round(outroStart)});
      tl.fromTo("#outro-photo img", { scale: 1.1 }, { scale: 1.02, duration: ${round(listing.outroSeconds)}, ease: "none" }, ${round(outroStart)});
      tl.fromTo("#outro", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "none" }, ${round(outroStart)});
      tl.from("#outro > *", { opacity: 0, y: 30, duration: 0.6, stagger: 0.12, ease: "power3.out" }, ${round(outroStart + 0.3)});
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
}

function parseArgs(argv) {
  const args = { listing: undefined, out: undefined, render: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") args.out = argv[++index];
    else if (arg === "--no-render") args.render = false;
    else if (arg === "--help" || arg === "-h") {
      console.log("usage: node scripts/make-slideshow.mjs <listing.json> [--out <dir>] [--no-render]");
      process.exit(0);
    } else if (args.listing === undefined) args.listing = arg;
    else fail(`unknown argument: ${arg}`);
  }
  if (args.listing === undefined) fail("give the path to listing.json (see examples/listing.json)");
  return args;
}

const args = parseArgs(process.argv.slice(2));
const listing = readListing(args.listing);
const project = resolve(args.out ?? join(dirname(resolve(args.listing)), "slideshow"));
mkdirSync(join(project, "assets"), { recursive: true });
const photoNames = listing.photos.map((photo, index) => {
  const name = `${String(index + 1).padStart(2, "0")}-${basename(photo.file).replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  copyFileSync(photo.file, join(project, "assets", name));
  return name;
});
// The closing card gets its own copy of the first photo: HyperFrames flags one file used by two clips.
copyFileSync(join(project, "assets", photoNames[0]), join(project, "assets", `outro-${photoNames[0]}`));
let musicName;
if (listing.music !== undefined) {
  musicName = `music${extname(listing.music).toLowerCase()}`;
  copyFileSync(listing.music, join(project, "assets", musicName));
}
writeFileSync(join(project, "index.html"), compositionHtml(listing, photoNames, musicName));
writeFileSync(join(project, "hyperframes.json"), `${JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { assets: "assets" } }, null, 2)}\n`);
const { total } = schedule(listing);
console.log(`make-slideshow: wrote ${join(project, "index.html")} (${listing.photos.length} photos, ${total} s, ${listing.format})`);

if (args.render) {
  const output = join(project, "renders", "slideshow.mp4");
  // The shared runner starts npx the way Windows needs too (lib.mjs); same pinned version, CRF and fps as before.
  const problem = runNpx(renderArgs(project, output, "real-estate-slideshow-maker"));
  if (problem !== undefined) fail(`render failed: ${problem}. Run "npx hyperframes@${HYPERFRAMES_VERSION} doctor" to check Chrome and FFmpeg`);
  console.log(`make-slideshow: video at ${output}`);
}
