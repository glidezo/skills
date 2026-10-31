/**
 * Shared helpers for Glidezo's HyperFrames skills: read and check a JSON spec,
 * write a one-file HyperFrames project, render it at a pinned version.
 *
 * The source lives in skills/_lib/; each skill links it as scripts/lib.mjs and
 * scripts/pack-skill.sh copies the real file into every zip, so a downloaded
 * skill runs on its own (Node 22+, no npm install).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** HyperFrames version these templates were tested with (2026-10-31). */
export const HYPERFRAMES_VERSION = "0.8.223";
/** GSAP build the HyperFrames 0.8 scaffold loads. */
export const GSAP_URL = "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js";
/** Frame rate of every render. */
export const FPS = 30;
/** x264 quality: sharp text at a size social apps accept (HyperFrames' default, 16, is about 2x larger). */
export const CRF = 20;

/** Output sizes by format name. */
export const FORMATS = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

export const IMAGE_TYPES = [".jpg", ".jpeg", ".png", ".webp", ".svg"];
export const VIDEO_TYPES = [".mp4", ".mov", ".webm", ".mkv"];
export const AUDIO_TYPES = [".mp3", ".wav", ".m4a"];

let toolName = "skill";

/**
 * Whether a script file is the one Node was started with (not imported by a test).
 *
 * @param metaUrl - the script's `import.meta.url`
 */
export function isMain(metaUrl) {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

/**
 * How to start `npx <args>` on this platform. On Windows `npx` is `npx.cmd`, a
 * batch file, which Node only starts through the shell; the shell then splits
 * the command line itself, so arguments are quoted there (paths often hold spaces).
 *
 * @param {string[]} args - arguments after `npx`
 * @param {string} [platform] - `process.platform`
 * @returns {{ command: string, args: string[], shell: boolean }} the command, its arguments and the `shell` option for `spawnSync`
 */
export function npxInvocation(args, platform = process.platform) {
  if (platform !== "win32") return { command: "npx", args: [...args], shell: false };
  // Windows paths can't contain double quotes, so wrapping is enough; `%` would still expand in cmd.exe.
  const quote = (arg) => (/^[\w@./:\\=-]+$/.test(arg) ? arg : `"${arg}"`);
  return { command: "npx", args: args.map(quote), shell: true };
}

/**
 * Runs `npx <args>` with the output shown to the user.
 *
 * @returns `undefined` on success, else why it failed
 */
export function runNpx(args, platform = process.platform) {
  const { command, args: argv, shell } = npxInvocation(args, platform);
  const result = spawnSync(command, argv, { stdio: "inherit", shell });
  if (result.error !== undefined) return `could not start npx (${result.error.message}); is Node.js 22+ installed and on the PATH?`;
  if (result.status !== 0) return `npx exited with ${result.status ?? `signal ${result.signal ?? "unknown"}`}`;
  return undefined;
}

/** Prints a message for the user (and the agent reading the output) and exits with code 1. */
export function fail(message) {
  console.error(`${toolName}: ${message}`);
  process.exit(1);
}

/** Prints a progress line. */
export function say(message) {
  console.log(`${toolName}: ${message}`);
}

/**
 * Reads the command line: `<spec.json> [--out <dir>] [--no-render]`.
 *
 * @returns the spec path, the project folder (default `<spec folder>/<defaultDir>`) and whether to render
 */
export function parseArgs(name, defaultDir, argv = process.argv.slice(2)) {
  toolName = name;
  const usage = `usage: node scripts/${name}.mjs <spec.json> [--out <dir>] [--no-render]`;
  const args = { spec: undefined, out: undefined, render: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") args.out = argv[++index];
    else if (arg === "--no-render") args.render = false;
    else if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    } else if (args.spec === undefined) args.spec = arg;
    else fail(`unknown argument: ${arg}\n${usage}`);
  }
  if (args.spec === undefined) fail(`give the path to a spec JSON file (see examples/)\n${usage}`);
  const spec = resolve(args.spec);
  return { spec, project: resolve(args.out ?? join(dirname(spec), defaultDir)), render: args.render };
}

/**
 * Reads a JSON object file.
 *
 * @returns the object and the folder that relative file paths in it are resolved against
 */
export function readSpec(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`can't read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail(`${path} must hold a JSON object`);
  return { raw, base: dirname(path) };
}

/** Checks one field of the spec; each function fails with a message naming the field. */
export const check = {
  text(value, field, { required = true, max = 80 } = {}) {
    if (value === undefined || value === null || value === "") {
      if (required) fail(`"${field}" is required`);
      return "";
    }
    if (typeof value !== "string" && typeof value !== "number") fail(`"${field}" must be text`);
    const result = String(value).trim();
    if (result.length > max) fail(`"${field}" is longer than ${max} characters`);
    return result;
  },
  number(value, field, [min, max], fallback) {
    if (value === undefined) return fallback;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      fail(`"${field}" must be a number from ${min} to ${max}`);
    }
    return value;
  },
  colour(value, field, fallback) {
    const result = value ?? fallback;
    if (typeof result !== "string" || !/^#[0-9a-fA-F]{6}$/.test(result)) fail(`"${field}" must be a hex colour like #8b7bff`);
    return result;
  },
  choice(value, field, options, fallback) {
    const result = value ?? fallback;
    if (!options.includes(result)) fail(`"${field}" must be one of ${options.join(", ")}`);
    return result;
  },
  /** A file path relative to the spec; `undefined` when optional and missing. */
  file(value, field, base, types, { required = true } = {}) {
    if (value === undefined || value === null || value === "") {
      if (required) fail(`"${field}" is required`);
      return undefined;
    }
    const path = resolve(base, check.text(value, field, { max: 500 }));
    if (!existsSync(path)) fail(`${field} not found: ${path}`);
    if (!types.includes(extname(path).toLowerCase())) fail(`${field} must be one of ${types.join(", ")}: ${path}`);
    return path;
  },
  list(value, field, [min, max]) {
    if (!Array.isArray(value) || value.length < min || value.length > max) fail(`"${field}" must be a list of ${min} to ${max} items`);
    return value;
  },
};

/** Escapes text for HTML element content and attribute values. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Rounds seconds to milliseconds, so timings in the HTML stay readable. */
export function round(seconds) {
  return Math.round(seconds * 1000) / 1000;
}

/** Creates the project folder with `assets/` and a `hyperframes.json`. */
export function prepareProject(project) {
  mkdirSync(join(project, "assets"), { recursive: true });
  writeFileSync(
    join(project, "hyperframes.json"),
    `${JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { assets: "assets" } }, null, 2)}\n`,
  );
}

/** Copies a file into the project's assets as `<name><ext>`; returns the path to use in the HTML. */
export function copyAsset(project, file, name) {
  const fileName = `${name}${extname(file).toLowerCase()}`;
  copyFileSync(file, join(project, "assets", fileName));
  return `assets/${fileName}`;
}

/**
 * A complete HyperFrames composition: one root (`main`), GSAP, and a paused
 * root timeline `tl` that `script` adds tweens to.
 */
export function compositionHtml({ width, height, duration, css, body, script }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <script src="${GSAP_URL}"></script>
    <style>
      :root { --u: ${Math.min(width, height) / 1080}px; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "Inter", "Helvetica Neue", Arial, sans-serif; }
      .clip { position: absolute; inset: 0; }
${css}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${round(duration)}" data-width="${width}" data-height="${height}" data-fps="${FPS}">
${body}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
${script}
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
}

/**
 * The `npx` arguments that render a project to `output` at the pinned version.
 *
 * @param {string} project
 * @param {string} output
 * @param {string} skill
 * @returns {string[]}
 */
export function renderArgs(project, output, skill) {
  return ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, "render", project, "--output", output, "--crf", String(CRF), "--fps", String(FPS), "--skill", skill];
}

/** Writes `index.html`, then renders it to `renders/<name>.mp4` unless `render` is false. */
export function writeAndRender(project, html, { render, skill, name, seconds }) {
  writeFileSync(join(project, "index.html"), html);
  say(`wrote ${join(project, "index.html")} (${round(seconds)} s)`);
  if (!render) return undefined;
  const output = join(project, "renders", `${name}.mp4`);
  const problem = runNpx(renderArgs(project, output, skill));
  if (problem !== undefined) fail(`render failed: ${problem}. Run "npx hyperframes@${HYPERFRAMES_VERSION} doctor" to check Chrome and FFmpeg`);
  say(`video at ${output}`);
  return output;
}

/**
 * Width and height of a PNG, JPEG or WebP file, read from its header (no image library).
 *
 * @param {Uint8Array} bytes - the file's first bytes (64 KB covers JPEG headers with large EXIF blocks)
 * @returns {{ width: number, height: number } | undefined} the size, or `undefined` for SVG or an unknown type
 */
export function imageSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at, length) => String.fromCharCode(...bytes.subarray(at, at + length));
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(1, 3) === "PNG") return { width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 ") return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      const triple = (at) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
      return { width: triple(24) + 1, height: triple(27) + 1 };
    }
    return undefined;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // Walk the JPEG segments to the first start-of-frame marker (SOF0-SOF15, except DHT, JPG and DAC).
    let at = 2;
    let orientation = 1;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return undefined;
      // Any number of 0xFF fill bytes may come before a marker.
      while (bytes[at + 1] === 0xff && at + 2 < bytes.length) at += 1;
      const marker = bytes[at + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const width = view.getUint16(at + 7);
        const height = view.getUint16(at + 5);
        // Browsers apply the EXIF orientation; 5 to 8 turn the picture a quarter, so it shows height x width.
        return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
      }
      const length = view.getUint16(at + 2);
      if (marker === 0xe1 && ascii(at + 4, 6) === "Exif\0\0") orientation = exifOrientation(bytes, at + 10, length - 8) ?? orientation;
      at += 2 + length;
    }
  }
  return undefined;
}

/**
 * The orientation tag (0x0112) of an EXIF block's first image directory.
 *
 * @param {Uint8Array} bytes
 * @param {number} start - offset of the TIFF header ("II" or "MM")
 * @param {number} length - bytes of TIFF data
 * @returns {number | undefined} 1 to 8, or `undefined` when there is none
 */
function exifOrientation(bytes, start, length) {
  const end = Math.min(bytes.length, start + length);
  if (start + 8 > end) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = bytes[start] === 0x49;
  const directory = start + view.getUint32(start + 4, little);
  if (directory + 2 > end) return undefined;
  const count = view.getUint16(directory, little);
  for (let index = 0; index < count; index += 1) {
    const entry = directory + 2 + index * 12;
    if (entry + 12 > end) return undefined;
    if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
  }
  return undefined;
}

/**
 * Size of an image file on disk. The whole file is read: a JPEG's metadata
 * (EXIF, XMP, colour profile) can push its size header far into the file.
 *
 * @param {string} path
 * @returns {{ width: number, height: number } | undefined} see {@link imageSize}
 */
export function imageFileSize(path) {
  const bytes = readFileSync(path);
  return imageSize(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

/**
 * Deletes a still's earlier outputs (`<name>.png` and `<name>.jpg`), so a run that
 * saves a PNG never leaves an older JPEG fallback beside it, or the other way round.
 *
 * @param {string} project
 * @param {string} name
 */
export function clearStillOutputs(project, name) {
  for (const ext of [".png", ".jpg"]) rmSync(join(project, "renders", `${name}${ext}`), { force: true });
}

/**
 * The `npx` arguments that save one still of a project as a PNG, at the pinned version.
 *
 * @param {string} project
 * @param {string} outDir - folder the still is written to, as `at-<seconds>s.png`
 * @param {number} at - time in seconds
 * @returns {string[]}
 */
export function snapshotArgs(project, outDir, at) {
  return ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, "snapshot", project, "--at", String(at), "--no-end", "--keep", "--output", outDir];
}

/**
 * What to do with a still after it is saved: keep it, or say why it can't be used.
 *
 * @param {{ width: number, height: number } | undefined} size - the PNG's size
 * @param {number} bytes - the PNG's file size
 * @param {{ width: number, height: number, maxBytes: number }} target
 * @returns {string | undefined} the problem, or `undefined` when the still is right
 */
export function stillProblem(size, bytes, target) {
  if (size === undefined) return "the snapshot is not a PNG";
  if (size.width !== target.width || size.height !== target.height) return `the image is ${size.width}x${size.height}, expected ${target.width}x${target.height}`;
  if (bytes > target.maxBytes) return `the image is ${bytes} bytes, over the ${target.maxBytes}-byte limit`;
  return undefined;
}

/**
 * Writes `index.html`, then saves its first frame to `renders/<name>.png` unless
 * `render` is false, and checks the size in pixels and bytes. A PNG over the byte
 * limit (a big photo background) is saved again as a JPEG, which every platform
 * that limits size also accepts.
 *
 * @returns the image path, or `undefined` when not rendered
 */
export function writeAndSnapshot(project, html, { render, name, width, height, maxBytes }) {
  writeFileSync(join(project, "index.html"), html);
  say(`wrote ${join(project, "index.html")}`);
  if (!render) return undefined;
  clearStillOutputs(project, name);
  const stills = join(project, ".stills");
  rmSync(stills, { recursive: true, force: true });
  const problem = runNpx(snapshotArgs(project, stills, 0));
  if (problem !== undefined) fail(`snapshot failed: ${problem}. Run "npx hyperframes@${HYPERFRAMES_VERSION} doctor" to check Chrome`);
  const still = readdirSync(stills).find((file) => file.endsWith(".png"));
  if (still === undefined) fail(`snapshot wrote no PNG to ${stills}`);
  mkdirSync(join(project, "renders"), { recursive: true });
  const png = join(project, "renders", `${name}.png`);
  copyFileSync(join(stills, still), png);
  rmSync(stills, { recursive: true, force: true });
  const target = { width, height, maxBytes };
  let output = png;
  let issue = stillProblem(imageFileSize(png), statSync(png).size, target);
  if (issue !== undefined && issue.includes("byte limit")) {
    output = join(project, "renders", `${name}.jpg`);
    say(`${issue}; saving a JPEG instead`);
    const jpeg = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", png, "-q:v", "3", output], { stdio: "inherit" });
    if (jpeg.status !== 0) fail("ffmpeg could not write the JPEG; is FFmpeg on the PATH?");
    rmSync(png);
    issue = stillProblem(imageFileSize(output), statSync(output).size, target);
  }
  if (issue !== undefined) fail(issue);
  say(`image at ${output} (${width}x${height}, ${statSync(output).size} bytes)`);
  return output;
}

/**
 * The largest font size (a step of 2 px) at which `text` fits a box, wrapping at
 * spaces, with an average glyph width of `charWidth` em. An estimate for the first
 * layout; {@link FIT_SCRIPT} then shrinks the element in the browser if real glyphs overflow.
 *
 * @param {string} text
 * @param {{ width: number, height: number, max: number, min: number, lineHeight?: number, charWidth?: number }} box - px
 * @returns {{ size: number, lines: number }} the size, and the lines it wraps to (`min` when nothing fits)
 */
export function fitText(text, { width, height, max, min, lineHeight = 1.08, charWidth = 0.56 }) {
  const words = text.split(/\s+/).filter(Boolean);
  const wrap = (size) => {
    const perLine = Math.max(1, Math.floor(width / (size * charWidth)));
    let lines = 1;
    let used = 0;
    for (const word of words) {
      if (word.length > perLine) return Infinity;
      const next = used === 0 ? word.length : used + 1 + word.length;
      if (next > perLine) {
        lines += 1;
        used = word.length;
      } else used = next;
    }
    return lines;
  };
  for (let size = max; size > min; size -= 2) {
    const lines = wrap(size);
    if (lines * size * lineHeight <= height) return { size, lines };
  }
  return { size: min, lines: wrap(min) };
}

/**
 * Browser script: every element with `data-fit="<min px>"` shrinks 2 px at a time
 * until its text fits its `max-height` (required) and its width.
 * Runs on load and again when the web fonts are ready, before any frame is captured.
 */
export const FIT_SCRIPT = `      const fitText = () => {
        for (const el of document.querySelectorAll("[data-fit]")) {
          el.style.fontSize = "";
          let size = parseFloat(getComputedStyle(el).fontSize);
          const min = Number(el.dataset.fit);
          // Against max-height, not clientHeight: glyphs overhang their line box by a few px in some fonts.
          const maxHeight = parseFloat(getComputedStyle(el).maxHeight);
          while ((el.scrollHeight > maxHeight + 1 || el.scrollWidth > el.clientWidth + 1) && size > min) {
            size -= 2;
            el.style.fontSize = size + "px";
          }
        }
      };
      fitText();
      // HyperFrames loads the fonts after the page script runs; fit again with the real glyphs.
      document.fonts.ready.then(fitText);`;
