# Report payload contract

`POST /api/report/pdf` — `Authorization: Bearer <supabase access token>`, Pro only.
Body is a single JSON object assembled by the frontend from whatever is active
on the map. **Every field is optional.** A section with no data is not rendered:
no heading, no placeholder, no gap. That is the whole point — the export mirrors
the map.

Response is `application/pdf` as an attachment.

```jsonc
{
  "lang": "ka",                        // "ka" | "en" — picks the cover artwork

  "issued": "6 September 2026",        // already formatted for the report language
  "filename": "urbanyx_report",        // sanitised server-side
  "siteLabel": "urbanyx.zaxis.ge",     // stamped in the page footer

  "subject": {
    "title": "ზაქარია ფალიაშვილის ქუჩა 82", // Mapbox reverse geocode, locale-formatted
    "place": "ვაკე, თბილისი",          // from the geocode context, local name first
    "parcelCode": "01.14.09.023",      // omit when no parcel is selected
    "areaLabel": "2,480 m²",
    "dominantZone": "Residential mixed-use", // only when zoning is active
    "analysesLabel": "Relief · Solar", // used when there is no parcel/zone
    "reportId": "Report 2026-09-06-0114"
  },

  "preparedFor": "…",                  // omitted entirely when absent
  "preparedBy": "…",

  // One CLEAN capture — no baked-in legend. It appears once, on the Map page,
  // which renders the legend from the data below. The cover is typographic.
  "map": {
    "dataUrl": "data:image/jpeg;base64,…",   // png or jpeg, ≤ 8 MB of base64
    "caption": "Study area and selected parcel.",
    "legend": [
      { "title": "Zoning", "note": "optional footnote",
        "rows": [ { "color": "#8b5cf6", "label": "Residential — 68%" },
                  { "color": "#16a34a", "shape": "dot", "label": "On time" },
                  { "label": "no swatch, text only" } ] }
    ]
  },

  "tiles": [                            // 0–6; 1–3 use a narrower grid
    { "value": "74/100", "label": "Livability", "sub": "Grade B", "color": "#8b5cf6" }
  ],

  "summary": "Prose assembled per clause — omit when nothing has data.",

  "uvi": {                              // omit unless _lastNearbyCounts exists
    "name": "Urban Livability Index",
    "score": 74, "grade": "B", "gradeLabel": "good",
    "partial": false,                   // true → provisional marker, per _computeUVI
    "parts": [ { "label": "Education", "score": 82, "weight": "1.0" } ]
  },

  "findings": {
    "ownership":  { "rows": [["Parcel code","01.14.09.023"]],
                    "owners": [{ "name": "…", "id": "…", "type": "legal entity" }] },
    "zoning":     { "multi": true, "hasCoefficients": true, "noDev": true,
                    "setback": { "label": "312 m² (13% of parcel)" },
                    "zones":  [{ "name": "…", "pct": "68%", "k1": "0.50", "k2": "2.50",
                                 "k3": "0.20", "footprint": "843", "floorArea": "4,216",
                                 "greening": "337", "height": "5 fl" }],
                    "totals": { "footprint": "1,061", "floorArea": "5,089",
                                "greening": "647", "height": "4 fl" } },
    "article16":  { "note": "…",
                    "rows": [{ "requirement": "Minimum width", "required": "required 18.0 m",
                               "actual": "actual 41.3 m", "verdict": "ok" }] },
                    // verdict: "ok" | "below" | null (null renders no mark)
    "permits":    { "rows": [["Latest application","02-24-1187"]],
                    "conflict": true, "conflictText": "…" },
    "street":     { "rows": [["Connectivity","…"]] },
    "relief":     { "rows": [["Active layer","Slope"]] },
    "energy":     { "rows": [["Solar","…"]] },
    "climate":    { "rows": [["Tree canopy","23% covered"]] },
    "mobility":   { "headline": [{ "value": "11 stops · 7 routes", "label": "…" }],
                    "rows": [["Parking split","…"]] },
    // Transit reliability in full — see "Depth" below.
    "transitHistory": {
      "coverage": { "firstDate": "3 June 2026", "days": "96" },
      "window":   { "from": "2026-08-08", "to": "2026-09-06" },
      "filters":  { "period": "30 days", "dayType": "Weekdays", "timeBand": "All day" },
      "grade": "B", "onTimePct": 74,
      "headline": [{ "label": "On time", "value": "74%", "sub": "of matched arrivals" }],
      "totals": { "matched": 18422, "observations": 52140, "onTime": 13632, "late": 3180 },
      "thresholds": [{ "label": "On-time share", "bands": ["≥80%","60–80%","<60%"] }],
      "hourly": [{ "hour": 6, "delayMin": 1.2, "matched": 840 }],
      "worst": [ /* stop rows */ ], "best": [ /* stop rows */ ],
      "stops": [{ "name": "…", "routes": "4, 12", "matched": "240", "observations": "700",
                  "onTime": "79%", "late": "20%", "delayMed": "+5.2 min",
                  "delayP90": "+13.3 min", "ewt": "+2.5 min", "headway": "18.7 min",
                  "onTimeNum": 79, "lateNum": 20,   // ranked lists colour by these
                  "thin": false, "cls": "warn" }],
      "stopCount": 20, "thinCount": 4
    },
    // The same archive re-queried across every slice the panel can show.
    "transitSegments": {
      "stopCount": 23,
      "periods": [{ "days": 30, "label": "30 days", "from": "2026-08-07", "to": "2026-09-05",
        "rows": [{ "dayType": "Weekdays", "timeBand": "PM peak", "dayKey": "weekday",
                   "bandKey": "pm_peak", "grade": "E", "onTime": "49%", "late": "49%",
                   "delayMed": "+2.5 min", "delayP90": "+12.2 min",
                   "ewt": null, "headway": null,          // all-day rows only
                   "matched": "1,136", "stops": 23, "thin": 0,
                   "baseline": false }] }],
      "hourly": [{ "dayType": "Weekdays", "dayKey": "weekday",
                   "rows": [{ "hour": 6, "delayMin": 1.2, "matched": 840 }] }]
    },
    "amenities":  { "rows": [["Schools","3"]] },
    "realestate": { "note": "…",
                    "rows": [{ "type": "Flat", "priceSqm": "₾3,840",
                               "rent": "₾1,450", "listings": "284" }] }
  },

  // Street-level frames. The client sends URLs and camera geometry only; the
  // server downloads, re-projects and inlines them. See "Street imagery" below.
  "streetImagery": {
    "images": [{
      "id": "1098419091535107",
      "url": "https://…/thumb_original",     // Mapillary or fbcdn host, https only
      "cameraType": "spherical",             // spherical | fisheye | perspective
      "cameraParams": [0.45, 0.061, 0.0007], // [focal, k1, k2]; null for spherical
      "rotation": [0.29, -1.75, 2.12],       // computed_rotation, world→camera angle-axis
      "compass": 156.6,                      // fallback when rotation is absent
      "bearing": 207.4,                      // camera → site, degrees from north
      "caption": "15 m north-east of the site · looking south-west · Sept 2023",
      "link": "https://www.mapillary.com/app/?pKey=…"
    }],
    "note": "…", "credit": "…"
  },

  "methodology": [ { "title": "…", "body": "…" } ],  // one per ACTIVE analysis
  "sources":     [ { "label": "…", "text": "…" } ]   // in order of appearance
}
```

## The cover

Page 1 is finished artwork from `design-system/report-covers`, one file per
language, rendered full bleed with no page margins and no stamped footer.
**Nothing on it is templated** — it carries no address, no parcel code and no
issue date beyond the year set into the artwork itself. `lang` is the only
input.

`server/report/assets/` holds both the source `.svg` and a pre-rasterised
300 dpi `.jpg`. The renderer prefers the JPEG: it avoids re-parsing ~0.8 MB of
SVG on every export, and it avoids the hairline seams Chromium leaves at the
edges of the artwork's clip groups when the SVG is drawn as vector. Delete the
JPEGs and the SVGs are used instead, seams and all. If the artwork changes,
replace both — a 300 dpi export (2480 × 3508) from the design tool is enough.

## The map

The map gets its own **landscape A4 page**, full bleed, immediately after the
cover — a wide capture on a portrait page is only ever a third of it. The
legend is drawn as a card over the map rather than beneath it, for the same
reason.

The capture is cropped client-side to the landscape page aspect (297:210), and
`_rptCaptureMap` pads its `fitBounds` by exactly the strips that crop will
discard, so nothing the report describes falls outside the frame. It is sent at
up to 2600 px wide — about 222 dpi across 297 mm, enough to read street labels
in print.

Send **one clean capture**: no baked legend, but the parcel outline and the pin
are drawn into it by `_rptCaptureMap`, so the page adds neither.

## Depth

An analysis sends everything it computed, not a summary of it. Transit
reliability is the reference implementation: the panel's A–F area grade, its
four headline metrics, the observation window and filters that produced them,
the archive coverage, the hourly delay profile, the four map thresholds, the
ranked best and worst stops, and **every stop as an appendix table** — ordered
by late share, with rows under the 30-matched-arrival floor greyed and excluded
from the grade and the rankings.

Transit goes one step further, because its archive is *segmented*: the panel
shows one slice at a time (period × day type × time band) and the difference
between those slices is the finding — a corridor can be a B all day and an E in
the evening peak. `_rptTransitMatrix()` therefore re-queries
`transit_history_stats` for every combination (2 periods × 4 day types × 5 time
bands, bounded to 5 concurrent calls, dropping the 7-day comparison when the
archive is shorter than that or the catchment needs chunked stop sets) plus
`transit_history_hourly` once per day type, and the report prints the whole
grid. Every number the report quotes outside that grid comes from the **baseline
slice** — deepest period, all days, all day — not from whichever chips the user
happened to leave selected on screen.

The other analyses still send summary lines. They are to be brought up to this
shape one at a time, each mirroring what its panel actually holds.

## Street imagery

Mapillary's Tbilisi coverage is mostly 360-degree spherical frames, with fisheye
and plain perspective mixed in. Printed as they are, all three reproduce the
camera rather than the place: the panorama bends every straight line, the fisheye
bulges, and both are shot from a moving car, so the horizon is rolled and tilted.

`streetview.js` undoes that. The reconstruction's `computed_rotation` is the
world-to-camera rotation (angle-axis; world is East/North/Up, camera +Z is the
optical axis, +Y is down) and `camera_parameters` is OpenSfM's normalised
`[focal, k1, k2]`. For each output pixel the server builds a world-space ray —
level, aimed at the site — rotates it into the camera, and projects it through
that camera's own model to find the source pixel. The result is rectilinear:
straight lines straight, horizon level, view facing the parcel rather than
wherever the car was going.

Resolution is protected by sampling the **original** frame, never a thumbnail. A
70-degree view off a 7680-wide equirectangular draws on ~1500 source pixels, so
the 1400 px render is a genuine 1400 px — about 300 dpi at the width it prints.
Only the source region the view touches is decoded.

Frames are dropped rather than printed badly. A fisheye or perspective camera
cannot be re-aimed beyond what it saw, so the client filters by the angle between
the camera's compass and the site, and the server shrinks the field of view until
the view is fully covered, giving up below 97%. A frame that comes back
featureless — aiming at the site put a blank wall in front of the lens — is
dropped on an edge-energy check. Five candidates are sent so that four can
survive.

## Notes

- **The address is reverse-geocoded, not taken from the registry.** Mapbox
  returns the street already declined for the language ("სამტრედიის ქუჩა 18")
  and the surrounding places as structured context, so nothing is re-ordered
  here. The registry string is the fallback, and remains what the Ownership
  section reports, since that section is sourced to NAPR.
- **All values arrive pre-formatted as strings.** The server does no number
  formatting, unit conversion or localisation — the frontend already knows the
  report language and the app's own conventions.
- **Colours** must be `#rgb`/`#rrggbb`; anything else falls back to a neutral.
  This is the only styling the client can influence. The ranked-stop gradient is
  the exception: it is computed server-side from `onTimeNum`, along a ramp
  anchored on the same 80 / 60 breaks the map legend uses, so a stop's colour
  means the same thing in the report as it does on screen.
- **The map capture must carry no legend.** Send the legend as `map.legend` so
  the Map page can typeset it. The capture is used once, in that section.
- Sending an empty `findings`, `methodology` and `sources` produces a valid
  two-page report: cover plus whatever front matter has data.
