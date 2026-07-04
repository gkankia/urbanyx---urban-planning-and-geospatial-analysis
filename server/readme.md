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