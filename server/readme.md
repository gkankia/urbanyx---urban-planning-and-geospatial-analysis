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

- **discovery** — list at `per_page=500`, everything except coordinates.
  ~700 requests covers the whole ~344k corpus. Sorted `last_updated DESC`, so an
  incremental pass stops at the previous watermark; a quiet hour is 1–2 requests.
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

# 3. one full discovery sweep (do this once, by hand)
node cron-myhome-collector.js --backfill

# 4. coordinates, in batches
node cron-myhome-collector.js --enrich
```

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
