# Urbanyx design system

The Urbanyx interface language, extracted from `style.css` and packaged as standalone preview
pages so it can be pushed to a [Claude Design](https://claude.ai/design) design-system project
and reused when generating new screens.

```
design-system/
  build.mjs        # inlines base.css + Google Sans woff2 + logo PNGs as data URIs
  src/
    base.css       # the tokens — edit here
    *.html         # preview sources, each starting with a @dsCard marker
  dist/            # built, fully self-contained previews  ← this is what syncs
```

## Contents

| Card | Group | Covers |
|---|---|---|
| `brand` | Brand | Logo lockup, mark alone, clearspace, mark blue, Z.axis endorsement |
| `color` | Foundations | Brand, canvas, five-step text ramp, semantic, data scales |
| `typography` | Foundations | Google Sans UI + tabular mono, full size scale |
| `surfaces` | Foundations | Four glass tiers, radius, hairlines, motion curves |
| `buttons` | Components | Primary, Pro, tinted, ghost, danger, search, icon rail |
| `search` | Components | Hero bar, focused + suggestions, docked, matched-place chip |
| `panels` | Components | Side panel, card, layers flyout, data panel, project cards |
| `data-display` | Components | Score donut, stat grid, badges, legends, status pills |
| `controls` | Components | Switches, segmented toggle, dual range, tool rail |
| `overlays` | Components | Modal, onboarding card, tooltip, empty state |

## Build

```bash
node design-system/build.mjs
```

Every file in `dist/` is a single self-contained HTML document — real Google Sans embedded as a
woff2 data URI, the real logo PNGs embedded too, no network requests. Open one directly in a
browser to check it before syncing.

Each source file **must** begin with its card marker on line 1:

```html
<!-- @dsCard group="Components" name="Buttons" subtitle="Primary, Pro, tinted, icon" -->
```

`build.mjs` fails the file if that line is missing — that marker is what builds the card index in
the Claude Design pane.

## Sync to Claude Design

One-time auth (skip if your claude.ai login already has design scopes):

```bash
claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp
# then, inside Claude Code:
/design-login
```

Then, from the repo root:

```bash
node design-system/build.mjs
# inside Claude Code:
/design-sync
```

Point it at `design-system/dist`. It diffs against the remote project, shows you the exact list of
paths it will write, and only uploads after you approve. The target project must have been created
as a **design system** — that type is fixed at creation, so pushing into a regular Design project
will not convert it.

Sync is incremental and component-by-component. Re-run the build and `/design-sync` after editing
`src/base.css` or any preview.

## Conventions worth keeping

- **Dark only.** Every surface is translucent over a live Mapbox basemap. There is no light theme.
- **Violet is state, indigo is structure.** A selected tool is violet; a switch that turns a layer
  on is indigo. Never both on one surface.
- **Text is white at five opacities**, never grey hex values — opacity lets the basemap through
  consistently.
- **Numbers are mono and tabular** — but only numeric-only cells. Mixed cells that also hold
  addresses or owner names stay in Google Sans so Georgian text renders.
- **One white button per surface.**
- **The mark's blue (`#004AAD`) is asset-only** and never enters the interface palette.
