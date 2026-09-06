# Report payload contract

`POST /api/report/pdf` — `Authorization: Bearer <supabase access token>`, Pro only.
Body is a single JSON object assembled by the frontend from whatever is active
on the map. **Every field is optional.** A section with no data is not rendered:
no heading, no placeholder, no gap. That is the whole point — the export mirrors
the map.

Response is `application/pdf` as an attachment.

```jsonc
{
  // Project lockup, rasterised client-side from analysis-logos/urbanyx-zaxis-logo.svg.
  // Falls back to the app icon in the template when absent.
  "brand": { "logo": "data:image/png;base64,…", "w": 440, "h": 0 },

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
    "amenities":  { "rows": [["Schools","3"]] },
    "realestate": { "note": "…",
                    "rows": [{ "type": "Flat", "priceSqm": "₾3,840",
                               "rent": "₾1,450", "listings": "284" }] }
  },

  "methodology": [ { "title": "…", "body": "…" } ],  // one per ACTIVE analysis
  "sources":     [ { "label": "…", "text": "…" } ]   // in order of appearance
}
```

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
  This is the only styling the client can influence.
- **The map capture must carry no legend.** Send the legend as `map.legend` so
  the Map page can typeset it. The capture is used once, in that section.
- Sending an empty `findings`, `methodology` and `sources` produces a valid
  two-page report: cover plus whatever front matter has data.
