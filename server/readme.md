 # Parcel Viewer — Full System Setup

## Stack
- **Frontend**: Single HTML file (Supabase JS SDK, Mapbox GL)
- **Auth**: Supabase Auth (email/password + Google OAuth)
- **Database**: Supabase Postgres (profiles, subscriptions, parcels)
- **Backend**: Node.js + Express (auth middleware, payment webhooks)
- **Payment**: Stripe or LemonSqueezy (plug in when ready)

---

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `supabase-schema.sql` in full
3. Go to **Authentication → Providers**:
   - Enable **Email** (confirm emails on/off — your choice)
   - Enable **Google** → add your Google OAuth Client ID + Secret
     (create credentials at [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials)
4. Go to **Authentication → URL Configuration**:
   - Set **Site URL** to your domain (e.g. `https://yourdomain.com`)
   - Add to **Redirect URLs**: `https://yourdomain.com`
5. Copy from **Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY` (safe to expose in frontend)
   - `service_role` key → `SUPABASE_SERVICE_KEY` (server only — never expose)
   - `JWT Secret` → `SUPABASE_JWT_SECRET`

---

## 2. Server setup

```bash
cd parcel-system
npm install express cors @supabase/supabase-js dotenv
```

Create `.env`:
```
PORT=3001
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret
ALLOWED_ORIGIN=https://yourdomain.com

# Fill when you pick a payment provider:
PAYMENT_PROVIDER=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_VARIANT_ID=
```

Run:
```bash
node server.js
```

For production use [PM2](https://pm2.keymetrics.io/) or a systemd service:
```bash
npm install -g pm2
pm2 start server.js --name parcel-viewer
pm2 save && pm2 startup
```

---

## 3. Frontend setup

In `parcel-viewer.html`, replace the three constants at the top:
```js
const SUPABASE_URL      = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
const SERVER_URL        = "https://YOUR_SERVER_DOMAIN.com";
```

Serve the HTML file from your web server (nginx, caddy, etc.) or host
it on Cloudflare Pages / Netlify as a static file.

---

## 4. Payment provider (when ready)

### Option A: Stripe

1. Create account at [stripe.com](https://stripe.com)
2. Create a **Product** → add a **recurring Price** (monthly)
3. Copy the Price ID (e.g. `price_xxx`) → `STRIPE_PRO_PRICE_ID`
4. Copy Secret Key → `STRIPE_SECRET_KEY`
5. In Stripe Dashboard → **Webhooks** → add endpoint:
   `https://YOUR_SERVER/webhooks/stripe`
   Listen for: `checkout.session.completed`, `invoice.payment_succeeded`,
   `customer.subscription.updated`, `customer.subscription.deleted`
6. Copy Webhook Signing Secret → `STRIPE_WEBHOOK_SECRET`
7. Set `PAYMENT_PROVIDER=stripe` in `.env`

### Option B: LemonSqueezy

1. Create account at [lemonsqueezy.com](https://lemonsqueezy.com)
2. Create a **Store** → add a **Product** (subscription, monthly)
3. Copy Store ID → `LEMONSQUEEZY_STORE_ID`
4. Copy Variant ID → `LEMONSQUEEZY_VARIANT_ID`
5. Go to **Settings → API** → generate API key → `LEMONSQUEEZY_API_KEY`
6. Go to **Settings → Webhooks** → add:
   `https://YOUR_SERVER/webhooks/lemonsqueezy`
   Events: `subscription_created`, `subscription_cancelled`,
   `subscription_expired`, `subscription_payment_success`, `order_created`
7. Copy Signing Secret → `LEMONSQUEEZY_WEBHOOK_SECRET`
8. Set `PAYMENT_PROVIDER=lemonsqueezy` in `.env`

---

## 5. Auth flow overview

```
User clicks "Analyse Walkability"
         │
    Signed in?  ──No──→  Auth modal (sign in / sign up / Google)
         │                      │
        Yes                 onAuthSuccess()
         │                  fetch /api/me → get plan
         │
    Plan = pro? ──No──→  Paywall modal → /api/checkout → Stripe/LS URL
         │                      │
        Yes              Webhook fires → subscriptions table updated
         │
    runAnalysis()
```

---

## 6. Database tables

| Table | Purpose |
|---|---|
| `profiles` | User display info (name, avatar). Auto-created on sign-up. |
| `subscriptions` | Plan status per user. Only server can write via service key. |
| `parcels` | Cached parcel data from maps.gov.ge |
| `owner_ids` | Extracted owner IDs from registry PDFs. Pro-only read. |
| `analysis_results` | Optional: cached walkability scores. Pro-only read. |

RLS ensures:
- Users can only read their own profile and subscription
- `subscriptions` writes are blocked for all clients — only the server (service role key) can upgrade/downgrade plans, preventing plan spoofing from the browser

---

## 7. Adding more features later

The system is structured so adding new paid features is minimal:

**New analysis type (e.g. school data)**:
1. Add the analysis function to `parcel-viewer.html`
2. Gate it with `onAnalyseClick()` pattern — check `currentUser.plan === "pro"`

**New plan tier (e.g. Enterprise)**:
1. Add `'enterprise'` to the `plan` column check constraint in Supabase
2. Add a new price in Stripe/LemonSqueezy
3. Add a new `/api/checkout-enterprise` endpoint
4. Update `requirePro` middleware or add `requireEnterprise`

**Usage limits (e.g. 10 analyses/month on free)**:
1. Add an `analysis_count` + `reset_at` column to `subscriptions`
2. Increment in `runAnalysis()` via a server endpoint
3. Gate based on count before running
---

## 8. Myhome.ge listing mirror

Mirrors the public myhome.ge real-estate feed into Supabase so the map layer
queries our own Postgres instead of a third party on every pan.

**Files**

| File | Role |
|---|---|
| `server/myhome-api.js` | API client, enum dictionaries, `normalize()`, pin sanity check |
| `server/cron-myhome-collector.js` | discovery + enrichment + delist sweep |
| `supabase/myhome-schema.sql` | tables, indexes, RLS, `myhome_listings_bbox()` RPC |

### The API

Undocumented but public — it's what myhome.ge's own frontend calls. No auth; the
only required header is `X-Website-Key: myhome`.

```
GET https://api-statements.tnet.ge/v1/statements/count
GET https://api-statements.tnet.ge/v1/statements?page=1&per_page=500
GET https://api-statements.tnet.ge/v1/statements/{id}
GET https://api-statements.tnet.ge/v1/statements/statement-parameters
```

Filters (verified against `/count`): `deal_types`, `real_estate_types`, `cities`,
`districts`, `urbans`, `statuses`, `conditions`, `room_types`, `bedroom_types`,
`price_from`/`price_to` + `currency_id`, `area_from`/`area_to`,
`floor_from`/`floor_to`. Note `rooms` and `bedrooms` are silently ignored —
it's `room_types` and `bedroom_types`, and those ids are **not** counts
(`room_type_id` 7 means 6 rooms).

### Why two phases

The list endpoint returns `lat`/`lng` only when `per_page <= 3`; at 4 or more the
fields are dropped from the payload entirely. That's deterministic and clearly
deliberate, so the collector treats it as a limit to respect, not a puzzle to
route around:

- **discovery** — list endpoint, everything except coordinates. Sorted
  `last_updated DESC`, so an *incremental* pass stops at the previous watermark:
  a quiet hour is 1–2 requests, and it never pages deep.

  A *backfill* can't simply page to the end. Pagination is offset-based and
  degrades hard with depth — measured on the live feed at `per_page=20`:
  offset 0 → 0.6 s, offset 25k → 2.4 s, offset 60k+ → 10.6 s, and `per_page>=200`
  past offset 25k times out outright. Paging the corpus that way would take
  ~19 hours and fail before finishing. So `--backfill` **partitions** by
  city → district → urban → property type → deal type → room count, and finally
  bisects on price when the categorical dimensions run out (Saburtalo apartment
  rentals alone are 46,571 rows; they decompose into 27 slices, largest 4,661).
  A narrow slice stays fast at any page depth. Measured end to end on Kutaisi:
  **73 rows/s**, so the full ~344k corpus is roughly 2 hours.
- **enrichment** — detail endpoint, one request per listing, only for rows with
  no coordinates yet. Coordinates don't change after publication, so it's a
  one-off cost per listing. Budget it with `MYHOME_ENRICH_PER_RUN` and scope it
  with `MYHOME_FILTERS`.

At the default 300/run every 20 min that's ~21k listings/day of geocoding —
Tbilisi's ~293k listings take about two weeks to fill in. Raise the budget if
you need it faster, but the client throttles itself to ~3 req/s regardless.

### Pins are unreliable

A meaningful share of listings are geocoded to the wrong part of the country —
one Gldani flat in the sample sits 11 km away in Old Tbilisi. `normalize()`
measures each pin against the centroid of the listing's own urban/district/city
and writes `geo_offset_m` + `geo_suspect`. Correct pins land within a few hundred
metres. The bbox RPC excludes suspect pins by default; pass
`p_include_suspect => true` to see them.

### Running it

```bash
cd server
cp .env.example .env          # set SUPABASE_* and MYHOME_SYNC_ENABLED=true

# 1. create the tables — paste supabase/myhome-schema.sql into the SQL Editor

# 2. sanity check the fetch path, writes nothing
node cron-myhome-collector.js --dry-run

# 3. one full discovery sweep — run it in a terminal you can leave open (~2 h).
#    Resumable: every finished slice is logged, so a re-run skips what's done.
#    Add --restart to force it to begin again from scratch.
node cron-myhome-collector.js --backfill

# 4. coordinates, in batches (the cron does this too, once the server is up)
node cron-myhome-collector.js --enrich
```

`MYHOME_ENRICH_PRIORITY_TYPES` decides what gets coordinates first — it is set
to `4` (land plots), so the ~19.5k plots geocode in about a day and the
parcel-analysis feature is usable long before the full corpus is mapped.
Everything else is enriched after the priority queue drains.

After that `server.js` runs both phases on schedule, plus a weekly sweep that
marks listings absent for 30 days as `delisted_at` (nothing is ever hard-deleted,
so time-on-market and price history stay analysable).

### Consuming it from the map

```js
// app.js — one round trip per viewport, GeoJSON assembled in Postgres
async function loadMyhome() {
  const b = map.getBounds();
  const { data, error } = await sb.rpc('myhome_listings_bbox', {
    min_lng: b.getWest(),  min_lat: b.getSouth(),
    max_lng: b.getEast(),  max_lat: b.getNorth(),
    p_deal_type: 1,               // 1 sale · 2 rent · 3 lease · 7 daily
    p_property_type: 1,           // 1 apartment · 2 house · 4 plot · 5 commercial
    p_max_price_usd: 150000,
    p_limit: 2000
  });
  if (error) return console.error('[myhome]', error.message);

  if (!map.getSource('myhome')) {
    map.addSource('myhome', { type: 'geojson', data, cluster: true, clusterRadius: 50 });
    map.addLayer({
      id: 'myhome-pts', type: 'circle', source: 'myhome',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': 5,
        'circle-color': ['interpolate', ['linear'], ['coalesce', ['get', 'price_per_sqm_gel'], 0],
                          0, '#2b8cbe', 3000, '#f6a623', 8000, '#d7191c'],
        'circle-stroke-width': 1, 'circle-stroke-color': '#fff'
      }
    });
  } else {
    map.getSource('myhome').setData(data);
  }
}
map.on('moveend', loadMyhome);
```

`myhome_urban_stats` is a ready-made view of median/p10/p90 GEL per m² by
neighbourhood and deal type — that's the layer to drive a choropleth from.

### Before this goes to production

The API is public but undocumented, and there's no published licence for the
data. Worth having someone read myhome.ge's terms before Urbanyx depends on it
commercially. Two things the collector deliberately does not do: it doesn't touch
`/v1/statements/phone/show` (owner phone numbers are personal data under the
Georgian PDP law and the GDPR — resolve them on demand if you ever need them,
don't warehouse them), and it doesn't defeat the `per_page` coordinate limit.

### 8.1 Isochrone analysis

`supabase/myhome-isochrone-rpc.sql` (run after `myhome-schema.sql`) adds PostGIS,
a generated `geom` column, and the two RPCs the parcel-analysis panel calls.

**Why the mirror is not optional here.** The myhome API has no geographic filter
— bbox, bounds, ne/sw, lat ranges, polygon, radius and five other spellings all
return the unfiltered total. Combined with coordinates being withheld above
`per_page=3`, answering "what's inside this isochrone" live would mean fetching
every candidate listing's detail on every user click. There is no live path.

```js
const iso = await (await fetch(
  `https://api.mapbox.com/isochrone/v1/mapbox/walking/${lng},${lat}` +
  `?contours_minutes=15&polygons=true&access_token=${MAPBOX_TOKEN}`)).json();

const { data } = await sb.rpc('myhome_area_stats', {
  area_geojson: iso.features[0].geometry,   // Polygon or MultiPolygon both work
  p_property_type: 4,                       // 4 = land plot; omit for all types
  p_min_sample: 5,
  p_max_age_days: 365
});

// data.stats[i] → { property_type, n, median_sqm_gel, p25_sqm_gel, p75_sqm_gel,
//                   median_price_gel, median_area_m2, reliable }
// data.coverage → { mapped_in_area, not_geocoded_yet, pins_rejected }
```

`myhome_area_listings()` takes the same polygon and returns the individual
listings as GeoJSON, so the panel can show what a median was computed from.

Three things the RPC does that matter for the numbers being right:

- **Suspect pins are excluded.** A listing geocoded 11 km from its own district
  would otherwise land in the wrong isochrone and move the median.
- **Hectares are normalised.** Plots are sometimes listed in Ha, and myhome's
  `price_square` follows the listed unit — so a plot reports GEL per *hectare*
  in the same field an apartment reports GEL per m². On the test corpus, ignoring
  this put the land median at 153 GEL/m² instead of the correct 68.
- **Coverage is reported.** `not_geocoded_yet` is the enrichment backlog in the
  same neighbourhoods. Show it — a median over 200 of 2,000 local listings should
  not be presented with the same confidence as one over 1,900.

Medians, not means: asking prices have a long right tail. `reliable` is false
below `p_min_sample` (default 5) — surface the range or nothing at all rather
than a median of three.

Measured on a 300k-row table: ~25 ms for a 15-minute walking isochrone holding
~2,100 listings, GiST index-backed.

### 8.2 Cadastral codes → parcels

Land-plot listings carry their NAPR cadastral code in the detail endpoint's
`rs_code` field. Measured on a 71-plot sample: **~63 % of plots have one, and
apartments essentially never do** — it's a plot-level key. `rs_code` is
detail-only, so the enrichment pass already picks it up at no extra cost.

The field is free text, so `parseCadastralCodes()` in `myhome-api.js` handles
what's actually in it:

- both legitimate shapes — 4-segment regional (`27.15.42.174`) and 5-segment
  urban (`01.72.14.095.073`), plus the odd 4-digit tail (`72.16.25.1023`)
- several codes in one field, space- or slash-separated — one listing covering
  adjoining parcels (`69.04.54.204   69.04.54.211   69.04.54.212`)
- a stray 3-digit leading segment (`001.72.…`), normalised back to two
- codes that appear in the `address` field instead of `rs_code`

Stored as `rs_codes text[]` (GIN-indexed) with `rs_code_primary` for the simple
case. Run `supabase/myhome-cadastral-link.sql`, then:

```sql
SELECT myhome_link_parcels();        -- returns (attempted, linked)
SELECT * FROM myhome_cadastral_coverage;
```

**Why this is worth more than a nicer join.** A matched listing stops depending
on myhome's pin entirely:

- `geom_best` prefers the registry parcel's centroid over the advertised pin, so
  isochrone containment is decided by where the land actually is. Both RPCs use
  it, and `stats[].n_from_registry` reports how many of the listings behind a
  median came from registry geometry rather than a pin.
- Listings we flagged `geo_suspect` are **rescued** rather than dropped, if their
  cadastral code matches. `myhome_cadastral_coverage.bad_pins_rescued` counts them.
- `myhome_area_discrepancies` lists plots where the advertised area disagrees
  with the registry's by more than 15 % — a genuine finding to surface in the
  analysis panel, and a smoke test that the join is hitting the right parcels.

Run the coverage view before wiring any of this into the UI. If `match_pct` comes
back low, the likely cause is code shape: myhome carries both the 4- and
5-segment forms, and a parcel import holding only one will silently miss the
other. That's a normalisation fix on the parcels side, not a myhome problem.

`myhome_link_parcels()` marks misses as attempted so it doesn't retry them
forever. After growing the parcel import, reset them:

```sql
UPDATE myhome_listings SET parcel_linked_at = NULL WHERE parcel_geom IS NULL;
```

Deployment order is `myhome-schema.sql` → `myhome-isochrone-rpc.sql` →
`myhome-cadastral-link.sql`. The last one is safe to run before the `parcels`
table exists — it notices and does nothing.
