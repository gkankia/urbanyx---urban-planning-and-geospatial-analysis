/**
 * Urbanyx — Cloudflare Worker
 * Proxies: PDF downloads, Supabase writes, NAPR WMS tiles, WorldCover/LST COGs, TTC transit
 *
 * Env vars (Cloudflare Dashboard → Settings → Variables):
 *   SUPABASE_URL = https://yikkligsbpzhznhkibow.supabase.co
 *   SUPABASE_KEY = sb_secret_... (secret key — NOT the publishable key)
 *   MAPBOX_TOKEN = pk.eyJ... (optional, used by action:"config")
 *
 * SECURITY MODEL for action:"supabase":
 *   1. The caller must present a valid Supabase user access token
 *      (Authorization: Bearer <jwt>) — verified against /auth/v1/user.
 *   2. Only three whitelisted operations are forwarded (see SUPABASE_RULES).
 *   Everything else is rejected. The service key never trusts client paths.
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ── WMS tile proxy (GET) ──────────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/wms") {
      const z = parseInt(url.searchParams.get("z"));
      const x = parseInt(url.searchParams.get("x"));
      const y = parseInt(url.searchParams.get("y"));
      if (isNaN(z) || isNaN(x) || isNaN(y)) {
        return new Response("Missing z/x/y", { status: 400, headers: corsHeaders });
      }
      const n = Math.pow(2, z);
      const west  = (x / n) * 2 * Math.PI - Math.PI;
      const east  = ((x + 1) / n) * 2 * Math.PI - Math.PI;
      const north = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
      const south = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));
      const R = 6378137;
      const bbox = [
        west  * R,
        Math.log(Math.tan(Math.PI / 4 + south / 2)) * R,
        east  * R,
        Math.log(Math.tan(Math.PI / 4 + north / 2)) * R
      ].join(",");
      const layers = url.searchParams.get("layers") || "cite:LR_PARCELS_transparent";
      const wmsUrl = `https://nv.napr.gov.ge/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap` +
        `&LAYERS=${layers}&FORMAT=image/png&TRANSPARENT=true` +
        `&SRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX=${bbox}`;
      try {
        const res = await fetch(wmsUrl, {
          headers: { "Referer": "https://maps.gov.ge/", "Origin": "https://maps.gov.ge" }
        });
        const img = await res.arrayBuffer();
        return new Response(img, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" }
        });
      } catch(e) {
        return new Response("WMS fetch failed", { status: 502, headers: corsHeaders });
      }
    }

    // ── WorldCover COG proxy (GET) ────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/worldcover") {
      const tileUrl = url.searchParams.get("url");
      if (!tileUrl || !tileUrl.startsWith("https://esa-worldcover.s3.eu-central-1.amazonaws.com/")) {
        return new Response("Invalid URL", { status: 400, headers: corsHeaders });
      }
      try {
        const res = await fetch(tileUrl, { headers: { "Range": request.headers.get("Range") || "" } });
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", res.headers.get("Content-Type") || "image/tiff");
        headers.set("Accept-Ranges", "bytes");
        headers.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
        const contentRange = res.headers.get("Content-Range");
        if (contentRange) headers.set("Content-Range", contentRange);
        const contentLength = res.headers.get("Content-Length");
        if (contentLength) headers.set("Content-Length", contentLength);
        return new Response(res.body, { status: res.status, headers });
      } catch(e) {
        return new Response("WorldCover fetch failed", { status: 502, headers: corsHeaders });
      }
    }

    // ── LST COG proxy (GET) ───────────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/lst") {
      const tileUrl = url.searchParams.get("url");
      if (!tileUrl || !tileUrl.startsWith("https://pub-9071f31b4edc4a15ba28c48f949017fc.r2.dev/")) {
        return new Response("Invalid URL", { status: 400, headers: corsHeaders });
      }
      try {
        const res = await fetch(tileUrl, { headers: { "Range": request.headers.get("Range") || "" } });
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", "image/tiff");
        headers.set("Accept-Ranges", "bytes");
        headers.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
        const cr = res.headers.get("Content-Range"); if (cr) headers.set("Content-Range", cr);
        const cl = res.headers.get("Content-Length"); if (cl) headers.set("Content-Length", cl);
        return new Response(res.body, { status: res.status, headers });
      } catch(e) {
        return new Response("LST fetch failed", { status: 502, headers: corsHeaders });
      }
    }

    // ── TTC Transit proxy (GET) ───────────────────────────────────────────────
    if (request.method === "GET" && url.pathname.startsWith("/ttc/")) {
      const TTC_API = "https://transit.ttc.com.ge/pis-gateway/api/v2";
      const TTC_HDR = {
        "Accept": "application/json",
        "x-api-key": "c0a2f304-551a-4d08-b8df-2c53ecd57f9f",
        "Referer": "https://transit.ttc.com.ge/",
        "Origin": "https://transit.ttc.com.ge",
        "User-Agent": "Mozilla/5.0"
      };
      const parts = url.pathname.split("/").filter(Boolean);
      let ttcUrl, cacheSeconds = 0;

      if (parts.length === 2 && parts[1] === "stops") {
        ttcUrl = `${TTC_API}/stops?locale=ka`;
        cacheSeconds = 3600;
      } else if (parts.length === 4 && parts[1] === "stops" && parts[3] === "routes") {
        const stopId = decodeURIComponent(parts[2]);
        ttcUrl = `${TTC_API}/stops/${encodeURIComponent(stopId)}/routes?locale=ka`;
        cacheSeconds = 300;
      } else if (parts.length === 4 && parts[1] === "stops" && parts[3] === "arrivals") {
        const stopId = decodeURIComponent(parts[2]);
        ttcUrl = `${TTC_API}/stops/${encodeURIComponent(stopId)}/arrival-times?locale=ka&ignoreScheduledArrivalTimes=false`;
        cacheSeconds = 0;
      } else if (parts.length === 4 && parts[1] === "routes" && parts[3] === "schedule") {
        const routeId = decodeURIComponent(parts[2]);
        const fwd = url.searchParams.get("forward"); // direction-dependent
        ttcUrl = `${TTC_API}/routes/${encodeURIComponent(routeId)}/schedule${fwd !== null ? `?forward=${encodeURIComponent(fwd)}` : ""}`;
        cacheSeconds = 3600;
      } else if (parts.length === 4 && parts[1] === "routes" && parts[3] === "polyline") {
        const routeId = decodeURIComponent(parts[2]);
        const fwd = url.searchParams.get("forward"); // direction-dependent
        ttcUrl = `${TTC_API}/routes/${encodeURIComponent(routeId)}/polyline${fwd !== null ? `?forward=${encodeURIComponent(fwd)}` : ""}`;
        cacheSeconds = 3600;
      } else if (parts.length === 3 && parts[1] === "v3" && parts[2] === "routes") {
        const modes = url.searchParams.get("modes") || "BUS,SUBWAY,GONDOLA";
        ttcUrl = `https://transit.ttc.com.ge/pis-gateway/api/v3/routes?modes=${encodeURIComponent(modes)}&locale=ka`;
        cacheSeconds = 300;
      } else if (parts.length === 4 && parts[1] === "v3" && parts[2] === "routes") {
        const routeId = decodeURIComponent(parts[3]);
        ttcUrl = `https://transit.ttc.com.ge/pis-gateway/api/v3/routes/${encodeURIComponent(routeId)}?locale=ka`;
        cacheSeconds = 300;
      } else if (parts.length === 5 && parts[1] === "v3" && parts[2] === "routes" && parts[4] === "positions") {
        const routeId = decodeURIComponent(parts[3]);
        const ps = url.searchParams.get("patternSuffixes") || "";
        ttcUrl = `https://transit.ttc.com.ge/pis-gateway/api/v3/routes/${encodeURIComponent(routeId)}/positions?patternSuffixes=${encodeURIComponent(ps)}`;
        cacheSeconds = 0;
      }
      else {
        return new Response("Not found", { status: 404, headers: corsHeaders });
      }

      try {
        const resp = await fetch(ttcUrl, { headers: TTC_HDR });
        const body = await resp.text();
        const h = { ...corsHeaders, "Content-Type": "application/json" };
        if (cacheSeconds > 0) h["Cache-Control"] = `public, max-age=${cacheSeconds}`;
        else h["Cache-Control"] = "no-store";
        return new Response(body, { status: resp.status, headers: h });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: corsHeaders });
      }
    }

    // ── Construction permits: spatial lookup (GET) ────────────────────────────
    // /permits/search?x=<lon>&y=<lat>  → forwards to ms.gov.ge search-by-xy
    if (request.method === "GET" && url.pathname === "/permits/search") {
      const x = parseFloat(url.searchParams.get("x"));
      const y = parseFloat(url.searchParams.get("y"));
      if (isNaN(x) || isNaN(y)) {
        return new Response(JSON.stringify({ error: "Missing x/y" }), { status: 400, headers: corsHeaders });
      }
      try {
        const resp = await fetch("https://ms.gov.ge/core-api/v1/search/search-by-xy", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "Origin": "https://ms.gov.ge", "Referer": "https://ms.gov.ge/" },
          body: JSON.stringify({ lrIds: [261644], x, y, zoom: 17 }),
        });
        const data = await resp.text();
        return new Response(data, { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: corsHeaders });
      }
    }

    // ── Construction permits: detail by docId (GET) ───────────────────────────
    // /permits/detail?docId=<digits> → the public detail page is a DWR/ExtJS app,
    // so the real data lives behind a DWR call. We invoke it server-side and
    // return a small JSON { nomenclature, cadastral } (the raw reply is ~800KB).
    if (request.method === "GET" && url.pathname === "/permits/detail") {
      const docId = (url.searchParams.get("docId") || "").replace(/\D/g, "");
      if (!docId) return new Response(JSON.stringify({ error: "Missing docId" }), { status: 400, headers: corsHeaders });
      try {
        const dwrBody =
          "callCount=1\n" +
          `page=/architect/public.html?docId=${docId}\n` +
          "httpSessionId=\n" +
          "scriptSessionId=\n" +
          "windowName=\n" +
          "c0-id=0\n" +
          "c0-scriptName=UserMethods\n" +
          "c0-methodName=getUserDocumentLastMotion\n" +
          `c0-param0=number:${docId}\n` +
          "batchId=0\n";
        const resp = await fetch("https://docs.tbilisi.gov.ge/architect/dwr/call/plaincall/UserMethods.getUserDocumentLastMotion.dwr", {
          method: "POST",
          headers: { "Content-Type": "text/plain", "User-Agent": "Mozilla/5.0", "Referer": `https://docs.tbilisi.gov.ge/architect/public.html?docId=${docId}` },
          body: dwrBody,
        });
        const raw = await resp.text();
        // Cadastral codes are ASCII in the raw reply
        const cadastral = [...new Set(raw.match(/\d{2}\.\d{2}\.\d{2}\.\d{3}\.\d{3}/g) || [])];
        // Nomenclature lives in a nomenklaturMarkup HTML string (unicode-escaped)
        let nomenclature = "";
        const nm = raw.match(/nomenklaturMarkup:"((?:[^"\\]|\\.)*)"/);
        if (nm) {
          const markup = nm[1]
            .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
            .replace(/\\\//g, "/").replace(/\\n/g, " ").replace(/\\"/g, '"');
          const items = [...markup.matchAll(/<li>(.*?)<\/li>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
          nomenclature = items.length
            ? items.join(" | ")
            : markup.replace(/<[^>]+>/g, " ").replace(/ნომენკლატურა\s*:\s*/, "").replace(/\s+/g, " ").trim();
        }
        return new Response(JSON.stringify({ nomenclature, cadastral }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: corsHeaders });
      }
    }

    // ── Construction permits: decision by docId (GET) ─────────────────────────
    // /permits/decision?docId=<digits> → NewArchitectureResponse. That endpoint
    // returns EITHER a PDF (older docs) or an HTML page (newer docs) with the
    // same fields. HTML we parse here → JSON; PDF we hand back as base64 for the
    // client to parse with PDF.js. Either way: registration/issue date + result.
    if (request.method === "GET" && url.pathname === "/permits/decision") {
      const docId = (url.searchParams.get("docId") || "").replace(/\D/g, "");
      if (!docId) return new Response(JSON.stringify({ error: "Missing docId" }), { status: 400, headers: corsHeaders });
      try {
        const resp = await fetch(`https://docs.tbilisi.gov.ge/NewArchitectureResponse?documentId=${docId}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const buf = await resp.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
        const cache = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" };
        if (isPdf) {
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          return new Response(JSON.stringify({ format: "pdf", base64: btoa(binary) }), { status: 200, headers: cache });
        }
        const plain = new TextDecoder("utf-8").decode(bytes).replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
        const dateAfter = label => { const m = plain.match(new RegExp(label + "[^0-9]{0,20}(\\d{1,2}[\\/.]\\d{1,2}[\\/.]\\d{4})")); return m ? m[1].replace(/\./g, "/") : ""; };
        const registered = dateAfter("შემოსვლის თარიღი");
        const issued = dateAfter("გაცემის თარიღი");
        const rm = plain.match(/შედეგი\s*:?\s*([ა-ჰ]+)/);
        return new Response(JSON.stringify({ format: "html", registered, issued, result: rm ? rm[1] : "" }), { status: 200, headers: cache });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: corsHeaders });
      }
    }

    // ── POST-only routes below ────────────────────────────────────────────────
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    let body;
    try { body = await request.json(); }
    catch(e) { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders }); }

    const { action } = body;

    // ── Config ────────────────────────────────────────────────────────────────
    if (action === "config") {
      return new Response(JSON.stringify({ mapboxToken: env.MAPBOX_TOKEN }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── PDF proxy ─────────────────────────────────────────────────────────────
    if (action === "pdf") {
      const { url: pdfUrl } = body;
      let pdfHost = "";
      try { pdfHost = new URL(pdfUrl).hostname; } catch(_) {}
      // Hostname check (not substring) — blocks e.g. https://evil.com/napr.gov.ge
      const pdfHostOk =
        pdfHost.endsWith(".napr.gov.ge") || pdfHost === "napr.gov.ge" ||
        pdfHost === "docs.tbilisi.gov.ge";
      if (!pdfHostOk) {
        return new Response(JSON.stringify({ error: "Invalid URL" }), { status: 400, headers: corsHeaders });
      }
      try {
        const pdf    = await fetch(pdfUrl);
        const buf    = await pdf.arrayBuffer();
        const bytes  = new Uint8Array(buf);
        let binary   = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return new Response(JSON.stringify({ base64: btoa(binary) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    // ── Supabase proxy (authenticated + whitelisted) ──────────────────────────
    if (action === "supabase") {
      // 1. AUTHENTICATE: require a valid Supabase user session token
      const authHeader = request.headers.get("Authorization") || "";
      const userToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!userToken) {
        return new Response(JSON.stringify({ error: "Sign-in required" }), { status: 401, headers: corsHeaders });
      }
      let user = null;
      try {
        const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
          headers: { "apikey": env.SUPABASE_KEY, "Authorization": `Bearer ${userToken}` }
        });
        if (authRes.ok) user = await authRes.json();
      } catch(_) {}
      if (!user?.id) {
        return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401, headers: corsHeaders });
      }

      // 2. WHITELIST: only the three operations the app performs are forwarded
      const { path, method, sbBody, prefer } = body;
      const m = (method || "POST").toUpperCase();
      const isPlainObject = v => v !== null && typeof v === "object" && !Array.isArray(v);
      const OWNER_KEYS = ["cadastral", "owner_name", "owner_id", "owner_type"];

      const allowed =
        // Upsert one parcel record
        (m === "POST" && path === "/rest/v1/parcels"
          && isPlainObject(sbBody) && typeof sbBody.cadastral === "string"
          && (prefer === undefined || prefer === "" || prefer === "resolution=merge-duplicates"))
        ||
        // Replace owners: delete by cadastral…
        (m === "DELETE" && /^\/rest\/v1\/owner_ids\?cadastral=eq\.[^&?]+$/.test(path)
          && sbBody === undefined)
        ||
        // …then insert the new owner rows
        (m === "POST" && path === "/rest/v1/owner_ids"
          && Array.isArray(sbBody) && sbBody.length <= 100
          && sbBody.every(o => isPlainObject(o)
              && typeof o.cadastral === "string"
              && Object.keys(o).every(k => OWNER_KEYS.includes(k))));

      if (!allowed) {
        return new Response(JSON.stringify({ error: "Operation not allowed" }), { status: 403, headers: corsHeaders });
      }

      try {
        const res = await fetch(`${env.SUPABASE_URL}${path}`, {
          method: m,
          headers: {
            "Content-Type": "application/json",
            "apikey": env.SUPABASE_KEY,
            "Authorization": `Bearer ${env.SUPABASE_KEY}`,
            "Prefer": prefer || "resolution=merge-duplicates"
          },
          body: sbBody ? JSON.stringify(sbBody) : undefined
        });
        const data = await res.text();
        return new Response(data, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
  }
};
