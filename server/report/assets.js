"use strict";
// Fonts and the logo mark, read once and held as data URIs.
// The subset woff2 files are the same ones the frontend self-hosts.
const fs = require("fs");
const path = require("path");

const A = path.join(__dirname, "assets");
const uri = (f, mime) =>
  `data:${mime};base64,${fs.readFileSync(path.join(A, f)).toString("base64")}`;

module.exports = {
  FONT_REGULAR: uri("GoogleSans-sub-Regular.woff2", "font/woff2"),
  FONT_SEMIBOLD: uri("GoogleSans-sub-SemiBold.woff2", "font/woff2"),
  LOGO_MARK: uri("logo-mark.png", "image/png"),
};
