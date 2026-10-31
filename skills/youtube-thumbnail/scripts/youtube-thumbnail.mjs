#!/usr/bin/env node
/**
 * YouTube thumbnail: a 1280x720 PNG with a big headline (one phrase in the
 * accent colour), an optional badge, a background picture and a subject cut-out
 * with an outline and glow. Text stays clear of the bottom-right corner, where
 * YouTube shows the video length.
 *
 *   node scripts/youtube-thumbnail.mjs <thumbnail.json> [--out <dir>] [--no-render]
 */
import { FIT_SCRIPT, IMAGE_TYPES, check, compositionHtml, copyAsset, escapeHtml, fail, fitText, isMain, parseArgs, prepareProject, readSpec, writeAndSnapshot } from "./lib.mjs";

/**
 * 1280x720 (16:9), YouTube's long-standing custom thumbnail size; the help page now
 * recommends up to 3840x2160 and a minimum width of 640. Upload limit: 2 MB from the
 * mobile app, 50 MB on desktop, so 2 MB is the one that always works (checked 2026-10-31).
 * Counted as 2,000,000 bytes: the platform's "MB" may be decimal, and under that is safe either way.
 */
export const THUMB = { width: 1280, height: 720, maxBytes: 2_000_000 };
/** Thumbnails are read at phone size: a few big words. */
export const LIMITS = { headline: 40, badge: 14 };
/**
 * The text column in px: padding, the bottom strip kept clear for YouTube's time stamp,
 * the column width beside a subject, the height the badge row takes (44 px type at
 * line-height 1.2, 10 px padding each side, 26 px margin, a little for the tilt), and
 * the headline's size range.
 */
export const LAYOUT = { pad: 64, bottomStrip: 104, textWidth: 640, badgeBlock: 112, max: 150, min: 64 };

/**
 * Height in px the headline may take: the text column minus the badge row.
 *
 * @param {boolean} hasBadge
 * @returns {number}
 */
export function headlineBox(hasBadge) {
  return THUMB.height - LAYOUT.pad - LAYOUT.bottomStrip - (hasBadge ? LAYOUT.badgeBlock : 0);
}

/**
 * The headline's starting font size.
 *
 * @param {string} headline
 * @param {boolean} withSubject - whether a subject takes the other side (the text box is narrower)
 * @param {boolean} hasBadge - whether a badge row sits above it
 * @returns {number} px
 */
export function headlineSize(headline, withSubject, hasBadge) {
  const width = withSubject ? LAYOUT.textWidth : THUMB.width - 2 * LAYOUT.pad;
  return fitText(headline, { width, height: headlineBox(hasBadge), max: LAYOUT.max, min: LAYOUT.min, lineHeight: 1, charWidth: 0.6 }).size;
}

/**
 * Splits the headline around the highlighted phrase (first match, any case).
 *
 * @param {string} headline
 * @param {string} highlight - empty for none
 * @returns {[string, string, string] | undefined} before, phrase, after; `undefined` when the phrase isn't in the headline
 */
export function splitHighlight(headline, highlight) {
  if (highlight === "") return [headline, "", ""];
  const at = headline.toLowerCase().indexOf(highlight.toLowerCase());
  if (at === -1) return undefined;
  return [headline.slice(0, at), headline.slice(at, at + highlight.length), headline.slice(at + highlight.length)];
}

function main() {
  const args = parseArgs("youtube-thumbnail", "thumbnail");
  const { raw, base } = readSpec(args.spec);

  const headline = check.text(raw.headline, "headline", { max: LIMITS.headline });
  const highlight = check.text(raw.highlight, "highlight", { required: false, max: LIMITS.headline });
  const badge = check.text(raw.badge, "badge", { required: false, max: LIMITS.badge });
  const picture = check.file(raw.image, "image", base, IMAGE_TYPES, { required: false });
  const subject = check.file(raw.subject, "subject", base, IMAGE_TYPES, { required: false });
  // A cut-out of a person stands on the bottom edge; a logo or object floats in the middle.
  const anchor = check.choice(raw.subjectAnchor, "subjectAnchor", ["bottom", "center"], "bottom");
  const blur = check.number(raw.blur, "blur", [0, 30], 0);
  const side = check.choice(raw.textSide, "textSide", ["left", "right"], "left");
  const accent = check.colour(raw.accent, "accent", "#8b7bff");
  const accentInk = check.colour(raw.accentInk, "accentInk", "#0a0a0b");
  const background = check.colour(raw.background, "background", "#0a0a0b");
  const ink = check.colour(raw.ink, "ink", "#ffffff");
  const parts = splitHighlight(headline, highlight);
  if (parts === undefined) fail(`"highlight" must be a phrase from the headline: "${headline}"`);
  const [before, phrase, after] = parts;
  const { width, height } = THUMB;

  prepareProject(args.project);
  const pictureSrc = picture === undefined ? undefined : copyAsset(args.project, picture, "background");
  const subjectSrc = subject === undefined ? undefined : copyAsset(args.project, subject, "subject");
  const other = side === "left" ? "right" : "left";

  const body = `      <div id="thumb" class="clip" data-start="0" data-duration="1" data-track-index="0">
        ${pictureSrc === undefined ? "" : `<img id="picture" src="${pictureSrc}" alt="" />`}
        <div id="shade"></div>
        ${subjectSrc === undefined ? "" : `<img id="subject" src="${subjectSrc}" alt="" />`}
        <div id="text">
          ${badge === "" ? "" : `<span id="badge">${escapeHtml(badge)}</span>`}
          <h1 id="headline" data-fit="${LAYOUT.min}">${escapeHtml(before)}${phrase === "" ? "" : `<mark>${escapeHtml(phrase)}</mark>`}${escapeHtml(after)}</h1>
        </div>
      </div>`;

  const css = `      #root { background: ${background}; color: ${ink}; }
      #picture { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(1.2) contrast(1.05)${blur > 0 ? ` blur(${blur}px)` : ""}; transform: scale(${blur > 0 ? 1.06 : 1}); }
      /* Darker on the text side, so white text reads on any picture. */
      #shade { position: absolute; inset: 0; background: linear-gradient(to ${other}, ${background}f2 0%, ${background}cc 45%, ${background}33 100%),
        radial-gradient(circle at ${other === "right" ? "78%" : "22%"} 50%, ${accent}66 0%, ${accent}00 45%); }
      #subject { position: absolute; ${anchor === "bottom" ? "bottom: 0; height: 96%;" : "top: 12%; height: 76%;"} ${other}: 40px; width: 42%; object-fit: contain; object-position: ${anchor === "bottom" ? "bottom" : "center"};
        filter: drop-shadow(0 0 0 #fff) drop-shadow(5px 0 0 #fff) drop-shadow(-5px 0 0 #fff) drop-shadow(0 5px 0 #fff) drop-shadow(0 -5px 0 #fff) drop-shadow(0 0 40px ${accent}); }
      #text { position: absolute; ${side}: ${LAYOUT.pad}px; top: ${LAYOUT.pad}px; bottom: ${LAYOUT.bottomStrip}px; width: ${subjectSrc === undefined ? width - 2 * LAYOUT.pad : LAYOUT.textWidth}px;
        display: flex; flex-direction: column; justify-content: center; align-items: flex-start; }
      #text > * { flex-shrink: 0; }
      #badge { background: ${accent}; color: ${accentInk}; font-size: 44px; line-height: 1.2; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase;
        padding: 10px 26px; border-radius: 14px; transform: rotate(-3deg); margin-bottom: 26px; box-shadow: 0 10px 30px #0008; }
      #headline { font-size: ${headlineSize(headline, subjectSrc !== undefined, badge !== "")}px; font-weight: 900; line-height: 1; letter-spacing: -0.03em; max-height: ${headlineBox(badge !== "")}px;
        width: 100%; overflow-wrap: anywhere; text-shadow: 0 6px 0 #000a, 0 0 40px #000c; -webkit-text-stroke: 2px #0006; paint-order: stroke fill; }
      #headline mark { background: none; color: ${accent}; }`;

  writeAndSnapshot(args.project, compositionHtml({ width, height, duration: 1, css, body, script: FIT_SCRIPT }), {
    render: args.render,
    name: "thumbnail",
    ...THUMB,
  });
}

if (isMain(import.meta.url)) main();
