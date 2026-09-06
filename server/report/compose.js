"use strict";
// Renders the report to a PDF.
//
// Cover and body are rendered as two documents so the cover carries no running
// header, then merged; page numbers are stamped across the merged file, which
// is the only way to get a continuous "Page i / n" across both.
const puppeteer = require("puppeteer");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { buildCover, buildMapPage, buildBody } = require("./template");
const streetview = require("./streetview");

const MARGIN = { top: "20mm", bottom: "18mm", left: "16mm", right: "16mm" };
// The cover is a full-bleed artwork, so it gets no page margin at all.
const NO_MARGIN = { top: "0", bottom: "0", left: "0", right: "0" };
const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",   // /dev/shm is small in containers; without this Chrome crashes
  "--disable-gpu",
  "--font-render-hinting=none", // consistent metrics regardless of host fonts
];

let _browser = null;
let _closing = null;

async function browser() {
  if (_closing) await _closing;
  if (_browser && _browser.connected) return _browser;
  _browser = await puppeteer.launch({ headless: "new", args: LAUNCH_ARGS });
  _browser.on("disconnected", () => { _browser = null; });
  return _browser;
}

async function closeBrowser() {
  if (!_browser) return;
  _closing = _browser.close().catch(() => {}).finally(() => { _browser = null; _closing = null; });
  await _closing;
}

async function renderOne(html, margin, landscape) {
  const b = await browser();
  const page = await b.newPage();
  try {
    // No network is needed — fonts and images are inlined as data URIs — so an
    // idle wait would only add latency and a failure mode.
    await page.setContent(html, { waitUntil: "load", timeout: 20000 });
    await page.evaluateHandle("document.fonts.ready");
    return await page.pdf({
      format: "A4",
      landscape: !!landscape,
      printBackground: true,
      preferCSSPageSize: false,
      margin: margin || MARGIN,
      timeout: 30000,
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function stampFooter(pdfBytes, siteLabel, bleedPages) {
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const n = pages.length;
  const grey = rgb(0.59, 0.59, 0.63);
  const rule = rgb(0.882, 0.882, 0.894);

  pages.forEach((page, i) => {
    // The leading full-bleed pages (cover, map) carry no footer.
    if (i < (bleedPages || 1)) return;
    const { width } = page.getSize();
    const m = 45.4;              // 16mm at 72dpi, matching the render margins
    const y = 34;
    page.drawLine({
      start: { x: m, y: y + 12 }, end: { x: width - m, y: y + 12 },
      thickness: 0.5, color: rule,
    });
    page.drawText(siteLabel, {
      x: width / 2 - font.widthOfTextAtSize(siteLabel, 7) / 2,
      y, size: 7, font, color: grey,
    });
    const num = `Page ${i + 1} / ${n}`;
    page.drawText(num, {
      x: width - m - font.widthOfTextAtSize(num, 7), y, size: 7, font, color: grey,
    });
  });
  return pdf.save();
}

// Renders are serialised. A single report peaks around 256 MB (PSS) on top of
// a ~128 MB idle browser; two at once on a 512 MB instance is an OOM restart.
// Rendering takes well under a second, so a queue costs latency only under
// genuine concurrency.
let _queue = Promise.resolve();
function serialise(fn) {
  const run = _queue.then(fn, fn);
  _queue = run.catch(() => {});
  return run;
}

/** Render a full report. Returns a Buffer. */
function renderReport(payload) {
  return serialise(() => _renderReport(payload));
}

async function _renderReport(payload) {
  // The street-level frames are fetched and re-projected before any page is
  // built, because they end up inlined in the body HTML. This is the one part
  // of a report that touches the network, so it is bounded and optional: if it
  // fails, or sharp is not installed, the report simply has no imagery section.
  if (payload.streetImagery) {
    try {
      payload.streetImagery = await streetview.prepare(payload.streetImagery);
    } catch (err) {
      console.warn("[report] street imagery skipped:", (err && err.message) || err);
      payload.streetImagery = null;
    }
  }

  // Three documents: a portrait full-bleed cover, an optional landscape
  // full-bleed map, then the flowing body. Merged in that order because only
  // separate renders can mix page orientation and margins.
  const parts = [await renderOne(buildCover(payload), NO_MARGIN)];
  const mapHtml = buildMapPage(payload);
  if (mapHtml) parts.push(await renderOne(mapHtml, NO_MARGIN, true));
  const bleedPages = parts.length;          // pages that carry no stamped footer
  parts.push(await renderOne(buildBody(payload)));

  const out = await PDFDocument.create();
  for (const bytes of parts) {
    const src = await PDFDocument.load(bytes);
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
  }
  out.setTitle((payload.subject && payload.subject.title) || "Urbanyx analysis report");
  out.setProducer("Urbanyx");
  out.setCreationDate(new Date());

  return Buffer.from(await stampFooter(await out.save(), payload.siteLabel || "urbanyx.zaxis.ge", bleedPages));
}

module.exports = { renderReport, closeBrowser };
