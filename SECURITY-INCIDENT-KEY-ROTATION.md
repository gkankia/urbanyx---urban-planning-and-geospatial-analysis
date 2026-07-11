# URGENT: Leaked Secrets — Rotation & History Purge

`server/.env` was committed to this **public** GitHub repo. Treat every secret
in it as compromised, even after the file is removed — it remains in git
history and may already be in scrapers' hands (bots index new GitHub commits
for secrets within minutes).

## 1. Rotate every key (do this FIRST, before touching git)

| Secret | Where to rotate | Notes |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard → Project Settings → API → "Reset service_role secret" | This key bypasses ALL RLS and can delete users. Highest priority. |
| `PADDLE_API_KEY` | Paddle Dashboard → Developer Tools → Authentication → revoke + create new | |
| `PADDLE_WEBHOOK_SECRET` | Paddle Dashboard → Developer Tools → Notifications → edit webhook → regenerate secret | Update Railway env at the same time or webhooks will 401. |
| `EMAILJS_PRIVATE_KEY` | EmailJS Dashboard → Account → API Keys → regenerate private key | |

After rotating, update the values in:
- `server/.env` locally (never commit it — now blocked by `.gitignore`)
- Railway → your service → Variables (SUPABASE_SERVICE_KEY, PADDLE_API_KEY,
  PADDLE_WEBHOOK_SECRET, EMAILJS_* — and confirm `ALLOWED_ORIGIN` is set)
- Supabase Edge Functions env (if you keep any of them):
  `supabase secrets set PADDLE_WEBHOOK_SECRET=...`

Also check Supabase Dashboard → Logs for suspicious activity (unexpected
deletes, mass reads) since the first commit date.

## 2. Purge the file from git history

The working tree is already fixed (`.gitignore` added, files untracked).
To scrub history, from the repo root:

```bash
# install once:  brew install git-filter-repo
git filter-repo --invert-paths --path server/.env --path server/node_modules --force

# filter-repo removes the origin remote as a safety measure; re-add and force-push:
git remote add origin https://github.com/gkankia/urbanyx---urban-planning-and-geospatial-analysis.git
git push origin --force --all
git push origin --force --tags
```

Then on GitHub:
- Settings → check for open forks (history persists in forks — contact
  GitHub Support to purge cached views if any exist)
- Consider making the repo private until the audit fixes are deployed.

## 3. Verify

```bash
git log --all --oneline -- server/.env     # should print nothing
git ls-files | grep -E "\.env$|node_modules" | wc -l   # should be 0
```

Old keys stop working the moment you rotate — step 1 alone neutralizes the
leak; steps 2–3 are cleanup.

Delete this file once all three steps are done.
