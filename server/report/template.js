"use strict";
// Builds the report HTML from a payload assembled by the frontend.
//
// Every section is conditional: the export mirrors what is active on the map.
// A section that has no data is not rendered — it leaves no heading, no
// placeholder and no gap. The payload contract is documented in PAYLOAD.md.
const STYLES = require("./styles");
const { LOGO_MARK, coverSvg } = require("./assets");

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

const section = (title, lead, inner, tone, keep, cls) =>
  !inner ? "" :
  `<div class="sect${keep ? " keep" : ""}${cls ? " " + cls : ""}"><h2 class="sec${tone ? " " + tone : ""}">${esc(title)}</h2>` +
  (lead ? `<div class="seclead">${esc(lead)}</div>` : "") + inner + `</div>`;

// ── cover ──────────────────────────────────────────────────────────────────
// The cover is a finished artwork from design-system/report-covers, one per
// language. It carries no report data — no address, no parcel, no date beyond
// the year set into the artwork — so there is nothing to template here: the
// page is the graphic, edge to edge. Rendered with zero page margins (see
// compose.js) so it bleeds.
function buildCover(d) {
  const lang = d.lang === "ka" ? "ka" : "en";
  return doc((d.subject && d.subject.title) || "Urbanyx report", "cover", `
<style>
  html,body{margin:0;padding:0;height:100%;background:#fff}
  .cover{width:100%;height:100vh;display:block;overflow:hidden}
  /* assets.coverSvg returns an <img> for the pre-rasterised artwork and an
     inline <svg> as the fallback; both fill the page. */
  .cover img,.cover svg{width:100%;height:100%;display:block;object-fit:cover}
</style>
<div class="cover">${coverSvg(lang)}</div>`);
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

// The map is its own landscape page, rendered edge to edge so the capture is
// as large as the sheet allows. The legend sits on it as a card rather than
// below it, because splitting them costs the map half the page.
function buildMapPage(d) {
  const m = d.map;
  if (!m || !has(m.dataUrl)) return null;
  const groups = (m.legend || []).filter((g) => has(g.rows) || has(g.note));
  const cols = Math.min(3, Math.max(1, Math.ceil(groups.length / 4)));

  return doc((d.subject && d.subject.title) || "Map", "mappage", `
<style>
  html,body{margin:0;padding:0;height:100%;background:#fff}
  .sheet{position:relative;width:100%;height:100vh;overflow:hidden;background:#ececed}
  .sheet > img{width:100%;height:100%;object-fit:cover;display:block}
  .cap{position:absolute;left:10mm;bottom:6mm;font-size:9px;color:#52525b;
    background:rgba(255,255,255,0.82);padding:3px 7px;border-radius:3px}
  .key{position:absolute;left:10mm;top:10mm;max-width:104mm;
    background:rgba(255,255,255,0.93);border:1px solid rgba(0,0,0,0.10);
    border-radius:4px;padding:13px 15px 14px;
    box-shadow:0 2px 10px rgba(0,0,0,0.10)}
  .key .h{font-size:9.5px;font-weight:600;letter-spacing:0.13em;text-transform:uppercase;
    color:#a1a1aa;margin-bottom:9px}
  .key .cols{display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:11px 18px}
  .key .t{font-size:8.5px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;
    color:#71717a;margin-bottom:5px}
  .key .r{display:flex;align-items:center;gap:6px;font-size:10px;color:#3f3f46;padding:1.5px 0}
  .key .sw{width:13px;height:6px;border-radius:2px;flex:none}
  .key .dot{width:7px;height:7px;border-radius:50%;flex:none}
  .key .n{font-size:8.5px;color:#a1a1aa;margin-top:4px;line-height:1.45}
</style>
<div class="sheet">
  <img src="${esc(m.dataUrl)}" alt="">
  ${groups.length ? `<div class="key">
    <div class="h">${esc(m.keyTitle || "Legend")}</div>
    <div class="cols">${groups.map((g) => `<div>
      <div class="t">${esc(g.title)}</div>
      ${(g.rows || []).map((r) => `<div class="r">${
        r.color ? `<span class="${r.shape === "dot" ? "dot" : "sw"}" style="background:${color(r.color, "#a1a1aa")}"></span>` : ""
      }${esc(r.label)}</div>`).join("")}
      ${has(g.note) ? `<div class="n">${esc(g.note)}</div>` : ""}
    </div>`).join("")}</div>
  </div>` : ""}
  <div class="cap">${esc(m.caption || "Study area.")} Basemap © Mapbox, © OpenStreetMap contributors.</div>
</div>`);
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


const GRADE_COLOR = { A: "#16a34a", B: "#65a30d", C: "#d97706", D: "#ea580c", E: "#dc2626", F: "#dc2626" };
// Continuous green-to-red ramp over the on-time share, anchored on the same
// breaks the map legend uses (>=80 good, 60-80 warning, <60 bad) so a stop's
// colour means the same thing in the report as it does on screen.
const RAMP = [[35, [190, 24, 33]], [50, [220, 38, 38]], [60, [234, 88, 12]],
              [70, [217, 119, 6]], [80, [101, 163, 13]], [90, [22, 163, 74]],
              [100, [21, 128, 61]]];
function rampColor(pct) {
  if (pct == null || !isFinite(pct)) return "#a1a1aa";
  const p = Math.max(RAMP[0][0], Math.min(100, pct));
  let a = RAMP[0], b = RAMP[RAMP.length - 1];
  for (let i = 0; i < RAMP.length - 1; i++) {
    if (p >= RAMP[i][0] && p <= RAMP[i + 1][0]) { a = RAMP[i]; b = RAMP[i + 1]; break; }
  }
  const k = b[0] === a[0] ? 0 : (p - a[0]) / (b[0] - a[0]);
  const hex = (n) => Math.round(n).toString(16).padStart(2, "0");
  return "#" + a[1].map((v, i) => hex(v + (b[1][i] - v) * k)).join("");
}
const CLS_COLOR = { ok: "#16a34a", warn: "#d97706", bad: "#dc2626" };

// Transit reliability, reported in full rather than summarised: the panel's
// grade, its four headline metrics, the hourly delay profile, the thresholds
// the map colours by, the ranked stops, and every stop as an appendix table.
function transitHistory(h) {
  if (!h) return "";
  const g = GRADE_COLOR[h.grade] || "#71717a";

  const grade = h.grade ? `<div class="grade-row">
    <span class="g" style="background:${g}1f;border:1px solid ${g}55;color:${g}">${esc(h.grade)}</span>
    <span class="t">Area reliability across every stop in the catchment, weighted by matched arrivals.</span>
    <span class="p" style="color:${g}">${esc(h.onTimePct)}%</span>
  </div>` : "";

  const headline = has(h.headline) ? `<div class="hl">${h.headline.map((c) =>
    `<div class="c"><div class="v">${esc(c.value)}</div><div class="k">${esc(c.label)}</div>
     ${has(c.sub) ? `<div class="s">${esc(c.sub)}</div>` : ""}</div>`).join("")}</div>` : "";

  const scope = lines([
    h.window && ["Window", `${h.window.from} → ${h.window.to}`],
    h.filters && ["Filters", `${h.filters.period} · ${h.filters.dayType} · ${h.filters.timeBand}`],
    h.coverage && h.coverage.firstDate && ["Archive", `since ${h.coverage.firstDate}${h.coverage.days ? ` · ${h.coverage.days} days` : ""}`],
    h.totals && ["Sample", `${h.totals.matched || 0} matched arrivals from ${h.totals.observations || 0} observations at ${h.stopCount} stops`],
    h.thinCount ? ["Below sample floor", `${h.thinCount} stop${h.thinCount === 1 ? "" : "s"} under 30 matched arrivals — shares not reported`] : null,
  ].filter(Boolean));

  // Diverging hourly profile: late above the line, early below, as on screen.
  let hours = "";
  if (has(h.hourly)) {
    const max = Math.max(1, ...h.hourly.map((r) => Math.abs(r.delayMin || 0)));
    hours = `<div class="blk"><h3 class="sub">Delay by hour of service</h3>
      <div class="hours"><span class="zero"></span>${h.hourly.map((r) => {
        if (r.delayMin == null) return `<span class="b"></span>`;
        const pct = Math.max(3, Math.min(48, Math.abs(r.delayMin) / max * 46));
        return `<span class="b"><i class="${r.delayMin >= 0 ? "up" : "dn"}" style="height:${pct}%"></i></span>`;
      }).join("")}</div>
      <div class="hourlab">${h.hourly.filter((_, i) => i % 3 === 0)
        .map((r) => `<span>${String(r.hour).padStart(2, "0")}</span>`).join("")}</div>
      <p class="note" style="margin-top:8px">Median delay per service hour. Above the line is late,
        below is early. Bars are scaled to the largest absolute value in the window.</p></div>`;
  }

  const thresholds = has(h.thresholds) ? `<div class="blk"><h3 class="sub">Map thresholds</h3>
    <div class="thr">${h.thresholds.map((v) =>
      `<div class="r"><span class="k">${esc(v.label)}</span><span>${(v.bands || []).map(esc).join(" · ")}</span></div>`
    ).join("")}</div></div>` : "";

  // Ranked, and coloured by where each stop sits on the same scale the map
  // uses — so the two lists read as one gradient, best green to worst red,
  // rather than as two anonymous lists that happen to be ordered.
  const rank = (title, list) => !has(list) ? "" :
    `<div><h3 class="sub">${esc(title)}</h3><ol class="rank">${list.map((s, i) => {
      const c = rampColor(s.onTimeNum);
      const w = Math.max(2, Math.min(100, s.onTimeNum == null ? 0 : s.onTimeNum));
      return `<li class="it">
        <div class="hd"><span class="pos">${i + 1}</span>
          <span class="n">${esc(s.name)}</span>
          ${s.routes ? `<span class="r">${esc(s.routes)}</span>` : ""}
          <span class="v" style="color:${c}">${esc(s.onTime || "—")}</span></div>
        <div class="bar"><i style="width:${w}%;background:${c}"></i></div>
        <div class="sub2">${esc(s.late || "—")} late · median ${esc(s.delayMed || "—")}${
          s.matched ? ` · ${esc(s.matched)} matched` : ""}</div>
      </li>`;
    }).join("")}</ol></div>`;

  const ranked = (has(h.worst) || has(h.best))
    ? `<div class="blk loose" style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        ${rank("Least reliable stops", h.worst)}${rank("Most reliable stops", h.best)}</div>` : "";

  return `<div class="blk loose"><h3 class="sub g">Transit reliability</h3>
    ${grade}${headline}${scope}</div>${hours}${thresholds}${ranked}`;
}

// Every period x day type x time band the archive can be sliced by. On screen
// these are chips the reader clicks one at a time; in a report they have to sit
// side by side, because the difference between them is the finding.
function segmentGrid(m) {
  if (!m || !has(m.periods)) return "";

  const pill = (g) => {
    const c = GRADE_COLOR[g] || "#71717a";
    return g ? `<span class="gpill" style="background:${c}1f;border:1px solid ${c}55;color:${c}">${esc(g)}</span>` : "";
  };

  const table = (p) => {
    let last = null;
    const body = p.rows.map((r) => {
      const newDay = r.dayType !== last;
      last = r.dayType;
      const cls = [newDay ? "day" : "band", r.baseline ? "base" : ""].filter(Boolean).join(" ");
      return `<tr class="${cls}">
        <td class="nm">${newDay ? esc(r.dayType) : ""}</td>
        <td>${esc(r.timeBand)}</td>
        <td class="g">${pill(r.grade)}</td>
        <td class="n">${esc(r.onTime || "—")}</td>
        <td class="n">${esc(r.late || "—")}</td>
        <td class="n">${esc(r.delayMed || "—")}</td>
        <td class="n">${esc(r.delayP90 || "—")}</td>
        <td class="n">${esc(r.ewt || "—")}</td>
        <td class="n">${esc(r.headway || "—")}</td>
        <td class="n">${esc(r.matched || "—")}</td>
      </tr>`;
    }).join("");
    return `<div class="blk loose">
      <h3 class="sub">Reliability by service segment — ${esc(p.label)}</h3>
      <p class="note" style="margin:-2px 0 7px">${esc(p.from)} → ${esc(p.to)}</p>
      <table class="segtbl"><thead><tr>
        <th>Day type</th><th>Time band</th><th></th><th class="n">On time</th>
        <th class="n">Late</th><th class="n">Median</th><th class="n">P90</th>
        <th class="n">Excess wait</th><th class="n">Headway</th><th class="n">Matched</th>
      </tr></thead><tbody>${body}</tbody></table></div>`;
  };

  // Diverging hourly profile, one per day type - the shape of the day is the
  // point, so they are drawn on a shared scale and read as a small-multiple.
  let hours = "";
  if (has(m.hourly)) {
    const max = Math.max(1, ...m.hourly.flatMap((d) => d.rows.map((r) => Math.abs(r.delayMin || 0))));
    hours = `<div class="blk loose"><h3 class="sub">Delay by hour, by day type</h3>
      <div class="hgrid">${m.hourly.map((d) => `<div class="hcell">
        <div class="hcap">${esc(d.dayType)}</div>
        <div class="hours"><span class="zero"></span>${d.rows.map((r) => {
          if (r.delayMin == null) return `<span class="b"></span>`;
          const pct = Math.max(3, Math.min(48, Math.abs(r.delayMin) / max * 46));
          return `<span class="b"><i class="${r.delayMin >= 0 ? "up" : "dn"}" style="height:${pct}%"></i></span>`;
        }).join("")}</div>
        <div class="hourlab">${d.rows.filter((_, i) => i % 4 === 0)
          .map((r) => `<span>${String(r.hour).padStart(2, "0")}</span>`).join("")}</div>
      </div>`).join("")}</div>
      <p class="note" style="margin-top:9px">Median delay per service hour. Above the line is late,
        below is early. All panels share one scale, so their heights are comparable.</p></div>`;
  }

  return `<h2 class="sec g">Transit reliability by segment</h2>
    <div class="seclead">The archive is re-queried for every combination of period, day type and
      time band, over the same ${m.stopCount ? esc(m.stopCount) + " stops" : "stop set"} in the
      catchment. Shaded rows are the all-day, all-week baseline the summary above reports.</div>
    ${m.periods.map(table).join("")}${hours}
    <p class="note" style="margin-top:15px">Excess wait and scheduled headway are defined over the whole service day only,
      so they are left blank in the peak, midday and evening rows. “Matched” is the number of
      observed arrivals that could be paired with a timetabled trip in that segment; segments with
      no matched arrivals are omitted.</p>`;
}

// The per-stop detail: too long to sit inside Findings, too specific to drop.
function transitAppendix(h) {
  if (!h || !has(h.stops)) return "";
  const inner = `<table class="stoptbl wide"><thead><tr>
      <th>Stop</th><th>Routes</th><th class="n">Observed</th><th class="n">Matched</th>
      <th class="n">On time</th><th class="n">Late</th><th class="n">Median</th>
      <th class="n">P90</th><th class="n">Excess wait</th><th class="n">Headway</th>
    </tr></thead><tbody>${h.stops.map((s) => `<tr${s.thin ? ' class="thin"' : ""}>
      <td class="nm">${s.cls ? `<span class="dotcell" style="background:${CLS_COLOR[s.cls] || "#a1a1aa"}"></span>` : ""}${esc(s.name)}</td>
      <td>${esc(s.routes || "—")}</td><td class="n">${esc(s.observations || "—")}</td>
      <td class="n">${esc(s.matched || "—")}</td>
      <td class="n">${esc(s.onTime || "—")}</td><td class="n">${esc(s.late || "—")}</td>
      <td class="n">${esc(s.delayMed || "—")}</td><td class="n">${esc(s.delayP90 || "—")}</td>
      <td class="n">${esc(s.ewt || "—")}</td><td class="n">${esc(s.headway || "—")}</td>
    </tr>`).join("")}</tbody></table>
    <p class="note" style="margin-top:9px">Ordered by late share. “Observed” counts every vehicle
      position archived at the stop; “matched” counts those that could be paired with a timetabled
      trip and are the basis of every share in this table. Greyed rows fall below the
      30-matched-arrival floor and are excluded from the area grade and the rankings. The dot
      repeats the on-time colour the stop carries on the map.</p>`;
  return section(
    "Appendix A — Transit stops in the catchment",
    `Every stop inside the isochrone, with its observed arrivals and service levels over the
     ${h.filters ? esc(h.filters.period) : "reporting"} baseline window.`,
    inner, "g", false, "brk");
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
    transitHistory(f.transitHistory),
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
    findings(d.findings),
    segmentGrid(d.findings && d.findings.transitSegments),
    methodology(d.methodology),
    sources(d.sources),
    transitAppendix(d.findings && d.findings.transitHistory),
    `</div></td></tr></tbody></table>`,
  ]);

  return doc(s.title || "Urbanyx report", "body", inner);
}

module.exports = { buildCover, buildMapPage, buildBody };
