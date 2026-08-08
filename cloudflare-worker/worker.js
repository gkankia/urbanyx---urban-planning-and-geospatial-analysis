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

    // ── Photorealistic building render (Gemini 2.5 Flash Image) ─────────────────
    // Body: { action:"render", image:<dataURL|base64 of the 3D massing>, prompt, lang }
    if (action === "render") {
      const jsonRes = (o, s = 200) => new Response(JSON.stringify(o), {
        status: s, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
      const key = env.GEMINI_API_KEY;
      if (!key) return jsonRes({ error: "Rendering is not configured (missing GEMINI_API_KEY)." }, 500);
      let { image, mask, prompt, lang, style } = body;
      if (!image || !prompt) return jsonRes({ error: "Missing image or prompt." }, 400);
      prompt = String(prompt).slice(0, 1200).trim();
      const b64 = image.includes(",") ? image.split(",")[1] : image;
      const maskB64 = mask ? (mask.includes(",") ? mask.split(",")[1] : mask) : null;
      const GLM = "https://generativelanguage.googleapis.com/v1beta/models";

      // 1) Translate Georgian → English for reliable architectural rendering
      let enPrompt = prompt;
      if (lang === "ka" || /[Ⴀ-ჿ]/.test(prompt)) {
        try {
          const tr = await fetch(`${GLM}/gemini-2.5-flash:generateContent?key=${key}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text:
              `Translate this architectural rendering instruction to concise, vivid English. Return ONLY the translation, no quotes or notes:\n\n${prompt}` }] }] })
          });
          if (tr.ok) {
            const tj = await tr.json();
            const t = (tj?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
            if (t) enPrompt = t;
          }
        } catch (_) {}
      }

      // 2) Build the instruction. Two subjects: an extruded 3D building massing, or a
      //    flat plot/area (parcel or un-extruded drawing) to design on. Photorealistic
      //    is a LOCALIZED edit (subject + ~5 m, surroundings preserved); the artistic
      //    styles restyle the whole view in that medium while keeping the geometry.
      const isExtruded = body.extruded === true;
      const hasMask = !!maskB64;
      const subject = isExtruded
        ? "the extruded building massing in the centre of the image"
        : (hasMask ? "the plot indicated by the WHITE area of the second (mask) image" : "the plot in the centre of the image");
      const keepGeom = isExtruded
        ? "Preserve the building's footprint shape, proportions, number of floors, overall height and the exact camera angle — do not distort its proportions. Use the 3 m setback strip between the building and the plot boundary for landscaping only — lawn, trees, bushes, hedges and a fence. Respect the ground slope and integrate with the surroundings. "
        : (hasMask
            ? "A second image is provided as a MASK: white marks the buildable area (it already reflects a 3 m setback inside the plot boundary), black marks areas to leave unchanged. Place the new design ONLY inside the white area, matching its exact size, shape, orientation and scale; do not extend beyond it. Fill the 3 m setback ring between the white area and the plot boundary with landscaping only — lawn, trees, bushes, hedges and a fence. The mask is guidance only — do NOT reproduce the mask, any coloured region or any outline/boundary line in the output. Respect the existing ground slope and terrain (sit the design naturally on the sloping ground with correct grading), and integrate it with the surrounding buildings, streets and vegetation. Keep the same scale, perspective and camera angle so it is realistically proportioned. "
            : "Fit the new design entirely within the plot, use its 3 m perimeter for landscaping, respect the ground slope, and match the surrounding scale and perspective; keep the exact camera angle. ");
      let instruction;
      if (style === "sketch") {
        instruction = "Redraw " + subject + " as a hand-drawn architectural sketch — confident pen and pencil line work, light hatching for shade, loose expressive style on a clean white paper background, with the immediate surroundings suggested in light sketch lines. " +
          keepGeom + "Design direction: " + enPrompt + ". Architectural concept sketch, not photorealistic.";
      } else if (style === "watercolor") {
        instruction = "Render " + subject + " as a loose architectural watercolour illustration — soft washes, gentle colour bleeds, visible paper texture, light pencil under-drawing, airy background with the immediate context suggested softly. " +
          keepGeom + "Design direction: " + enPrompt + ". Architectural watercolour painting.";
      } else if (style === "plan" || style === "drawing") {
        instruction = "Render " + subject + " as a clean architectural line drawing / technical illustration — precise dark line work on a white background, subtle tonal shading, drafting/blueprint style, no photographic textures, minimal context. " +
          keepGeom + "Design direction: " + enPrompt + ". Technical architectural drawing.";
      } else {
        // photoreal (default) — localized edit, surroundings untouched
        instruction =
          "This is a localized image edit of an aerial/oblique map view. " +
          "Apply changes ONLY to " + subject + " and the plot's own 3 m landscaping setback. " +
          "Create a photorealistic result there following the design direction — realistic materials, planting, paving, lighting and soft natural shadows as appropriate. " +
          keepGeom +
          "CRITICAL: keep the ENTIRE rest of the image exactly as in the input — neighbouring buildings, roads, pavements, vegetation, cars, terrain, sky and overall lighting must remain pixel-for-pixel unchanged. Do NOT restyle, relight or regenerate the background. " +
          "Blend the new design naturally into the untouched surroundings (matching perspective, scale, shadows and light direction). " +
          "Design direction: " + enPrompt + ". Photorealistic, high-detail architectural/landscape result.";
      }
      try {
        const reqParts = [{ text: instruction }, { inline_data: { mime_type: "image/png", data: b64 } }];
        if (maskB64) reqParts.push({ inline_data: { mime_type: "image/png", data: maskB64 } });
        const gr = await fetch(`${GLM}/gemini-2.5-flash-image:generateContent?key=${key}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: reqParts }],
            generationConfig: { responseModalities: ["IMAGE"] }
          })
        });
        if (!gr.ok) { const et = await gr.text(); return jsonRes({ error: "Render failed", detail: et.slice(0, 400) }, 502); }
        const gj = await gr.json();
        const parts = gj?.candidates?.[0]?.content?.parts || [];
        const imgPart = parts.find(p => p.inline_data || p.inlineData);
        const outB64 = imgPart && (imgPart.inline_data?.data || imgPart.inlineData?.data);
        if (!outB64) return jsonRes({ error: "No image returned by the model." }, 502);
        return jsonRes({ image: `data:image/png;base64,${outB64}`, prompt: enPrompt });
      } catch (e) {
        return jsonRes({ error: "Render error", detail: String(e).slice(0, 200) }, 502);
      }
    }

    // ── Generative concept site plan (Gemini structured JSON) ─────────────────
    // Body: { action:"concept", prompt, lang, constraints:{ widthM, heightM, maxFootprintM2,
    //   maxFloorAreaM2, maxHeightM } }  → returns { summary, buildings:[...], trees:[...] }
    // Coordinates are normalized 0..1 in the parcel bbox (x: west→east, y: south→north).
    if (action === "concept") {
      const jsonRes = (o, s = 200) => new Response(JSON.stringify(o), {
        status: s, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
      const key = env.GEMINI_API_KEY;
      if (!key) return jsonRes({ error: "Concept generation is not configured (missing GEMINI_API_KEY)." }, 500);
      let { prompt, lang, constraints } = body;
      prompt = String(prompt || "").slice(0, 800).trim();
      const cs = constraints || {};
      const GLM = "https://generativelanguage.googleapis.com/v1beta/models";

      // Translate Georgian brief → English
      let enPrompt = prompt;
      if (prompt && (lang === "ka" || /[Ⴀ-ჿ]/.test(prompt))) {
        try {
          const tr = await fetch(`${GLM}/gemini-2.5-flash:generateContent?key=${key}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: `Translate to concise English, return only the translation:\n\n${prompt}` }] }] })
          });
          if (tr.ok) { const tj = await tr.json(); const t = (tj?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim(); if (t) enPrompt = t; }
        } catch (_) {}
      }

      const maxFloors = cs.maxHeightM ? Math.max(1, Math.floor(cs.maxHeightM / 3)) : 12;
      const instruction =
        "You are an urban design assistant proposing a concept site layout for one parcel. " +
        "Coordinate space: normalized 0..1 within the parcel's bounding box, where x=0 is west, x=1 east, y=0 south, y=1 north. " +
        `The parcel is roughly ${Math.round(cs.widthM||60)} m (E–W) by ${Math.round(cs.heightM||60)} m (N–S). ` +
        (cs.maxFootprintM2 ? `Total building footprint must not exceed ${Math.round(cs.maxFootprintM2)} m² (K1). ` : "") +
        (cs.maxFloorAreaM2 ? `Total floor area should not exceed ${Math.round(cs.maxFloorAreaM2)} m² (K2). ` : "") +
        `Maximum building height is about ${Math.round(cs.maxHeightM||maxFloors*3)} m (~${maxFloors} floors). ` +
        "Keep ALL buildings within the central ~85% of the parcel (leave a setback margin for landscaping). " +
        "Leave generous open space and place 6–20 trees in the open areas, never on top of buildings. " +
        (enPrompt ? `Design brief: ${enPrompt}. ` : "Design a sensible mixed development. ") +
        "Respond ONLY as JSON with this shape: " +
        `{"summary": string, "buildings": [{"cx": number, "cy": number, "w": number, "d": number, "rot": number, "floors": integer, "use": "residential"|"commercial"|"office"|"mixed"|"amenity"}], "trees": [{"x": number, "y": number}]}. ` +
        "cx/cy are the building centre (normalized 0..1); w and d are width and depth in metres; rot is rotation in degrees; x/y are normalized tree positions.";
      try {
        const gr = await fetch(`${GLM}/gemini-2.5-flash:generateContent?key=${key}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: instruction }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
          })
        });
        if (!gr.ok) { const et = await gr.text(); return jsonRes({ error: "Concept failed", detail: et.slice(0, 400) }, 502); }
        const gj = await gr.json();
        const txt = (gj?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
        let concept;
        try { concept = JSON.parse(txt); }
        catch (_) { const m = txt.match(/\{[\s\S]*\}/); concept = m ? JSON.parse(m[0]) : null; }
        if (!concept || !Array.isArray(concept.buildings)) return jsonRes({ error: "Model returned no usable layout." }, 502);
        return jsonRes(concept);
      } catch (e) {
        return jsonRes({ error: "Concept error", detail: String(e).slice(0, 200) }, 502);
      }
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
