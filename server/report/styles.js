"use strict";
// Print stylesheet for the analysis report.
// Page box is owned by Puppeteer (A4 + margins); this file styles the content.
// The dark app palette does not transfer to paper — semantic colours are
// darkened for white stock, and every surface is opaque.
const { FONT_REGULAR, FONT_SEMIBOLD } = require("./assets");

module.exports = `
@font-face{font-family:'Google Sans';font-style:normal;font-weight:400;
  src:url(${FONT_REGULAR}) format('woff2');}
@font-face{font-family:'Google Sans';font-style:normal;font-weight:600;
  src:url(${FONT_SEMIBOLD}) format('woff2');}

:root{
  --ink:#16161a; --body:#3f3f46; --mute:#71717a; --faint:#a1a1aa;
  --rule:#e4e4e7; --rule-mid:#d4d4d8; --tint:#f7f7fa;
  --indigo:#6366f1; --violet:#8b5cf6;
  --good:#16a34a; --warn:#d97706; --hot:#ea580c; --bad:#dc2626; --sky:#0284c7;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff}
body{font-family:'Google Sans','Helvetica Neue',Helvetica,Arial,sans-serif;
  color:var(--body);font-variant-numeric:tabular-nums;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}

/* ── running header ──────────────────────────────────────
   Wrapped in a table so the print engine repeats it on every page AND
   reserves the space. A position:fixed header repeats but does not reserve,
   so content on page 2 onwards runs underneath it. */
table.doc{width:100%;border-collapse:collapse}
table.doc > thead{display:table-header-group}
table.doc > thead td,table.doc > tbody td{padding:0;border:none}
.rhead{display:flex;align-items:center;justify-content:space-between;
  padding-bottom:10px;margin-bottom:22px;border-bottom:1px solid var(--rule)}
.rhead .l{display:flex;align-items:center;gap:9px}
.rhead img{height:16px;width:auto;display:block}
.rhead .t{font-size:12px;color:var(--mute);letter-spacing:0.02em}
.rhead .t b{color:var(--ink);font-weight:600}
.flow > .sect:first-child,.flow > h2.sec:first-child{margin-top:0}

/* ── type ────────────────────────────────────────────────── */
h2.sec{font-size:19px;font-weight:600;color:var(--ink);letter-spacing:-0.005em;
  display:flex;align-items:center;gap:9px;margin-bottom:3px;break-after:avoid}
h2.sec::before{content:'';width:3px;height:17px;border-radius:1.5px;
  background:var(--indigo);flex:none}
h2.sec.v::before{background:var(--violet)}
h2.sec.g::before{background:var(--good)}
h2.sec.s::before{background:var(--sky)}
.seclead{font-size:12px;color:var(--faint);margin:0 0 14px 12px;line-height:1.5;
  break-after:avoid}
h3.sub{font-size:13px;font-weight:600;color:var(--ink);letter-spacing:0.02em;
  display:flex;align-items:center;gap:7px;margin-bottom:7px;break-after:avoid}
h3.sub::before{content:'';width:5px;height:5px;border-radius:50%;
  background:var(--mute);flex:none}
h3.sub.i::before{background:var(--indigo)}
h3.sub.o::before{background:var(--hot)}
h3.sub.g::before{background:var(--good)}
.eyebrow{font-size:10px;font-weight:600;letter-spacing:0.14em;
  text-transform:uppercase;color:var(--faint)}
p{font-size:16px;line-height:1.55;color:var(--body);text-wrap:pretty;orphans:3;widows:3}
p.note{font-size:12px;line-height:1.6;color:var(--mute)}
.blk{margin-top:22px;break-inside:avoid-page}
.blk.loose{break-inside:auto}
.sect{margin-top:26px}
.sect.brk{break-before:page;margin-top:0}
/* Sources + disclaimer travel together, so neither is orphaned onto a page alone. */
.sect.keep{break-inside:avoid}

/* ── figure tiles ────────────────────────────────────────── */
.tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;
  break-inside:avoid}
.tiles.n1{grid-template-columns:repeat(2,minmax(0,1fr))}
.tiles.n2{grid-template-columns:repeat(2,minmax(0,1fr))}
.tiles.n3{grid-template-columns:repeat(3,minmax(0,1fr))}
.tiles.n5,.tiles.n6{grid-template-columns:repeat(3,minmax(0,1fr))}
.tile{background:var(--tint);border-radius:5px;padding:17px 15px 16px 16px;
  position:relative;overflow:hidden}
.tile::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;
  background:var(--accent,#6366f1)}
.tile .v{font-size:23px;font-weight:600;color:var(--ink);line-height:1.05}
.tile .l{font-size:10px;font-weight:600;letter-spacing:0.09em;
  text-transform:uppercase;color:var(--mute);margin-top:6px}
.tile .s{font-size:11px;color:var(--faint);margin-top:2px}

/* ── livability index ────────────────────────────────────── */
.idx{margin-top:26px;border:1px solid var(--rule);border-radius:5px;overflow:hidden;
  break-inside:avoid}
.idx .hd{display:flex;align-items:center;gap:16px;padding:16px 18px;
  background:var(--tint);border-bottom:1px solid var(--rule)}
.idx .score{font-size:38px;font-weight:600;color:var(--violet);line-height:1}
.idx .score.prov{color:#a78bfa}
.idx .of{font-size:13px;color:var(--mute);margin-top:3px}
.idx .tag{display:inline-block;font-size:10px;font-weight:600;letter-spacing:0.06em;
  text-transform:uppercase;padding:3px 7px;border-radius:4px;margin-top:6px;
  background:rgba(217,119,6,0.12);color:#b45309}
.idx .grade{margin-left:auto;text-align:right}
.idx .grade .g{font-size:26px;font-weight:600;color:var(--ink);line-height:1}
.idx .grade .g.prov{color:var(--mute)}
.idx .grade .gl{font-size:11px;color:var(--mute);margin-top:3px}
.idx .bars{padding:19px 18px 21px;display:grid;gap:15px}
.bar{display:grid;grid-template-columns:104px 1fr 42px 62px;align-items:center;gap:12px}
.bar .nm{font-size:13px;color:var(--ink)}
.bar .tr{display:block;height:6px;border-radius:3px;background:#ececf1;overflow:hidden}
.bar .fl{display:block;height:6px;border-radius:3px;background:var(--violet)}
.bar .vl{font-size:13px;color:var(--ink);text-align:right}
.bar .wt{font-size:11px;color:var(--faint);text-align:right}

/* ── map ─────────────────────────────────────────────────── */
.mapplate{border:1px solid var(--rule);border-radius:4px;overflow:hidden;
  break-inside:avoid}
.mapplate img{display:block;width:100%;height:auto}
.attrib{font-size:11px;color:var(--faint);margin-top:7px}
.legend{margin-top:20px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
  gap:18px 26px;padding-top:16px;border-top:1px solid var(--rule);break-inside:avoid}
.lg .t{font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;
  color:var(--faint);margin-bottom:7px}
.lg .r{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--body);
  padding:2.5px 0}
.lg .sw{width:16px;height:7px;border-radius:2px;flex:none}
.lg .dot{width:9px;height:9px;border-radius:50%;flex:none}
.lg .n{font-size:11px;color:var(--faint);margin-top:6px;line-height:1.5}

/* ── tables ──────────────────────────────────────────────── */
table{width:100%;border-collapse:collapse}
thead{display:table-header-group}
th{font-size:10px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;
  color:var(--mute);text-align:left;padding:0 0 6px;
  border-bottom:1px solid var(--rule-mid)}
td{font-size:13px;color:var(--body);padding:7px 0;border-bottom:1px solid var(--rule)}
tr{break-inside:avoid}
tr.total td{font-weight:600;color:var(--ink);border-bottom:none;
  border-top:1px solid var(--rule-mid);padding-top:8px}
th.n,td.n{text-align:right}
.zcols th:first-child,.zcols td:first-child{width:176px}

/* ── key/value + line lists ──────────────────────────────── */
.kv{display:grid;grid-template-columns:132px 1fr;gap:3px 14px;font-size:13px}
.kv dt{color:var(--mute)} .kv dd{color:var(--ink)}
.owners{margin-top:8px;padding-top:8px;border-top:1px solid var(--rule);display:grid;gap:4px}
.owners .o{font-size:12px;color:var(--mute)}
.lines{display:grid;gap:6px;font-size:13px;color:var(--body)}
.lines .li{display:grid;grid-template-columns:190px 1fr;gap:14px}
.lines .li .k{color:var(--mute)}
.mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:11px}
.mini .m{background:var(--tint);border-radius:4px;padding:11px 13px}
.mini .m .v{font-size:18px;font-weight:600;color:var(--ink);line-height:1.1}
.mini .m .l{font-size:11px;color:var(--mute);margin-top:4px}

/* ── compliance rows ─────────────────────────────────────── */
.a16 .r{display:grid;grid-template-columns:1fr 122px 122px 86px;align-items:center;
  gap:12px;padding:9px 0;border-bottom:1px solid var(--rule);font-size:13px}
.a16 .r:last-child{border-bottom:none}
.a16 .req{color:var(--mute)} .a16 .val{color:var(--ink)}
.a16 .verdict{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;
  justify-content:flex-end}
.a16 .verdict.ok{color:var(--good)} .a16 .verdict.no{color:var(--bad)}

/* ── transit reliability, in full ───────────────────────────── */
.grade-row{display:flex;align-items:center;gap:13px;border:1px solid var(--rule);
  border-radius:5px;padding:12px 15px;margin-bottom:11px;break-inside:avoid}
.grade-row .g{width:34px;height:34px;border-radius:7px;display:flex;align-items:center;
  justify-content:center;font-size:17px;font-weight:600;flex:none}
.grade-row .t{font-size:13px;color:var(--body);flex:1}
.grade-row .p{font-size:17px;font-weight:600}
.hl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;break-inside:avoid}
.hl .c{border:1px solid var(--rule);border-radius:5px;padding:11px 12px}
.hl .v{font-size:19px;font-weight:600;color:var(--ink);line-height:1.1}
.hl .k{font-size:9.5px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;
  color:var(--mute);margin-top:6px}
.hl .s{font-size:10.5px;color:var(--faint);margin-top:2px}
.hours{display:flex;align-items:stretch;gap:2px;height:86px;margin-top:6px;
  border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);position:relative}
.hours .zero{position:absolute;left:0;right:0;top:50%;border-top:1px dashed var(--rule-mid)}
.hours .b{flex:1;position:relative}
.hours .b i{position:absolute;left:1px;right:1px;border-radius:1.5px;display:block}
.hours .b i.up{bottom:50%;background:#d97706}
.hours .b i.dn{top:50%;background:#6366f1}
.hourlab{display:flex;justify-content:space-between;font-size:9px;color:var(--faint);
  margin-top:4px}
.thr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 20px;margin-top:4px}
.thr .r{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:var(--body)}
.thr .r .k{color:var(--mute)}
.stoptbl td,.stoptbl th{font-size:11px}
.stoptbl td.nm{max-width:150px}
.stoptbl tr.thin td{color:var(--faint)}
.stoptbl.wide td,.stoptbl.wide th{font-size:10px;padding:5px 0}
.stoptbl.wide td.nm{max-width:130px}
.dotcell{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px}

/* ranked stops: sorted, and coloured along one green-to-red scale */
.rank{list-style:none;margin:2px 0 0;padding:0;display:grid;gap:9px}
.rank .it{break-inside:avoid}
.rank .hd{display:flex;align-items:baseline;gap:5px}
.rank .hd .pos{font-size:9px;font-weight:600;color:var(--faint);min-width:9px}
.rank .hd .n{font-size:11.5px;font-weight:600;color:var(--ink);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank .hd .r{font-size:9.5px;color:var(--faint);white-space:nowrap}
.rank .hd .v{margin-left:auto;font-size:11.5px;font-weight:600;white-space:nowrap}
.rank .bar{height:5px;border-radius:2.5px;background:var(--rule-mid);margin-top:4px;overflow:hidden}
.rank .bar i{display:block;height:100%;border-radius:2.5px}
.rank .sub2{font-size:10px;color:var(--mute);margin-top:2.5px}

/* segment grid: period × day type × time band */
.segtbl td,.segtbl th{font-size:10.5px;padding:5px 0}
.segtbl td.nm{color:var(--ink)}
.segtbl tr.band td{border-bottom:none}
.segtbl tr.day td{padding-top:10px}
.segtbl tr.day td.nm{font-weight:600}
.segtbl tr.base td{background:#eceef5}
.segtbl tr.base td.nm{box-shadow:inset 2px 0 0 var(--good)}
.segtbl td.g{width:20px}
.gpill{display:inline-block;min-width:15px;text-align:center;font-size:9.5px;
  font-weight:600;border-radius:3px;padding:1px 3px;line-height:1.35}
.segnote{display:flex;gap:16px;flex-wrap:wrap;margin-top:9px}
.hgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 22px;margin-top:8px}
.hgrid .hcell{break-inside:avoid}
.hgrid .hcap{font-size:10px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;
  color:var(--faint);margin-bottom:3px}
.hgrid .hours{height:56px}

/* ── callout & back matter ───────────────────────────────── */
.callout{margin-top:11px;display:flex;gap:10px;align-items:flex-start;
  background:#fdf6ec;border:1px solid #f2dfc0;border-radius:5px;padding:11px 13px;
  break-inside:avoid}
.callout .tx{font-size:12.5px;line-height:1.55;color:#7a5312}
.callout .tx b{color:#5c3d0a;font-weight:600}
.defs{display:grid;gap:12px}
.def{break-inside:avoid}
.def .t{font-size:13px;font-weight:600;color:var(--ink);margin-bottom:4px}
.def .d{font-size:12.5px;line-height:1.6;color:var(--body)}
.srcs{display:grid;gap:7px}
.src{display:grid;grid-template-columns:150px 1fr;gap:14px;font-size:12.5px;
  line-height:1.55;break-inside:avoid}
.src .k{color:var(--mute)} .src .v{color:var(--body)}
.disc{margin-top:18px;background:var(--tint);border-radius:5px;padding:14px 16px;
  break-inside:avoid}
.disc .t{font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;
  color:var(--faint);margin-bottom:7px}
.disc .d{font-size:12px;line-height:1.65;color:var(--mute)}

`;
