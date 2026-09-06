"use strict";
// POST /api/report/pdf — renders the analysis report for a Pro user.
//
// The frontend assembles the payload from whatever is active on the map; this
// route only authorises, bounds the request, and renders.
const express = require("express");
const { renderReport } = require("./compose");

// A report carries one inlined map JPEG, so the body is large by design but
// not unbounded.
const MAX_BODY = "12mb";
const MAX_MAP_CHARS = 8 * 1024 * 1024;

function reportRouter({ requireAuth, limiter, isPro }) {
  const router = express.Router();

  router.post("/pdf", limiter, requireAuth, express.json({ limit: MAX_BODY }), async (req, res) => {
    try {
      if (isPro && !(await isPro(req))) {
        return res.status(402).json({ error: "Report export requires a Pro plan" });
      }
      const p = req.body;
      if (!p || typeof p !== "object") {
        return res.status(400).json({ error: "Missing payload" });
      }
      if (p.map && typeof p.map.dataUrl === "string") {
        if (p.map.dataUrl.length > MAX_MAP_CHARS) {
          return res.status(413).json({ error: "Map image too large" });
        }
        if (!/^data:image\/(png|jpeg);base64,/.test(p.map.dataUrl)) {
          return res.status(400).json({ error: "Map image must be an inline PNG or JPEG" });
        }
      }

      const pdf = await renderReport(p);
      const name = (p.filename || "urbanyx_report").replace(/[^a-z0-9_\-]/gi, "_").slice(0, 80);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${name}.pdf"`);
      res.setHeader("Content-Length", pdf.length);
      return res.end(pdf);
    } catch (err) {
      console.error("[report] render failed:", err);
      return res.status(500).json({ error: "Report generation failed" });
    }
  });

  return router;
}

module.exports = { reportRouter };
