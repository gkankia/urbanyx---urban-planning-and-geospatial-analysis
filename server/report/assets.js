"use strict";
// Fonts and the logo mark, read once and held as data URIs.
// The subset woff2 files are the same ones the frontend self-hosts.
const fs = require("fs");
const path = require("path");

const A = path.join(__dirname, "assets");
const uri = (f, mime) =>
  `data:${mime};base64,${fs.readFileSync(path.join(A, f)).toString("base64")}`;

// The cover is a finished, fixed artwork per language — nothing on it is
// templated. Loaded on first use rather than at require time: each one is
// ~0.8 MB, and a render only ever needs one of them.
const _covers = {};
function coverSvg(lang) {
  const key = lang === "ka" ? "ka" : "en";
  if (!_covers[key]) _covers[key] = uri(`report-cover-${key}.svg`, "image/svg+xml");
  return _covers[key];
}

module.exports = {
  FONT_REGULAR: uri("GoogleSans-sub-Regular.woff2", "font/woff2"),
  FONT_SEMIBOLD: uri("GoogleSans-sub-SemiBold.woff2", "font/woff2"),
  LOGO_MARK: uri("logo-mark.png", "image/png"),
  coverSvg,
};
