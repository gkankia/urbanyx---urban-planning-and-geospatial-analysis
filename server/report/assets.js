"use strict";
// Fonts and the logo mark, read once and held as data URIs.
// The subset woff2 files are the same ones the frontend self-hosts.
const fs = require("fs");
const path = require("path");

const A = path.join(__dirname, "assets");
const uri = (f, mime) =>
  `data:${mime};base64,${fs.readFileSync(path.join(A, f)).toString("base64")}`;

// Returned as markup rather than a data: URI so the artwork stays vector all
// the way into the PDF. Wrapped in <img> it is rasterised, and the tile seams
// of its embedded images show as faint boxes.
const _covers = {};
function coverSvg(lang) {
  const key = lang === "ka" ? "ka" : "en";
  if (!_covers[key]) {
    // Prefer the pre-rasterised 300 dpi artwork when it is present.
    const jpg = path.join(A, `report-cover-${key}.jpg`);
    if (fs.existsSync(jpg)) {
      _covers[key] = `<img src="${uri(`report-cover-${key}.jpg`, "image/jpeg")}" alt="">`;
      return _covers[key];
    }
    _covers[key] = fs.readFileSync(path.join(A, `report-cover-${key}.svg`), "utf8")
      // Drop the XML prolog; it is invalid inside an HTML document.
      .replace(/^[\s\S]*?(?=<svg)/, "")
      // Let the page drive the size.
      .replace(/<svg([^>]*)>/, (m, attrs) =>
        `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, "")} width="100%" height="100%" preserveAspectRatio="xMidYMid slice">`);
  }
  return _covers[key];
}

module.exports = {
  FONT_REGULAR: uri("GoogleSans-sub-Regular.woff2", "font/woff2"),
  FONT_SEMIBOLD: uri("GoogleSans-sub-SemiBold.woff2", "font/woff2"),
  LOGO_MARK: uri("logo-mark.png", "image/png"),
  coverSvg,
};
