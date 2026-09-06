# Deploying the report renderer

The renderer needs a headless Chromium. `npm i` pulls one via `puppeteer`, but
the container also needs the shared libraries Chromium links against — a stock
Node image does not have them, and the failure looks like
`error while loading shared libraries: libnss3.so`.

## Railway (nixpacks)

`server/nixpacks.toml` is committed with this module. If your Railway service
builds from the repo root rather than `server/`, move it there — the file is:

```toml
[phases.setup]
nixPkgs = ["nodejs", "chromium"]
aptPkgs = [
  "libnss3", "libatk1.0-0", "libatk-bridge2.0-0", "libcups2", "libdrm2",
  "libxkbcommon0", "libxcomposite1", "libxdamage1", "libxfixes3", "libxrandr2",
  "libgbm1", "libasound2", "libpango-1.0-0", "libcairo2"
]

[variables]
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true"
PUPPETEER_EXECUTABLE_PATH = "/nix/var/nix/profiles/default/bin/chromium"
```

Using the system Chromium (rather than Puppeteer's own download) keeps the
image smaller and the build faster. `compose.js` honours
`PUPPETEER_EXECUTABLE_PATH` through Puppeteer's own env handling.

## Memory

Measured on a 2-vCPU container, rendering the full report (every analysis
active, 8 pages) five times through one reused browser:

| | PSS |
|---|---|
| Idle browser, no render in flight | ~128 MB |
| Peak during a render | ~256 MB |
| Settles back to | ~137 MB |

PSS, not RSS. Summing RSS across the Chromium process tree reads about 770 MB
for the same work, but that counts shared pages once per process — it is not
what the container consumes. Use PSS (`/proc/*/smaps_rollup`) if you measure
this yourself.

Render time was 0.7–0.9 s per report on those 2 vCPUs, so throughput is not the
constraint; peak memory is.

**Sizing.** 512 MB works with one render at a time and not much headroom.
1 GB is comfortable. `compose.js` serialises renders through a promise queue for
exactly this reason — the browser is launched once and reused, and two reports
never render concurrently. `strictLimiter` bounds request rate but not
concurrency, so do not remove the queue as an optimisation.

`--disable-dev-shm-usage` is already set: without it Chromium crashes in
containers, where `/dev/shm` defaults to 64 MB.

## Health

The browser is lazily launched on the first report and reused. If it dies, the
next request relaunches it. `closeBrowser()` is exported for graceful shutdown:

```js
process.on("SIGTERM", async () => { await closeBrowser(); process.exit(0); });
```
