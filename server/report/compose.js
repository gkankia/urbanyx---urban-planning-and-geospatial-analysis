"use strict";
// Renders the report to a PDF.
//
// Cover and body are rendered as two documents so the cover carries no running
// header, then merged; page numbers are stamped across the merged file, which
// is the only way to get a continuous "Page i / n" across both.
const puppeteer = require("puppeteer");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { buildCover, buildBody } = require("./template");

const MARGIN = { top: "20mm", bottom: "18mm", left: "16mm", right: "16mm" };
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

async function renderOne(html) {
  const b = await browser();
  const page = await b.newPage();
  try {
    // No network is needed — fonts and images are inlined as data URIs — so an
    // idle wait would only add latency and a failure mode.
    await page.setContent(html, { waitUntil: "load", timeout: 20000 });
    await page.evaluateHandle("document.fonts.ready");
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      margin: MARGIN,
      timeout: 30000,
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function stampFooter(pdfBytes, siteLabel) {
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const n = pages.length;
  const grey = rgb(0.59, 0.59, 0.63);
  const rule = rgb(0.882, 0.882, 0.894);

  pages.forEach((page, i) => {
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
  const [coverPdf, bodyPdf] = [
    await renderOne(buildCover(payload)),
    await renderOne(buildBody(payload)),
  ];

  const out = await PDFDocument.create();
  for (const bytes of [coverPdf, bodyPdf]) {
    const src = await PDFDocument.load(bytes);
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
  }
  out.setTitle((payload.subject && payload.subject.title) || "Urbanyx analysis report");
  out.setProducer("Urbanyx");
  out.setCreationDate(new Date());

  return Buffer.from(await stampFooter(await out.save(), payload.siteLabel || "urbanyx.zaxis.ge"));
}

module.exports = { renderReport, closeBrowser };
