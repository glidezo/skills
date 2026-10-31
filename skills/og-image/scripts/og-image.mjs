#!/usr/bin/env node
/**
 * OG image: a 1200x630 PNG link preview card (Open Graph / X / LinkedIn) with a
 * title that sizes itself to fit, an optional kicker, description, logo, site
 * name and a picture on the right.
 *
 *   node scripts/og-image.mjs <og.json> [--out <dir>] [--no-render]
 */
import { FIT_SCRIPT, IMAGE_TYPES, check, compositionHtml, copyAsset, escapeHtml, fitText, isMain, parseArgs, prepareProject, readSpec, writeAndSnapshot } from "./lib.mjs";

/**
 * 1200x630 is the 1.91:1 size Facebook recommends (min 600x315 for large previews, max 8 MB) and LinkedIn's
 * minimum (1200x627, max 5 MB). LinkedIn's 5 MB is the strictest sourced limit (checked 2026-10-31), counted as
 * 5,000,000 bytes: under that is safe whether the platform means decimal or binary megabytes.
 */
export const OG = { width: 1200, height: 630, maxBytes: 5_000_000 };
/** Length limits: a title past ~110 characters is cut in most previews anyway. */
export const LIMITS = { title: 110, kicker: 40, description: 140, site: 40 };
/** Padding, picture column and title box in px; the title box is narrower when a picture takes the right side. */
export const LAYOUT = { pad: 72, titleHeight: 300, picture: 440, gap: 56, titleMax: 76, titleMin: 40 };
/**
 * Height in px of the other rows in the text column, matching the CSS: kicker (26 px at
 * line-height 1.2 + 22 margin), description (22 margin + 74 max-height), footer (28 padding + 52 logo).
 */
export const ROWS = { kicker: 56, description: 96, footer: 80 };

/**
 * Height in px the title may take: the column (card minus padding) minus the rows
 * that are shown, at most `LAYOUT.titleHeight`.
 *
 * @param {{ kicker: boolean, description: boolean, footer: boolean }} shown
 * @returns {number}
 */
export function titleBox(shown) {
  const column = OG.height - 2 * LAYOUT.pad;
  const others = (shown.kicker ? ROWS.kicker : 0) + (shown.description ? ROWS.description : 0) + (shown.footer ? ROWS.footer : 0);
  return Math.min(LAYOUT.titleHeight, column - others);
}

/**
 * The title's starting font size for its box.
 *
 * @param {string} title
 * @param {boolean} withPicture - whether a picture takes the right side
 * @param {number} [height] - the title box height ({@link titleBox})
 * @returns {number} px
 */
export function titleSize(title, withPicture, height = LAYOUT.titleHeight) {
  const width = OG.width - 2 * LAYOUT.pad - (withPicture ? LAYOUT.picture + LAYOUT.gap : 0);
  return fitText(title, { width, height, max: LAYOUT.titleMax, min: LAYOUT.titleMin }).size;
}

function main() {
  const args = parseArgs("og-image", "og-image");
  const { raw, base } = readSpec(args.spec);

  const title = check.text(raw.title, "title", { max: LIMITS.title });
  const kicker = check.text(raw.kicker, "kicker", { required: false, max: LIMITS.kicker });
  const description = check.text(raw.description, "description", { required: false, max: LIMITS.description });
  const site = check.text(raw.site, "site", { required: false, max: LIMITS.site });
  const logo = check.file(raw.logo, "logo", base, IMAGE_TYPES, { required: false });
  const picture = check.file(raw.image, "image", base, IMAGE_TYPES, { required: false });
  const accent = check.colour(raw.accent, "accent", "#8b7bff");
  const background = check.colour(raw.background, "background", "#0a0a0b");
  const ink = check.colour(raw.ink, "ink", "#f4f4f5");
  const { width, height } = OG;

  prepareProject(args.project);
  const logoSrc = logo === undefined ? undefined : copyAsset(args.project, logo, "logo");
  const pictureSrc = picture === undefined ? undefined : copyAsset(args.project, picture, "picture");
  const withPicture = pictureSrc !== undefined;
  const titleHeight = titleBox({ kicker: kicker !== "", description: description !== "", footer: logoSrc !== undefined || site !== "" });

  const body = `      <div id="card" class="clip" data-start="0" data-duration="1" data-track-index="0">
        <div id="copy">
          ${kicker === "" ? "" : `<p id="kicker">${escapeHtml(kicker)}</p>`}
          <h1 id="title" data-fit="${LAYOUT.titleMin}">${escapeHtml(title)}</h1>
          ${description === "" ? "" : `<p id="description" data-fit="20">${escapeHtml(description)}</p>`}
          <div id="footer">${logoSrc === undefined ? "" : `<img id="logo" src="${logoSrc}" alt="" />`}${site === "" ? "" : `<span id="site">${escapeHtml(site)}</span>`}</div>
        </div>
        ${withPicture ? `<div id="picture"><img src="${pictureSrc}" alt="" /></div>` : ""}
      </div>`;

  const css = `      #root { background: ${background}; color: ${ink}; }
      #card { display: flex; gap: ${LAYOUT.gap}px; padding: ${LAYOUT.pad}px; align-items: stretch;
        background: radial-gradient(circle at 0% 0%, ${accent}40 0%, ${accent}00 45%), radial-gradient(circle at 100% 100%, ${accent}22 0%, ${accent}00 40%); }
      #card::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: ${accent}; }
      #copy { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
      /* Flex items would shrink to the box and hide the overflow the fit script looks for. */
      #copy > * { flex-shrink: 0; }
      #kicker { font-size: 26px; line-height: 1.2; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${accent}; margin-bottom: 22px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #title { font-size: ${titleSize(title, withPicture, titleHeight)}px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.08;
        max-height: ${titleHeight}px; overflow-wrap: anywhere; }
      #description { margin-top: 22px; font-size: 28px; line-height: 1.3; opacity: 0.78; max-height: 74px; }
      #footer { margin-top: auto; padding-top: 28px; display: flex; align-items: center; gap: 18px; }
      #footer:empty { display: none; }
      #logo { height: 52px; width: auto; max-width: 220px; object-fit: contain; }
      #site { font-size: 28px; line-height: 1.2; font-weight: 600; opacity: 0.9; }
      #picture { flex: 0 0 ${LAYOUT.picture}px; border-radius: 24px; overflow: hidden; border: 2px solid ${accent}55; box-shadow: 0 30px 80px ${accent}33; }
      #picture img { width: 100%; height: 100%; object-fit: cover; object-position: left top; display: block; }`;

  writeAndSnapshot(args.project, compositionHtml({ width, height, duration: 1, css, body, script: FIT_SCRIPT }), {
    render: args.render,
    name: "og-image",
    ...OG,
  });
}

if (isMain(import.meta.url)) main();
