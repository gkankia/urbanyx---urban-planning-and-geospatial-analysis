# Mapbox Token Domain Restriction

The token `pk.eyJ1Ijoiam9yam9uZTkwIi...` is embedded in both `app.js`
(as `MAPBOX_TOKEN`) and in `style.css` (as static image URLs for basemap
thumbnails). Since this is a public-key format token, it cannot be kept
secret — but it **must** be restricted to your domain so it cannot be
used by third parties.

## Steps (takes ~2 minutes)

1. Go to [https://account.mapbox.com/access-tokens/](https://account.mapbox.com/access-tokens/)
2. Find the token used in this project (starts with `pk.eyJ1Ijoiam9yam9uZTkwIi...`)
3. Click the token name to open its settings
4. Under **Allowed URLs**, add:
   ```
   https://urbanyx.zaxis.ge
   ```
   Add `http://localhost` for local development too.
5. Click **Save**

Once domain-restricted, requests from any other origin (e.g. someone
copy-pasting the token into their own app) will receive a 401 and the
map will not load for them.

## Note on CSS static URLs

The `style.css` basemap thumbnail images use this token in their URLs.
These are loaded server-side by Mapbox Static Images API, which also
respects token domain restrictions. After restricting the token, verify
the four thumbnails still load in the layers panel.
