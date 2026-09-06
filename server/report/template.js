"use strict";
// Builds the report HTML from a payload assembled by the frontend.
//
// Every section is conditional: the export mirrors what is active on the map.
// A section that has no data is not rendered — it leaves no heading, no
// placeholder and no gap. The payload contract is documented in PAYLOAD.md.
const STYLES = require("./styles");
const { LOGO_MARK } = require("./assets");

// ── helpers ────────────────────────────────────────────────────────────────
const esc = (v) =>
  String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Colour is chosen server-side so the frontend never ships CSS.
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;
const color = (c, fallback) => (SAFE_COLOR.test(c || "") ? c : fallback);

const has = (v) => v != null && v !== "" && !(Array.isArray(v) && !v.length);
const join = (parts) => parts.filter(Boolean).join("\n");

const ICON_OK =
  '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#16a34a" ' +
  'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M4 10.5 L8 14.5 L16 5.5"/></svg>';
const ICON_NO =
  '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#dc2626" ' +
  'stroke-width="2.2" stroke-linecap="round"><path d="M5 5 L15 15 M15 5 L5 15"/></svg>';
const ICON_FLAG =
  '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#d97706" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M10 2.6 L18.4 17 H1.6 Z"/><path d="M10 8 V11.6"/><path d="M10 14.4 V14.5"/></svg>';

const doc = (title, bodyClass, inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${STYLES}</style></head>
<body class="${bodyClass}">
${inner}
</body></html>`;

const lines = (rows) =>
  !has(rows) ? "" :
  `<div class="lines">${rows
    .map(([k, v]) => `<div class="li"><span class="k">${esc(k)}</span><span>${esc(v)}</span></div>`)
    .join("")}</div>`;

const section = (title, lead, inner, tone, keep) =>
  !inner ? "" :
  `<div class="sect${keep ? " keep" : ""}"><h2 class="sec${tone ? " " + tone : ""}">${esc(title)}</h2>` +
  (lead ? `<div class="seclead">${esc(lead)}</div>` : "") + inner + `</div>`;

// ── cover ──────────────────────────────────────────────────────────────────
function buildCover(d) {
  const s = d.subject || {};
  const meta = [];
  if (has(s.parcelCode)) meta.push(["Parcel code", s.parcelCode]);
  if (has(s.areaLabel)) meta.push(["Area", s.areaLabel]);
  if (has(s.dominantZone)) meta.push(["Dominant zone", s.dominantZone]);
  if (has(s.analysesLabel)) meta.push(["Analyses", s.analysesLabel]);
  meta.push(["Issued", d.issued]);

  const cols = Math.min(4, Math.max(2, meta.length));
  return doc(s.title || "Urbanyx report", "cover", `
<div class="cv">
  <div class="mk"><img src="${LOGO_MARK}" alt=""><span class="wm">Urbanyx</span></div>
  <div class="top-rule"></div>
  <span class="eyebrow">Site &amp; area analysis report</span>
  <h1>${esc(s.title || "Analysis report")}</h1>
  ${has(s.place) ? `<div class="place">${esc(s.place)}</div>` : ""}
  <div class="meta" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">
    ${meta.map(([k, v]) => `<div><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("")}
  </div>
  <div class="foot">
    <div>${[
      has(d.preparedFor) ? `<div class="k">Prepared for</div><div class="v">${esc(d.preparedFor)}</div>` : "",
      has(d.preparedBy) ? `<div class="k"${has(d.preparedFor) ? ` style="margin-top:15px"` : ""}>Prepared by</div><div class="v">${esc(d.preparedBy)}</div>` : "",
    ].join("")}</div>
    <div class="zx">${has(s.reportId) ? esc(s.reportId) + "<br>" : ""}Urbanyx &nbsp;·&nbsp; a Z.axis product</div>
  </div>
</div>`);
}

// ── body sections ──────────────────────────────────────────────────────────
function tiles(list) {
  if (!has(list)) return "";
  const n = Math.min(4, list.length);
  return `<div class="tiles${list.length !== 4 ? " n" + Math.min(6, list.length) : ""}">` +
    list.map((t) =>
      `<div class="tile" style="--accent:${color(t.color, "#6366f1")}">
        <div class="v">${esc(t.value)}</div>
        <div class="l">${esc(t.label)}</div>
        ${has(t.sub) ? `<div class="s">${esc(t.sub)}</div>` : ""}
      </div>`).join("") + `</div>`;
}

function indexBlock(uvi) {
  if (!uvi || !has(uvi.parts)) return "";
  const prov = !!uvi.partial;
  const total = uvi.parts.length;
  const known = uvi.parts.filter((p) => p.score != null).length;
  return `<div class="idx">
    <div class="hd">
      <div>
        <div class="score${prov ? " prov" : ""}">${esc(uvi.score)}</div>
        <div class="of">${esc(uvi.name || "Urban Livability Index")}</div>
        ${prov ? `<span class="tag">Provisional · ${known} of ${total}</span>` : ""}
      </div>
      <div class="grade">
        <div class="g${prov ? " prov" : ""}">${esc(uvi.grade)}</div>
        <div class="gl">${esc(prov ? "weights renormalised" : uvi.gradeLabel || "")}</div>
      </div>
    </div>
    <div class="bars">
      ${uvi.parts.map((p) => `<div class="bar">
        <span class="nm">${esc(p.label)}</span>
        <span class="tr"><span class="fl" style="width:${Math.max(0, Math.min(100, Number(p.score) || 0))}%"></span></span>
        <span class="vl">${p.score == null ? "—" : esc(Math.round(p.score))}</span>
        <span class="wt">weight ${esc(p.weight)}</span>
      </div>`).join("")}
    </div>
  </div>`;
}

function mapSection(m) {
  if (!m || !has(m.dataUrl)) return "";
  const groups = (m.legend || []).filter((g) => has(g.rows) || has(g.note));
  return section("Map", "All active analysis layers on one capture, with a combined legend.", `
    <div class="mapplate"><img src="${esc(m.dataUrl)}" alt=""></div>
    <div class="attrib">Basemap © Mapbox, © OpenStreetMap contributors.</div>
    ${groups.length ? `<div class="legend">${groups.map((g) => `<div class="lg">
      <div class="t">${esc(g.title)}</div>
      ${(g.rows || []).map((r) => `<div class="r">${
        r.color ? `<span class="${r.shape === "dot" ? "dot" : "sw"}" style="background:${color(r.color, "#a1a1aa")}"></span>` : ""
      }${esc(r.label)}</div>`).join("")}
      ${has(g.note) ? `<div class="n">${esc(g.note)}</div>` : ""}
    </div>`).join("")}</div>` : ""}
  `, "s");
}

function ownership(o) {
  if (!o || !has(o.rows)) return "";
  return `<div class="blk">
    <h3 class="sub">Ownership</h3>
    <dl class="kv">${o.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    ${has(o.owners) ? `<div class="owners">${o.owners
      .map((x) => `<div class="o">${esc([x.name, x.id && "ID " + x.id, x.type].filter(Boolean).join(" · "))}</div>`)
      .join("")}</div>` : ""}
  </div>`;
}

function zoning(z) {
  if (!z || !has(z.zones)) return "";
  const t = z.totals || {};
  const cell = (v) => (has(v) ? esc(v) : "—");
  const table = z.hasCoefficients
    ? `<table class="zcols">
        <thead><tr><th>Zone</th><th class="n">Share</th><th class="n">K1</th><th class="n">K2</th>
        <th class="n">K3</th><th class="n">Footprint</th><th class="n">Floor area</th>
        <th class="n">Greening</th><th class="n">Height</th></tr></thead>
        <tbody>
        ${z.zones.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${cell(r.pct)}</td>
          <td class="n">${cell(r.k1)}</td><td class="n">${cell(r.k2)}</td><td class="n">${cell(r.k3)}</td>
          <td class="n">${cell(r.footprint)}</td><td class="n">${cell(r.floorArea)}</td>
          <td class="n">${cell(r.greening)}</td><td class="n">${cell(r.height)}</td></tr>`).join("")}
        <tr class="total"><td>Total (m²)</td><td class="n"></td><td class="n"></td><td class="n"></td>
          <td class="n"></td><td class="n">${cell(t.footprint)}</td><td class="n">${cell(t.floorArea)}</td>
          <td class="n">${cell(t.greening)}</td><td class="n">${cell(t.height)}</td></tr>
        </tbody></table>`
    : `<p class="note" style="font-size:13px;color:var(--body)">${esc(
        z.zones.map((r) => `${r.name}${has(r.pct) ? ` (${r.pct})` : ""}`).join(", ")
      )}. No K-coefficients on record for these zones.</p>`;

  const notes = [];
  if (z.setback) notes.push(`3 m setback ring: ${z.setback.label} — excluded from the buildable footprint above.`);
  if (z.noDev) notes.push("One or more zones carry K1 = 0; that portion is not designated for development.");

  return `<div class="blk loose">
    <h3 class="sub i">Zoning &amp; development limits</h3>
    ${z.multi ? `<p class="note" style="margin-bottom:9px">This parcel spans multiple zoning categories. Parameters are calculated per zone, proportional to that zone’s share of the parcel area, then summed.</p>` : ""}
    ${table}
    ${notes.length ? `<p class="note" style="margin-top:11px">${esc(notes.join(" "))}</p>` : ""}
  </div>`;
}

function article16(a) {
  if (!a || !has(a.rows)) return "";
  return `<div class="blk">
    <h3 class="sub i">Parcel compliance — Article 16</h3>
    <div class="a16">${a.rows.map((r) => `<div class="r">
      <span class="req">${esc(r.requirement)}</span>
      <span class="val">${esc(r.required)}</span>
      <span class="val">${esc(r.actual || "—")}</span>
      <span class="verdict${r.verdict === "ok" ? " ok" : r.verdict === "below" ? " no" : ""}">${
        r.verdict === "ok" ? ICON_OK + " Meets" : r.verdict === "below" ? ICON_NO + " Below" : "&nbsp;"
      }</span></div>`).join("")}</div>
    ${has(a.note) ? `<p class="note" style="margin-top:10px">${esc(a.note)}</p>` : ""}
  </div>`;
}

function permits(p) {
  if (!p || !has(p.rows)) return "";
  return `<div class="blk">
    <h3 class="sub o">Construction permits</h3>
    ${lines(p.rows)}
    ${p.conflict ? `<div class="callout">${ICON_FLAG}<div class="tx"><b>Flag —</b> ${esc(p.conflictText ||
      "this permit appears to conflict with the Tbilisi 2019 Urban Masterplan: the permitted use is not among those allowed in this zone. Verify against the current masterplan before relying on it.")}</div></div>` : ""}
  </div>`;
}

function simpleBlock(title, tone, body) {
  if (!body) return "";
  return `<div class="blk"><h3 class="sub${tone ? " " + tone : ""}">${esc(title)}</h3>${body}</div>`;
}

function mobility(m) {
  if (!m) return "";
  const mini = has(m.headline)
    ? `<div class="mini">${m.headline.slice(0, 3).map((h) =>
        `<div class="m"><div class="v">${esc(h.value)}</div><div class="l">${esc(h.label)}</div></div>`).join("")}</div>`
    : "";
  const body = mini + lines(m.rows);
  return body.trim() ? simpleBlock("Mobility & access", "g", body) : "";
}

function realestate(r) {
  if (!r || !has(r.rows)) return "";
  // One value column, labelled for the deal mode the report was taken in —
  // the sale and rent medians are different fields and must not be mixed.
  return `<div class="blk loose">
    <h3 class="sub i">Real estate market — catchment</h3>
    <table><thead><tr><th>Property type</th>
      <th class="n">${esc(r.valueHeader || "Median price / m²")}</th>
      <th class="n">Listings</th></tr></thead>
      <tbody>${r.rows.map((x) => `<tr><td>${esc(x.type)}</td>
        <td class="n">${esc(x.value || "—")}</td>
        <td class="n">${esc(x.listings || "—")}</td></tr>`).join("")}</tbody>
    </table>
    ${has(r.note) ? `<p class="note" style="margin-top:9px">${esc(r.note)}</p>` : ""}
  </div>`;
}

function findings(f) {
  if (!f) return "";
  const blocks = join([
    ownership(f.ownership),
    zoning(f.zoning),
    article16(f.article16),
    permits(f.permits),
    simpleBlock("Street network & morphology", "", lines(f.street && f.street.rows)),
    simpleBlock("Relief · slope · aspect", "", lines(f.relief && f.relief.rows)),
    simpleBlock("Energy potential", "", lines(f.energy && f.energy.rows)),
    simpleBlock("Climate & land cover", "", lines(f.climate && f.climate.rows)),
    mobility(f.mobility),
    simpleBlock("Nearby amenities — walkable catchment", "g", lines(f.amenities && f.amenities.rows)),
    realestate(f.realestate),
  ]);
  return blocks.trim()
    ? section("Findings", "Only the analyses active in this export are reported.", blocks, "g")
    : "";
}

function methodology(list) {
  if (!has(list)) return "";
  return section("Methodology",
    "Only the analyses active in this export are defined here — nothing else is carried.",
    `<div class="defs">${list.map((m) =>
      `<div class="def"><div class="t">${esc(m.title)}</div><div class="d">${esc(m.body)}</div></div>`
    ).join("")}</div>`);
}

function sources(list) {
  if (!has(list)) return "";
  return section("Sources",
    "Collected in order of appearance; only sources actually used are listed.",
    `<div class="srcs">${list.map((s) =>
      `<div class="src"><span class="k">${esc(s.label)}</span><span class="v">${esc(s.text)}</span></div>`
    ).join("")}</div>
    <div class="disc"><div class="t">Disclaimer</div><div class="d">This report is generated
      automatically from open and third-party datasets and is provided for orientation only. It is
      not a survey, a legal opinion, a valuation, or a substitute for the official cadastral record.
      Figures reflect the data available on the date of issue and may change without notice. Verify
      all statutory limits and ownership details with the relevant authority before relying on
      them.</div></div>`, null, true);
}

function buildBody(d) {
  const s = d.subject || {};
  const subject = [s.parcelCode && "Parcel " + s.parcelCode, s.title, s.place]
    .filter(Boolean).join(" · ");

  const summaryInner = join([
    tiles(d.tiles),
    has(d.summary) ? `<p style="margin-top:30px">${esc(d.summary)}</p>` : "",
    indexBlock(d.uvi),
    d.uvi ? `<p class="note" style="margin-top:18px">How to read this: the index blends walkable
      access to amenities, public transport, land-use diversity and on-street parking into one
      0–100 score (A best, F worst). Components are weighted as shown and averaged over those with
      data. Definitions are in Methodology.</p>` : "",
  ]);

  const inner = join([
    `<table class="doc"><thead><tr><td>
       <div class="rhead"><div class="l"><img src="${LOGO_MARK}" alt="">
         <span class="t"><b>Site &amp; Area Analysis</b>${subject ? " &nbsp;·&nbsp; " + esc(subject) : ""}</span></div></div>
     </td></tr></thead><tbody><tr><td><div class="flow">`,
    summaryInner.trim()
      ? `<h2 class="sec">Summary</h2><div class="seclead">At a glance, followed by the reasoning behind the figures.</div>${summaryInner}`
      : "",
    mapSection(d.map),
    findings(d.findings),
    methodology(d.methodology),
    sources(d.sources),
    `</div></td></tr></tbody></table>`,
  ]);

  return doc(s.title || "Urbanyx report", "body", inner);
}

module.exports = { buildCover, buildBody };
