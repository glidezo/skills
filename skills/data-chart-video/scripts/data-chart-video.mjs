#!/usr/bin/env node
/**
 * Data-chart video: a title, then an animated bar or line chart from a list of
 * labels and values. Gridlines come in, bars grow (or the line draws) one by one
 * with their values counting up, a highlighted point lights up, and it holds.
 *
 *   node scripts/data-chart-video.mjs <chart.json> [--out <dir>] [--no-render]
 */
import { FIT_SCRIPT, FORMATS, check, fail, compositionHtml, escapeHtml, isMain, parseArgs, prepareProject, readSpec, round, writeAndRender } from "./lib.mjs";

/** Seconds: subtitle in (the title is on screen from frame 0, the thumbnail social players show), gridlines in, first point, each bar's grow, and the hold at the end. */
export const TIMING = { title: 0.1, grid: 0.6, first: 1.1, grow: 0.9, stagger: 0.35, hold: 1.5 };
/** At most this many points; more don't fit a label each at 1080 px. */
export const MAX_POINTS = 12;
/** Bars turn horizontal when the labels would be squeezed: this many characters across all labels (landscape/square). */
export const HORIZONTAL_LABEL_CHARS = 60;

/**
 * Formats a number for a label: compact for big numbers (12.4K, 3.1M, 2.5B, 7T),
 * two significant digits for tiny ones (0.00042, 1.2e-7), and up to `decimals`
 * otherwise. Self-contained: its source is copied into the composition for the count-up.
 *
 * @param {number} value
 * @param {{ prefix?: string, suffix?: string, decimals?: number }} [options] - `decimals` fixes the decimals (no compacting)
 * @returns {string}
 */
export function formatValue(value, options = {}) {
  const { prefix = "", suffix = "", decimals } = options;
  const abs = Math.abs(value);
  let digits;
  if (decimals !== undefined) digits = abs.toFixed(decimals);
  else if (abs === 0) digits = "0";
  else if (abs >= 1e15 || abs < 1e-4) digits = abs.toExponential(1).replace(".0e", "e").replace("e+", "e");
  else if (abs >= 1e4) digits = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(abs);
  else if (abs < 0.01) digits = String(Number(abs.toPrecision(2)));
  else digits = new Intl.NumberFormat("en-US", { maximumFractionDigits: abs < 10 ? 2 : abs < 1000 ? 1 : 0 }).format(abs);
  return `${value < 0 ? "−" : ""}${prefix}${digits}${suffix}`;
}

/**
 * A "nice" axis for the values: rounded ends and 3 to 7 evenly spaced ticks.
 * Bars always include zero (a bar's length must mean something); a line doesn't have to.
 *
 * @param {number[]} values
 * @param {boolean} includeZero
 * @returns {{ min: number, max: number, ticks: number[] }}
 */
export function niceScale(values, includeZero) {
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (includeZero) {
    low = Math.min(0, low);
    high = Math.max(0, high);
  }
  if (low === high) {
    // One value (or all zeros): give the axis some room around it.
    const pad = low === 0 ? 1 : Math.abs(low) * 0.5;
    low = includeZero && low >= 0 ? 0 : low - pad;
    high += pad;
  }
  const rough = (high - low) / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? 10 * power;
  // The epsilon absorbs float error (0.30000000000000004 / 0.1) without pushing a 0 below zero.
  const first = Math.floor(low / step + 1e-9);
  const count = Math.ceil(high / step - 1e-9) - first;
  // 12 significant digits drop float drift (0.30000000000000004) at any magnitude, 1e-90 or 1e90.
  const ticks = Array.from({ length: count + 1 }, (_, index) => Number(((first + index) * step).toPrecision(12)));
  const min = ticks[0] ?? low;
  const max = ticks[ticks.length - 1] ?? high;
  return { min, max, ticks };
}

/**
 * When each point comes in. A long list in a short clip gets a tighter stagger, so
 * the last point is in `hold` seconds before the end.
 *
 * @param {number} count - points
 * @param {number} seconds - clip length
 * @returns {{ starts: number[], stagger: number, lastIn: number }}
 */
export function chartTiming(count, seconds) {
  const t = TIMING;
  const budget = seconds - t.hold - t.first - t.grow;
  const stagger = count <= 1 ? 0 : Math.max(0, Math.min(t.stagger, budget / (count - 1)));
  const starts = Array.from({ length: count }, (_, index) => round(t.first + index * stagger));
  return { starts, stagger, lastIn: (starts[count - 1] ?? t.first) + t.grow };
}

/** Text sizes in px at 1080 on the short side, and the average glyph width (em) used to estimate text widths. */
export const TEXT = { value: 32, valueMany: 28, label: 28, charWidth: 0.6 };
/** Above this many points the value labels use the smaller size. */
const MANY_POINTS = 8;

/**
 * Width in px of the plot area for vertical bars and lines (the frame minus the side
 * padding and the axis labels), matching the CSS below.
 *
 * @param {string} format
 * @returns {number}
 */
export function plotWidth(format) {
  const { width, height } = FORMATS[format];
  const u = Math.min(width, height) / 1080;
  return width - 2 * (height > width ? 70 : 110) * u - 150 * u;
}

/**
 * Estimated width in px of a line of text.
 *
 * @param {string} text
 * @param {number} size - font size in px
 * @returns {number}
 */
export function textWidth(text, size) {
  return [...text].length * size * TEXT.charWidth;
}

/**
 * Value font size in px for a chart with `count` points in this format.
 *
 * @param {number} count
 * @param {string} format
 * @returns {number}
 */
export function valueSize(count, format) {
  const { width, height } = FORMATS[format];
  return ((count > MANY_POINTS ? TEXT.valueMany : TEXT.value) * Math.min(width, height)) / 1080;
}

/**
 * Whether bars run sideways: always in portrait (tall frames have the height for a
 * list); in wider frames when the labels together are too long to sit under the bars,
 * or when the widest value doesn't fit above its bar.
 *
 * @param {string[]} labels
 * @param {string[]} values - the values as they will be shown
 * @param {string} format - `landscape`, `portrait` or `square`
 * @returns {boolean}
 */
export function isHorizontal(labels, values, format) {
  if (format === "portrait") return true;
  const limit = format === "square" ? HORIZONTAL_LABEL_CHARS * 0.6 : HORIZONTAL_LABEL_CHARS;
  if (labels.reduce((sum, label) => sum + [...label].length, 0) > limit) return true;
  const column = plotWidth(format) / Math.max(1, labels.length);
  const size = valueSize(labels.length, format);
  return values.some((value) => textWidth(value, size) > column * 0.92);
}

/**
 * Which of a line chart's labels to show so none overlap: `priority` points first
 * (each skipped only if it would overlap one already shown), then the rest from left
 * to right. Two labels are shown only when their centres are at least `widest` apart.
 *
 * @param {number} count - points
 * @param {number} spacing - px between neighbouring points
 * @param {number} widest - px width of the widest label (plus a gap)
 * @param {number[]} [priority] - indexes to place first, in order
 * @returns {number[]} the indexes to show, ascending
 */
export function pickLabels(count, spacing, widest, priority = []) {
  const shown = [];
  const fits = (index) => shown.every((other) => Math.abs(index - other) * spacing >= widest);
  for (const index of [...priority, ...Array.from({ length: count }, (_, at) => at)]) {
    if (index >= 0 && index < count && !shown.includes(index) && fits(index)) shown.push(index);
  }
  return shown.sort((a, b) => a - b);
}

/** The largest and smallest non-zero size of a value; beyond them the axis maths loses precision or overflows. */
export const VALUE_RANGE = { max: 1e100, min: 1e-100 };

/** A data value: any number from -1e100 to 1e100, including tiny ones down to 1e-100 (or 0). */
function chartValue(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`"${field}" must be a number (no quotes, no units)`);
  const size = Math.abs(value);
  if (size > VALUE_RANGE.max || (size !== 0 && size < VALUE_RANGE.min)) fail(`"${field}" must be 0 or between 1e-100 and 1e100 in size`);
  return value;
}

/** A line chart keeps this much room (% of the plot width) at each side for the end labels. */
export const LINE_PAD = 7;

/**
 * Where point `index` of `count` sits across a line chart, in % of the plot width.
 *
 * @param {number} index
 * @param {number} count
 * @returns {number}
 */
export function lineX(index, count) {
  return count <= 1 ? 50 : round(LINE_PAD + (index / (count - 1)) * (100 - 2 * LINE_PAD));
}

/**
 * Whether a line chart's value label goes under its point: at a dip (lower than the
 * mean of its neighbours), where a label above would sit on the line.
 *
 * @param {number[]} values
 * @param {number} index
 * @returns {boolean}
 */
export function labelBelow(values, index) {
  const neighbours = [values[index - 1], values[index + 1]].filter((value) => value !== undefined);
  const mean = neighbours.reduce((sum, value) => sum + value, 0) / Math.max(1, neighbours.length);
  return neighbours.length > 0 && (values[index] ?? 0) < mean;
}

/** Where a value sits on the axis, from 0 (min) to 100 (max). */
const percent = (value, { min, max }) => round(((value - min) / (max - min)) * 100);

function main() {
  const args = parseArgs("data-chart-video", "data-chart");
  const { raw } = readSpec(args.spec);

  const title = check.text(raw.title, "title", { max: 80 });
  const subtitle = check.text(raw.subtitle, "subtitle", { required: false, max: 100 });
  const source = check.text(raw.source, "source", { required: false, max: 100 });
  const type = check.choice(raw.type, "type", ["bar", "line"], "bar");
  const prefix = check.text(raw.prefix, "prefix", { required: false, max: 4 });
  // A leading space is kept on purpose ("12 s"); check.text trims it.
  const suffix = `${typeof raw.suffix === "string" && raw.suffix.startsWith(" ") ? " " : ""}${check.text(raw.suffix, "suffix", { required: false, max: 8 })}`;
  const decimals = raw.decimals === undefined ? undefined : Math.round(check.number(raw.decimals, "decimals", [0, 4], 0));
  const format = check.choice(raw.format, "format", Object.keys(FORMATS), "landscape");
  const accent = check.colour(raw.accent, "accent", "#8b7bff");
  const background = check.colour(raw.background, "background", "#0a0a0b");
  const ink = check.colour(raw.ink, "ink", "#f4f4f5");
  const seconds = check.number(raw.seconds, "seconds", [5, 20], 8);
  const data = check.list(raw.data, "data", [type === "line" ? 2 : 1, MAX_POINTS]).map((point, index) => ({
    label: check.text(point?.label, `data[${index}].label`, { max: 24 }),
    value: chartValue(point?.value, `data[${index}].value`),
  }));
  const highlightLabel = check.text(raw.highlight, "highlight", { required: false, max: 24 });
  const highlight = highlightLabel === "" ? -1 : data.findIndex((point) => point.label === highlightLabel);
  if (highlightLabel !== "" && highlight === -1) fail(`"highlight" must be one of the labels: ${data.map((point) => point.label).join(", ")}`);

  const { width, height } = FORMATS[format];
  const tall = height > width;
  const values = data.map((point) => point.value);
  const scale = niceScale(values, type === "bar");
  const fmt = { prefix, suffix, ...(decimals === undefined ? {} : { decimals }) };
  const shownValues = values.map((value) => formatValue(value, fmt));
  const horizontal = type === "bar" && isHorizontal(data.map((point) => point.label), shownValues, format);
  // A crowded line chart shows only the labels that fit: highlight, ends, then peak and low first.
  const spacing = data.length <= 1 ? Infinity : (plotWidth(format) * (100 - 2 * LINE_PAD)) / 100 / (data.length - 1);
  const unit = Math.min(width, height) / 1080;
  const gap = 16 * unit;
  const widestValue = Math.max(...shownValues.map((text) => textWidth(text, valueSize(data.length, format)))) + gap;
  const lineLabelWidth = Math.min(360 * unit, Math.max(...data.map((point) => textWidth(point.label, TEXT.label * unit)))) + gap;
  const ends = [highlight, 0, data.length - 1];
  const showValue = new Set(type === "line" ? pickLabels(data.length, spacing, widestValue, [...ends, values.indexOf(Math.max(...values)), values.indexOf(Math.min(...values))]) : data.map((_, index) => index));
  const showLabel = new Set(type === "line" ? pickLabels(data.length, spacing, lineLabelWidth, ends) : data.map((_, index) => index));
  const timing = chartTiming(data.length, seconds);
  const zero = percent(Math.min(Math.max(0, scale.min), scale.max), scale);
  const all = round(seconds);

  prepareProject(args.project);

  const grid = scale.ticks
    .map((tick) => {
      const at = percent(tick, scale);
      return horizontal
        ? `<div class="grid v" style="left:${at}%"><span>${escapeHtml(formatValue(tick, fmt))}</span></div>`
        : `<div class="grid h" style="bottom:${at}%"><span>${escapeHtml(formatValue(tick, fmt))}</span></div>`;
    })
    .join("");

  const marks = data
    .map((point, index) => {
      const at = percent(point.value, scale);
      const cls = `${index === highlight ? " hi" : ""}${point.value < 0 ? " neg" : ""}`;
      const value = showValue.has(index) ? `<span class="value" data-value="${point.value}">${escapeHtml(formatValue(point.value, fmt))}</span>` : "";
      if (type === "line") {
        const x = lineX(index, data.length);
        return `<div class="dot${cls}${labelBelow(values, index) ? " below" : ""}" id="p${index}" style="left:${x}%;bottom:${at}%">${value}</div>`;
      }
      const from = Math.min(at, zero);
      const size = round(Math.abs(at - zero));
      return horizontal
        ? `<div class="row${cls}" id="p${index}"><span class="label">${escapeHtml(point.label)}</span><div class="track"><div class="bar" style="left:${from}%;width:${size}%;transform-origin:${point.value < 0 ? "right" : "left"} center"></div><div class="rider" data-layout-allow-overflow>${value}</div></div></div>`
        : `<div class="col${cls}" id="p${index}"><div class="bar" style="bottom:${from}%;height:${size}%;transform-origin:center ${point.value < 0 ? "top" : "bottom"}"></div><div class="rider" data-layout-allow-overflow>${value}</div></div>`;
    })
    .join("");

  const linePoints =
    type === "line" ? data.map((point, index) => `${lineX(index, data.length) * 10},${round(1000 - percent(point.value, scale) * 10)}`).join(" ") : "";
  const xLabels =
    type === "line" || !horizontal
      ? `<div id="xlabels" class="${type}">${data
          .map((point, index) =>
            type === "line" && !showLabel.has(index)
              ? ""
              : `<span class="${index === highlight ? "hi" : ""}" style="${type === "line" ? `left:${lineX(index, data.length)}%;width:${Math.round(lineLabelWidth)}px` : ""}">${escapeHtml(point.label)}</span>`,
          )
          .join("")}</div>`
      : "";

  const plotInner = horizontal
    ? `<div id="grid">${grid}</div><div id="rows">${marks}</div>`
    : `<div id="grid">${grid}</div>${zero > 0 && zero < 100 ? `<div class="zero" style="bottom:${zero}%"></div>` : ""}${
        type === "line"
          ? `<svg id="line" viewBox="0 0 1000 1000" preserveAspectRatio="none"><polyline points="${linePoints}" /></svg><div id="cols">${marks}</div>`
          : `<div id="cols">${marks}</div>`
      }`;

  const body = `      <div id="bg" class="clip" data-start="0" data-duration="${all}" data-track-index="0"></div>
      <div id="stage" class="clip" data-start="0" data-duration="${all}" data-track-index="1">
        <header id="head">
          <h1 id="title" data-fit="${Math.round((tall ? 56 : 44) * (Math.min(width, height) / 1080))}">${escapeHtml(title)}</h1>
          ${subtitle === "" ? "" : `<p id="subtitle">${escapeHtml(subtitle)}</p>`}
        </header>
        <div id="chart" class="${horizontal ? "horizontal" : "vertical"}">
          <div id="plot">${plotInner}</div>
          ${xLabels}
        </div>
        ${source === "" ? "" : `<p id="source">${escapeHtml(source)}</p>`}
      </div>`;

  const dim = `${accent}66`;
  const barColour = highlight === -1 ? accent : dim;
  const css = `      #root { background: ${background}; color: ${ink}; }
      #bg { background: radial-gradient(circle at 15% 0%, ${accent}30 0%, ${accent}00 45%); }
      #stage { display: flex; flex-direction: column; padding: calc(${tall ? 110 : 80} * var(--u)) calc(${tall ? 70 : 110} * var(--u)) calc(${tall ? 110 : 70} * var(--u)); }
      #head { flex-shrink: 0; }
      #title { font-size: calc(${tall ? 92 : 72} * var(--u)); font-weight: 800; letter-spacing: -0.03em; line-height: 1.08; max-height: calc(${tall ? 300 : 170} * var(--u)); }
      #subtitle { margin-top: calc(14 * var(--u)); font-size: calc(${tall ? 40 : 34} * var(--u)); opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #chart { flex: 1; min-height: 0; display: flex; flex-direction: column; margin-top: calc(${tall ? 80 : 56} * var(--u)); }
      #plot { position: relative; flex: 1; min-height: 0; margin-left: calc(${horizontal ? 0 : 150} * var(--u)); }
      #chart.horizontal #plot { margin: 0 calc(60 * var(--u)) calc(50 * var(--u)) 0; }
      .grid { position: absolute; }
      .grid.h { left: 0; right: 0; border-top: 2px solid ${ink}1f; }
      .grid.h span { position: absolute; right: calc(100% + 20 * var(--u)); top: 0; transform: translateY(-50%); font-size: calc(28 * var(--u)); opacity: 0.6; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .grid.v { top: 0; bottom: 0; border-left: 2px solid ${ink}1f; }
      .grid.v span { position: absolute; top: calc(100% + 14 * var(--u)); left: 0; transform: translateX(-50%); font-size: calc(28 * var(--u)); opacity: 0.6; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .zero { position: absolute; left: 0; right: 0; border-top: 3px solid ${ink}88; }
      #cols { position: absolute; inset: 0; display: flex; }
      .col { position: relative; flex: 1; }
      .col .bar { position: absolute; left: 16%; right: 16%; background: ${barColour}; border-radius: calc(10 * var(--u)) calc(10 * var(--u)) 0 0; }
      .col.neg .bar { border-radius: 0 0 calc(10 * var(--u)) calc(10 * var(--u)); }
      /* A rider spans the plot and is moved with a transform (xPercent/yPercent), so its label tracks the bar's end smoothly. */
      .rider { position: absolute; inset: 0; }
      .col .value { position: absolute; bottom: 0; left: 50%; transform: translate(-50%, calc(-14 * var(--u))); font-size: calc(${data.length > MANY_POINTS ? TEXT.valueMany : TEXT.value} * var(--u)); font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .col.neg .value { transform: translate(-50%, calc(100% + 14 * var(--u))); }
      .row.hi .bar, .col.hi .bar { background: ${accent}; box-shadow: 0 0 calc(40 * var(--u)) ${accent}88; }
      .hi .value { color: ${accent}; }
      #xlabels { position: relative; flex-shrink: 0; display: flex; margin-left: calc(150 * var(--u)); padding-top: calc(18 * var(--u)); height: calc(${data.length > 8 ? 100 : 76} * var(--u)); }
      #xlabels span { flex: 1; text-align: center; font-size: calc(28 * var(--u)); opacity: 0.75; line-height: 1.15; padding: 0 calc(4 * var(--u)); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
      /* Line labels: one line each, as wide as the widest label; only labels that don't overlap are written. */
      #xlabels.line span { position: absolute; transform: translateX(-50%); flex: none; display: block; white-space: nowrap; text-overflow: ellipsis; }
      #xlabels span.hi { color: ${accent}; opacity: 1; font-weight: 700; }
      #rows { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; }
      /* Rows share the height, but a short list doesn't stretch into slabs. */
      .row { position: relative; flex: 0 1 calc(${tall ? 190 : 160} * var(--u)); display: flex; align-items: center; }
      .row .label { position: absolute; left: 0; top: 0; font-size: calc(${tall ? 32 : 28} * var(--u)); opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
      .row.hi .label { color: ${accent}; opacity: 1; font-weight: 700; }
      .track { position: absolute; left: 0; right: 0; top: calc(${tall ? 42 : 36} * var(--u)); bottom: calc(8 * var(--u)); }
      .row .bar { position: absolute; top: 0; bottom: 0; background: ${barColour}; border-radius: 0 calc(10 * var(--u)) calc(10 * var(--u)) 0; }
      .row.neg .bar { border-radius: calc(10 * var(--u)) 0 0 calc(10 * var(--u)); }
      .row .value { position: absolute; left: 0; top: 50%; transform: translate(calc(14 * var(--u)), -50%); font-size: calc(${tall ? 32 : 28} * var(--u)); font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .row.neg .value { transform: translate(calc(-100% - 14 * var(--u)), -50%); }
      #line { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
      #line polyline { fill: none; stroke: ${accent}; stroke-width: calc(6 * var(--u)); stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
      .dot { position: absolute; width: calc(22 * var(--u)); height: calc(22 * var(--u)); margin: 0 0 calc(-11 * var(--u)) calc(-11 * var(--u)); border-radius: 50%; background: ${background}; border: calc(5 * var(--u)) solid ${accent}; }
      .dot .value { position: absolute; left: 50%; bottom: calc(100% + 12 * var(--u)); transform: translateX(-50%); font-size: calc(${data.length > MANY_POINTS ? TEXT.valueMany : TEXT.value} * var(--u)); font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .dot.below .value { bottom: auto; top: calc(100% + 12 * var(--u)); }
      .dot.hi { background: ${accent}; transform: scale(1.4); box-shadow: 0 0 calc(30 * var(--u)) ${accent}; }
      .dot.hi .value { color: ${accent}; }
      #source { flex-shrink: 0; margin-top: calc(24 * var(--u)); font-size: calc(28 * var(--u)); opacity: 0.55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`;

  const grow = TIMING.grow;
  const script = [
    FIT_SCRIPT,
    // The count-up uses the same formatter as the final labels, so the last frame matches them exactly.
    `      ${formatValue.toString()}`,
    `      const fmt = ${JSON.stringify(fmt)};`,
    `      const countUp = (el, at) => { const end = Number(el.dataset.value); const state = { v: 0 }; tl.to(state, { v: end, duration: ${grow}, ease: "power2.out", onUpdate: () => { el.textContent = formatValue(state.v === end ? end : state.v, fmt); } }, at); };`,
    `      tl.from("#title", { y: 30, duration: 0.8, ease: "power3.out" }, 0);`,
    subtitle === "" ? "" : `      tl.from("#subtitle", { y: 24, opacity: 0, duration: 0.6, ease: "power2.out" }, ${TIMING.title + 0.2});`,
    `      tl.from(".grid, .zero", { opacity: 0, duration: 0.6, stagger: 0.05, ease: "power1.out" }, ${TIMING.grid});`,
    xLabels === "" ? "" : `      tl.from("#xlabels span", { opacity: 0, y: 16, duration: 0.5, stagger: ${round(timing.stagger)}, ease: "power2.out" }, ${TIMING.first});`,
    source === "" ? "" : `      tl.from("#source", { opacity: 0, duration: 0.6 }, ${TIMING.grid});`,
    ...data.map((point, index) => {
      const at = timing.starts[index];
      const id = `#p${index}`;
      if (type === "line") return `      tl.from("${id}", { scale: 0, opacity: 0, duration: 0.45, ease: "back.out(2.5)" }, ${round(at + grow * 0.5)});${showValue.has(index) ? `\n      countUp(document.querySelector("${id} .value"), ${at});` : ""}`;
      const axis = horizontal ? "scaleX" : "scaleY";
      const end = point.value < 0 ? Math.min(percent(point.value, scale), zero) : Math.max(percent(point.value, scale), zero);
      const ride = horizontal ? (at) => `xPercent: ${at}` : (at) => `yPercent: ${-at}`;
      return `      tl.from("${id} .bar", { ${axis}: 0, duration: ${grow}, ease: "power3.out" }, ${at});\n      tl.fromTo("${id} .rider", { ${ride(zero)} }, { ${ride(end)}, duration: ${grow}, ease: "power3.out" }, ${at});${horizontal ? `\n      tl.from("${id} .label", { opacity: 0, x: -20, duration: 0.5, ease: "power2.out" }, ${at});` : ""}\n      tl.from("${id} .value", { opacity: 0, duration: 0.3 }, ${at});\n      countUp(document.querySelector("${id} .value"), ${at});`;
    }),
    // The line draws left to right as its points come in.
    type === "line" ? `      tl.fromTo("#line", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: ${round(timing.lastIn - TIMING.first)}, ease: "none" }, ${TIMING.first});` : "",
    highlight === -1 ? "" : `      tl.fromTo("#p${highlight}", { filter: "brightness(1)" }, { filter: "brightness(1.6)", duration: 0.4, yoyo: true, repeat: 1, ease: "power2.inOut" }, ${round(timing.lastIn + 0.1)});`,
    `      tl.fromTo("#chart", { scale: 1 }, { scale: 1.02, duration: ${all}, ease: "none" }, 0);`,
  ]
    .filter(Boolean)
    .join("\n");

  writeAndRender(args.project, compositionHtml({ width, height, duration: seconds, css, body, script }), {
    render: args.render,
    skill: "data-chart-video",
    name: "data-chart",
    seconds,
  });
}

if (isMain(import.meta.url)) main();
