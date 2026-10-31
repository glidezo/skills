#!/usr/bin/env node
/**
 * Device mockup promo: app or website screenshots inside a phone or laptop
 * drawn in CSS. The device rises in, each screen slides in (and scrolls when the
 * screenshot is taller than the screen) with its caption, then a call to action.
 *
 *   node scripts/device-mockup-promo.mjs <promo.json> [--out <dir>] [--no-render]
 */
import { FIT_SCRIPT, FORMATS, IMAGE_TYPES, check, compositionHtml, copyAsset, escapeHtml, imageFileSize, isMain, parseArgs, prepareProject, readSpec, round, say, writeAndRender } from "./lib.mjs";

/** Seconds: the intro before the first screen, each screen's slide-in, and the closing card. */
export const TIMING = { intro: 1.2, slide: 0.7, outro: 2.6 };
/** Screen width / height of each device (a 19.5:9 phone, a 16:10 laptop). */
export const SCREEN_ASPECT = { phone: 9 / 19.5, laptop: 16 / 10 };
/** The scroll stops this many seconds before the next screen, so a screen rests before it changes. */
export const SCROLL_REST = 0.5;
/** A long page scrolls at most this many screen heights, so it doesn't race past. */
export const MAX_SCROLL_SCREENS = 1.5;

/** Seconds: when the device starts rising, and how long the rise takes. */
export const RISE = { start: 0.15, length: 1.1 };

/**
 * The device's turn: where it rises from, the pose the rise ends in (which is
 * where the slow turn starts, so there is no jump between them), and where the turn ends.
 *
 * @param {boolean} wide - landscape frame (the device sits to the side and turns more)
 * @returns {{ from: { rotateX: number, rotateY: number }, rest: { rotateX: number, rotateY: number }, to: { rotateX: number, rotateY: number } }}
 */
export function devicePoses(wide) {
  return {
    from: { rotateX: 32, rotateY: wide ? -18 : 0 },
    rest: { rotateX: 4, rotateY: wide ? -8 : -4 },
    to: { rotateX: 0, rotateY: wide ? 6 : 4 },
  };
}

/**
 * When each screen starts, and the clip length.
 *
 * @param {number} count - screens
 * @param {number} perScreen - seconds per screen
 * @returns {{ starts: number[], outro: number, total: number }}
 */
export function screenPlan(count, perScreen) {
  const starts = Array.from({ length: count }, (_, index) => round(TIMING.intro + index * perScreen));
  const outro = round(TIMING.intro + count * perScreen);
  return { starts, outro, total: round(outro + TIMING.outro) };
}

/**
 * How far a screenshot scrolls inside the screen, as a share of its own height
 * (GSAP `yPercent`). A screenshot as wide as the screen and no taller doesn't scroll;
 * a long one stops after {@link MAX_SCROLL_SCREENS} screens.
 *
 * @param {{ width: number, height: number } | undefined} image - pixel size; `undefined` (SVG) never scrolls
 * @param {number} screenAspect - screen width / height
 * @returns {number} 0 to under 100
 */
export function scrollPercent(image, screenAspect) {
  if (image === undefined || image.width <= 0 || image.height <= 0) return 0;
  // Shown at the screen's width, the image is (height / width) * screenWidth tall; the screen is screenWidth / aspect.
  const imageHeight = image.height / image.width;
  const screenHeight = 1 / screenAspect;
  const travel = Math.min(imageHeight - screenHeight, MAX_SCROLL_SCREENS * screenHeight);
  return travel <= 0 ? 0 : round((travel / imageHeight) * 100);
}

/**
 * The device's size in px for a frame: as large as the layout allows, at the screen's aspect.
 *
 * @param {"phone" | "laptop"} device
 * @param {number} width - frame width
 * @param {number} height - frame height
 * @returns {{ width: number, height: number }} the screen size (the body adds a bezel)
 */
export function screenSize(device, width, height) {
  const aspect = SCREEN_ASPECT[device];
  const wide = width > height;
  // Landscape: the device takes the right ~55% of the frame; portrait/square: the lower part, under the headline.
  const box = wide ? { width: width * 0.5, height: height * 0.84 } : { width: width * (device === "laptop" ? 0.9 : 0.82), height: height * (height > width ? 0.56 : 0.6) };
  const screenWidth = Math.min(box.width, box.height * aspect);
  return { width: Math.round(screenWidth), height: Math.round(screenWidth / aspect) };
}

/** A screenshot's pixel size, with a warning when a raster file's header can't be read (it then won't scroll). */
function readSize(file) {
  const size = imageFileSize(file);
  if (size === undefined && !file.toLowerCase().endsWith(".svg")) say(`can't read the size of ${file}; it won't scroll`);
  return size;
}

function main() {
  const args = parseArgs("device-mockup-promo", "device-promo");
  const { raw, base } = readSpec(args.spec);

  const device = check.choice(raw.device, "device", ["phone", "laptop"], "phone");
  const headline = check.text(raw.headline, "headline", { max: 60 });
  const subline = check.text(raw.subline, "subline", { required: false, max: 90 });
  const cta = check.text(raw.cta, "cta", { required: false, max: 30 });
  const url = check.text(raw.url, "url", { required: false, max: 40 });
  const logo = check.file(raw.logo, "logo", base, IMAGE_TYPES, { required: false });
  const format = check.choice(raw.format, "format", Object.keys(FORMATS), "landscape");
  const accent = check.colour(raw.accent, "accent", "#8b7bff");
  const accentInk = check.colour(raw.accentInk, "accentInk", "#0a0a0b");
  const background = check.colour(raw.background, "background", "#0a0a0b");
  const ink = check.colour(raw.ink, "ink", "#f4f4f5");
  const perScreen = check.number(raw.secondsPerScreen, "secondsPerScreen", [2.5, 8], 3.5);
  const screens = check.list(raw.screens, "screens", [1, 5]).map((screen, index) => ({
    image: check.file(screen?.image, `screens[${index}].image`, base, IMAGE_TYPES),
    caption: check.text(screen?.caption, `screens[${index}].caption`, { required: false, max: 50 }),
  }));

  const { width, height } = FORMATS[format];
  const wide = width > height;
  const tall = height > width;
  const screen = screenSize(device, width, height);
  const { starts, outro, total } = screenPlan(screens.length, perScreen);
  const all = round(total);

  prepareProject(args.project);
  const logoSrc = logo === undefined ? undefined : copyAsset(args.project, logo, "logo");
  const shots = screens.map((item, index) => ({
    ...item,
    src: copyAsset(args.project, item.image, `screen-${index + 1}`),
    scroll: scrollPercent(readSize(item.image), SCREEN_ASPECT[device]),
  }));

  const bezel = Math.round(screen.width * (device === "phone" ? 0.045 : 0.025));
  const deviceHtml =
    device === "phone"
      ? `<div id="device" class="phone"><div class="screen">${shots.map((shot, index) => `<img id="s${index}" class="shot" src="${shot.src}" alt="" data-layout-allow-overflow />`).join("")}<span class="island"></span></div></div>`
      : `<div id="device" class="laptop"><div class="lid"><div class="screen">${shots.map((shot, index) => `<img id="s${index}" class="shot" src="${shot.src}" alt="" data-layout-allow-overflow />`).join("")}</div></div><div class="base"></div></div>`;

  const body = `      <div id="bg" class="clip" data-start="0" data-duration="${all}" data-track-index="0"></div>
      <div id="stage" class="clip" data-start="0" data-duration="${all}" data-track-index="1">
        <div id="copy">
          ${logoSrc === undefined ? "" : `<img id="logo" src="${logoSrc}" alt="" />`}
          <h1 id="headline" data-fit="${Math.round((wide ? 48 : 52) * (Math.min(width, height) / 1080))}">${headline
            .split(/\s+/)
            .map((word) => `<span class="mask"><span class="w">${escapeHtml(word)}</span></span>`)
            .join(" ")}</h1>
          ${subline === "" ? "" : `<p id="subline">${escapeHtml(subline)}</p>`}
          <div id="captions">${shots.map((shot, index) => (shot.caption === "" ? "" : `<p id="c${index}" class="caption"><b>${String(index + 1).padStart(2, "0")}</b> ${escapeHtml(shot.caption)}</p>`)).join("")}</div>
          <div id="end">${cta === "" ? "" : `<span id="cta">${escapeHtml(cta)}</span>`}${url === "" ? "" : `<span id="url">${escapeHtml(url)}</span>`}</div>
        </div>
        <div id="holder">${deviceHtml}</div>
      </div>`;

  const s = (value) => `calc(${value} * var(--u))`;
  const css = `      #root { background: ${background}; color: ${ink}; }
      #bg { background: radial-gradient(circle at ${wide ? "72% 50%" : "50% 70%"}, ${accent}45 0%, ${accent}00 48%), radial-gradient(circle at 10% 0%, ${accent}22 0%, ${accent}00 40%); }
      #stage { display: flex; flex-direction: ${wide ? "row" : "column"}; align-items: center; justify-content: center; gap: ${s(wide ? 90 : 60)}; padding: ${s(wide ? 90 : 100)} ${s(wide ? 110 : 70)}; }
      #copy { ${wide ? `flex: 1; min-width: 0;` : `width: 100%; text-align: center;`} display: flex; flex-direction: column; ${wide ? "" : "align-items: center;"} }
      #copy > * { flex-shrink: 0; }
      #logo { height: ${s(64)}; width: auto; max-width: ${s(260)}; object-fit: contain; margin-bottom: ${s(36)}; }
      #headline { font-size: ${s(tall ? 92 : wide ? 88 : 76)}; font-weight: 800; letter-spacing: -0.035em; line-height: 1.04; max-height: ${s(tall ? 300 : wide ? 380 : 170)}; }
      .mask { display: inline-block; overflow: hidden; padding-bottom: 0.08em; vertical-align: top; }
      .w { display: inline-block; }
      #subline { margin-top: ${s(22)}; font-size: ${s(tall ? 40 : 36)}; line-height: 1.3; opacity: 0.72; max-width: ${s(820)}; }
      #captions { position: relative; height: ${s(wide ? 120 : 90)}; margin-top: ${s(wide ? 46 : 30)}; width: 100%; }
      .caption { position: absolute; left: 0; right: 0; top: 0; font-size: ${s(tall ? 42 : 38)}; font-weight: 600; line-height: 1.25; opacity: 0; }
      .caption b { color: ${accent}; font-weight: 800; margin-right: ${s(10)}; }
      #end { display: flex; ${wide ? "" : "justify-content: center;"} align-items: center; gap: ${s(26)}; margin-top: ${s(8)}; min-height: ${s(80)}; flex-wrap: wrap; }
      #cta { background: ${accent}; color: ${accentInk}; font-weight: 700; font-size: ${s(36)}; padding: ${s(18)} ${s(38)}; border-radius: 999px; }
      #url { font-size: ${s(34)}; font-weight: 600; opacity: 0.85; }
      #holder { ${wide ? "flex: 0 0 auto;" : ""} perspective: ${s(2400)}; display: flex; justify-content: center; }
      #device { position: relative; transform-style: preserve-3d; }
      .screen { position: relative; width: ${screen.width}px; height: ${screen.height}px; overflow: hidden; background: #000; }
      .shot { position: absolute; left: 0; top: 0; width: 100%; height: auto; min-height: 100%; object-fit: cover; object-position: top center; }
      .phone { padding: ${bezel}px; border-radius: ${Math.round(screen.width * 0.16)}px; background: linear-gradient(145deg, #2c2c33, #121215); box-shadow: 0 0 0 2px #3a3a42, 0 ${s(60)} ${s(140)} ${accent}40; }
      .phone .screen { border-radius: ${Math.round(screen.width * 0.12)}px; }
      .island { position: absolute; top: ${Math.round(screen.width * 0.035)}px; left: 50%; width: 30%; height: ${Math.round(screen.width * 0.085)}px; transform: translateX(-50%); background: #000; border-radius: 999px; }
      .laptop .lid { padding: ${bezel}px ${bezel}px ${Math.round(bezel * 1.6)}px; border-radius: ${Math.round(bezel * 1.4)}px ${Math.round(bezel * 1.4)}px 0 0; background: linear-gradient(180deg, #2c2c33, #17171b); box-shadow: 0 0 0 2px #3a3a42, 0 ${s(60)} ${s(140)} ${accent}40; }
      .laptop .screen { border-radius: ${Math.round(bezel * 0.4)}px; }
      .laptop .base { position: relative; left: -6%; width: 112%; height: ${Math.round(bezel * 1.4)}px; background: linear-gradient(180deg, #3a3a42, #1b1b1f); border-radius: 0 0 ${bezel * 2}px ${bezel * 2}px; }`;

  const poses = devicePoses(wide);
  const pose = ({ rotateX, rotateY }) => `rotateX: ${rotateX}, rotateY: ${rotateY}`;
  const turnStart = round(RISE.start + RISE.length);
  const script = [
    FIT_SCRIPT,
    `      tl.from("#logo", { opacity: 0, y: 20, duration: 0.5, ease: "power2.out" }, 0.05);`,
    `      tl.from("#headline .w", { yPercent: 110, duration: 0.7, stagger: ${round(Math.min(0.08, 0.6 / Math.max(1, headline.split(/\s+/).length)))}, ease: "power3.out" }, 0.1);`,
    subline === "" ? "" : `      tl.from("#subline", { opacity: 0, y: 20, duration: 0.6, ease: "power2.out" }, 0.5);`,
    `      tl.fromTo("#device", { y: ${Math.round(height * 0.6)}, ${pose(poses.from)}, opacity: 0 }, { y: 0, ${pose(poses.rest)}, opacity: 1, duration: ${RISE.length}, ease: "power3.out" }, ${RISE.start});`,
    // A slow turn while the screens play, so the device never sits dead still.
    `      tl.fromTo("#device", { ${pose(poses.rest)} }, { ${pose(poses.to)}, duration: ${round(outro - turnStart)}, ease: "sine.inOut", immediateRender: false }, ${turnStart});`,
    ...shots.map((shot, index) => {
      const at = starts[index];
      const lines = [];
      if (index > 0) lines.push(`      tl.from("#s${index}", { xPercent: 100, duration: ${TIMING.slide}, ease: "power3.inOut" }, ${at});`);
      if (index > 0) lines.push(`      tl.to("#s${index - 1}", { xPercent: -30, opacity: 0.4, duration: ${TIMING.slide}, ease: "power3.inOut" }, ${at});`);
      if (shot.scroll > 0) lines.push(`      tl.to("#s${index}", { yPercent: -${shot.scroll}, duration: ${round(Math.max(0.5, perScreen - TIMING.slide - SCROLL_REST - 0.3))}, ease: "power1.inOut" }, ${round(at + TIMING.slide + 0.3)});`);
      if (shot.caption !== "") {
        lines.push(`      tl.fromTo("#c${index}", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", immediateRender: false }, ${round(at + 0.15)});`);
        lines.push(`      tl.to("#c${index}", { opacity: 0, y: -16, duration: 0.35, ease: "power2.in" }, ${round(at + perScreen - 0.35)});`);
      }
      return lines.join("\n");
    }),
    `      tl.from("#end > *", { opacity: 0, y: 24, scale: 0.9, duration: 0.6, stagger: 0.12, ease: "back.out(1.8)" }, ${round(outro + 0.1)});`,
    `      tl.to("#device", { scale: 0.94, duration: ${TIMING.outro}, ease: "power2.out" }, ${outro});`,
  ]
    .filter(Boolean)
    .join("\n");

  writeAndRender(args.project, compositionHtml({ width, height, duration: total, css, body, script }), {
    render: args.render,
    skill: "device-mockup-promo",
    name: "device-promo",
    seconds: total,
  });
}

if (isMain(import.meta.url)) main();
