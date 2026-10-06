// Vauxhall Terminal relay — a small Cloudflare Worker you deploy yourself.
// It keeps secret keys off the public website, and routes around browser CORS limits
// for a fixed allow-list of public APIs. It is NOT an open proxy.
//
// Secrets (wrangler secret put …):  SERPAPI_KEY, X_BEARER_TOKEN, RELAY_TOKEN (optional)
// Vars (wrangler.toml):              ALLOWED_ORIGINS = "https://you.github.io,http://localhost:8080"

const FETCH_HOSTS = new Set([
  "www.reddit.com", "old.reddit.com", "api.adsb.lol", "api.airplanes.live", "opensky-network.org",
  "api.gdeltproject.org", "api.adsbdb.com", "api.planespotters.net", "hn.algolia.com",
  "eonet.gsfc.nasa.gov", "earthquake.usgs.gov", "api.frankfurter.app", "api.coingecko.com"
]);
const SERP_ENGINES = new Set(["google_flights", "google_hotels", "amazon", "ebay", "google_shopping"]);
const AI = {
  anthropic: "https://api.anthropic.com/v1", openai: "https://api.openai.com/v1", gemini: "https://generativelanguage.googleapis.com/v1beta",
  meta: "https://api.meta.ai/v1", mistral: "https://api.mistral.ai/v1", xai: "https://api.x.ai/v1", openrouter: "https://openrouter.ai/api/v1"
};
const UA = "Mozilla/5.0 (compatible; VauxhallTerminalRelay/2.0; +https://github.com/)";

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get("origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes("*") || allowed.includes(origin);
    const cors = {
      "access-control-allow-origin": okOrigin ? (allowed.includes("*") ? "*" : origin) : "null",
      "access-control-allow-headers": "content-type, authorization, x-api-key, x-goog-api-key, anthropic-version, anthropic-dangerous-direct-browser-access, x-relay-token, http-referer, x-title",
      "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-max-age": "86400", "vary": "origin"
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { ...cors, "content-type": "application/json", ...extra } });
    if (!okOrigin) return json({ error: "Origin not allowed. Add it to ALLOWED_ORIGINS.", code: "origin" }, 403);
    if (env.RELAY_TOKEN && req.headers.get("x-relay-token") !== env.RELAY_TOKEN) return json({ error: "Relay token required", code: "token" }, 401);

    const url = new URL(req.url); const p = url.pathname; const q = url.searchParams;
    const cached = async (key, ttl, fn) => {
      const cache = caches.default; const k = new Request("https://relay.cache/" + encodeURIComponent(key));
      const hit = await cache.match(k); if (hit) return new Response(hit.body, { headers: { ...cors, "content-type": "application/json", "x-cache": "hit" } });
      const body = JSON.stringify(await fn());
      ctx.waitUntil(cache.put(k, new Response(body, { headers: { "cache-control": `max-age=${ttl}` } })));
      return new Response(body, { headers: { ...cors, "content-type": "application/json" } });
    };

    try {
      if (p === "/health") return json({ ok: true, version: 2, features: { serpapi: !!env.SERPAPI_KEY, x: !!env.X_BEARER_TOKEN, telegram: true, quotes: true, fetch: true, ai: true } });

      if (p === "/serp") {
        if (!env.SERPAPI_KEY) return json({ error: "SERPAPI_KEY is not set on the relay", code: "no_serpapi" }, 501);
        const engine = q.get("engine"); if (!SERP_ENGINES.has(engine)) return json({ error: "Engine not allowed" }, 400);
        const u = new URL("https://serpapi.com/search.json"); for (const [k, v] of q) if (k !== "api_key") u.searchParams.set(k, v);
        const key = u.toString(); u.searchParams.set("api_key", env.SERPAPI_KEY);
        return cached(key, 900, async () => { const r = await fetch(u); const j = await r.json(); if (j.error) throw new Error(j.error); return j; });
      }

      if (p === "/x/search") {
        if (!env.X_BEARER_TOKEN) return json({ error: "X_BEARER_TOKEN is not set on the relay", code: "no_x" }, 501);
        const u = new URL("https://api.x.com/2/tweets/search/recent");
        u.searchParams.set("query", (q.get("q") || "").slice(0, 512)); u.searchParams.set("max_results", "50");
        u.searchParams.set("tweet.fields", "created_at,author_id,public_metrics,lang,attachments");
        u.searchParams.set("expansions", "author_id,attachments.media_keys"); u.searchParams.set("user.fields", "username,name,verified");
        u.searchParams.set("media.fields", "url,preview_image_url,type");
        return cached(u.toString(), 120, async () => { const r = await fetch(u, { headers: { authorization: "Bearer " + env.X_BEARER_TOKEN } }); const j = await r.json(); if (!r.ok) throw new Error(j.detail || j.title || "X API error " + r.status); return j; });
      }

      if (p === "/tg") {
        const c = q.get("c") || ""; if (!/^[A-Za-z0-9_]{4,64}$/.test(c)) return json({ error: "Bad channel name" }, 400);
        return cached("tg:" + c, 120, async () => {
          const html = await (await fetch(`https://t.me/s/${c}`, { headers: { "user-agent": UA } })).text();
          const dec = s => s.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();
          const posts = html.split("tgme_widget_message_wrap").slice(1).map(b => {
            const id = (b.match(/data-post="([^"]+)"/) || [])[1]; const t = (b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1];
            const ts = (b.match(/<time[^>]*datetime="([^"]+)"/) || [])[1]; const photo = (b.match(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/) || [])[1];
            return id && ts ? { url: "https://t.me/" + id, text: t ? dec(t) : "", ts: Date.parse(ts), photo } : null;
          }).filter(x => x && (x.text || x.photo)).reverse();
          return { channel: c, posts };
        });
      }

      if (p === "/quotes") {
        const syms = (q.get("s") || "").split(",").map(s => s.trim()).filter(s => /^[\^A-Z0-9=.\-]{1,15}$/i.test(s)).slice(0, 24);
        return cached("q:" + syms.join(","), 180, async () => {
          const out = {};
          await Promise.all(syms.map(async s => { try {
            const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=5d&interval=1h`, { headers: { "user-agent": UA } });
            const j = await r.json(); const m = j.chart.result[0].meta; const closes = (j.chart.result[0].indicators.quote[0].close || []).filter(x => x != null);
            const prev = m.chartPreviousClose ?? m.previousClose; const price = m.regularMarketPrice;
            out[s] = { price, prev, changePct: prev ? (price - prev) / prev * 100 : null, currency: m.currency, time: m.regularMarketTime, spark: closes.slice(-40) };
          } catch {} }));
          return { quotes: out };
        });
      }

      if (p === "/fetch") {
        const u = new URL(q.get("u") || ""); if (u.protocol !== "https:" || !FETCH_HOSTS.has(u.hostname)) return json({ error: "Host not on the relay allow-list" }, 400);
        return cached(u.toString(), 60, async () => { const r = await fetch(u, { headers: { "user-agent": UA, accept: "application/json" } }); if (!r.ok) throw new Error("Upstream " + r.status); return r.json(); });
      }

      const m = p.match(/^\/ai\/([a-z]+)$/);
      if (m && req.method === "POST") {
        let base = AI[m[1]];
        if (m[1] === "custom") { const b = new URL(q.get("base") || ""); if (b.protocol !== "https:") return json({ error: "Custom base must be https" }, 400); base = b.toString().replace(/\/$/, ""); }
        if (!base) return json({ error: "Unknown provider" }, 400);
        const path = q.get("path") || ""; if (!/^\/[\w\-./:?=&]*$/.test(path)) return json({ error: "Bad path" }, 400);
        const h = new Headers(); ["content-type", "authorization", "x-api-key", "x-goog-api-key", "anthropic-version", "http-referer", "x-title"].forEach(k => { const v = req.headers.get(k); if (v) h.set(k, v); });
        const r = await fetch(base + path, { method: "POST", headers: h, body: req.body });
        return new Response(r.body, { status: r.status, headers: { ...cors, "content-type": r.headers.get("content-type") || "application/json" } });
      }
      if (m && req.method === "GET") { // model listing
        const base = AI[m[1]]; if (!base) return json({ error: "Unknown provider" }, 400);
        const h = new Headers(); ["authorization", "x-api-key", "x-goog-api-key", "anthropic-version"].forEach(k => { const v = req.headers.get(k); if (v) h.set(k, v); });
        const r = await fetch(base + (q.get("path") || "/models"), { headers: h });
        return new Response(r.body, { status: r.status, headers: { ...cors, "content-type": "application/json" } });
      }
      return json({ error: "Not found" }, 404);
    } catch (e) { return json({ error: String(e.message || e), code: "upstream" }, 502); }
  }
};
