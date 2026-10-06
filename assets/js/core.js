// Vauxhall Terminal — core utilities
export const CFG = Object.assign({
  appName: "Vauxhall Terminal",
  googleClientId: "",      // OAuth client ID (public, safe to commit)
  relayUrl: "",            // your Cloudflare Worker relay, e.g. https://vt-relay.you.workers.dev
  country: "NL",           // default market for shopping / food
  currency: "EUR",
  amazonDomain: "amazon.nl",
  ebayDomain: "ebay.com",
  language: "en"
}, window.VT_CONFIG || {});

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const decodeEntities = s => { const t = document.createElement("textarea"); t.innerHTML = s ?? ""; return t.value; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const uid = (n = 10) => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map(x => a[x % a.length]).join(""); };

/* ---------- local storage (namespaced, JSON) ---------- */
const NS = "vt2:";
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { console.warn("store", e); } },
  del(k) { try { localStorage.removeItem(NS + k); } catch {} },
  keys() { try { return Object.keys(localStorage).filter(k => k.startsWith(NS)).map(k => k.slice(NS.length)); } catch { return []; } }
};
export const setting = (k, d) => store.get("set:" + k, CFG[k] ?? d);
export const setSetting = (k, v) => { store.set("set:" + k, v); bus.dispatchEvent(new CustomEvent("settings", { detail: { k, v } })); };
export const bus = new EventTarget();
export const me = () => store.get("me") || { id: null, callsign: "AGENT" };

/* ---------- formatting ---------- */
export const fmt = (n, d = 2) => n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
export const money = (n, cur = setting("currency")) => n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-GB", { style: "currency", currency: cur || "EUR", maximumFractionDigits: n >= 100 ? 0 : 2 });
export const pct = c => c == null || isNaN(c) ? "" : `<span class="c ${c >= 0 ? "up" : "dn"}">${c >= 0 ? "▲" : "▼"} ${fmt(Math.abs(c))}%</span>`;
export const ago = t => { const s = (Date.now() - t) / 1000; if (s < 45) return "now"; if (s < 3600) return Math.floor(s / 60) + "m"; if (s < 86400) return Math.floor(s / 3600) + "h"; return Math.floor(s / 86400) + "d"; };
export const dshort = d => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const tshort = d => new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export const dur = m => m == null ? "—" : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
export const tag = (kind, text) => `<span class="tag ${kind}">${esc(text)}</span>`;
export const empty = (title, body = "", action = "") => `<div class="empty"><b>${esc(title)}</b>${body}${action ? `<div style="margin-top:10px">${action}</div>` : ""}</div>`;
export const errBox = msg => `<div class="err">${esc(msg)}</div>`;
export const isoDate = (d = new Date()) => d.toLocaleDateString("en-CA");
export const addDays = (n, d = new Date()) => new Date(d.getTime() + n * 864e5);

/* ---------- toast ---------- */
export function toast(msg, kind = "") {
  let host = $("#toasts"); if (!host) { host = document.createElement("div"); host.id = "toasts"; document.body.appendChild(host); }
  const t = document.createElement("div"); t.className = "toast " + kind; t.textContent = msg; t.setAttribute("role", "status");
  host.appendChild(t); setTimeout(() => t.classList.add("out"), 4200); setTimeout(() => t.remove(), 4800);
}

/* ---------- script / style loading ---------- */
const loaded = {};
export const loadScript = src => loaded[src] ||= new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error("Failed to load " + src)); document.head.appendChild(s); });
export const loadCSS = href => loaded[href] ||= new Promise(res => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = res; l.onerror = res; document.head.appendChild(l); });
export async function leaflet() {
  await loadCSS("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js");
  return window.L;
}
export async function makeLeaflet(el, center = [52.37, 4.9], zoom = 13) {
  const L = await leaflet();
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(center, zoom);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' }).addTo(map);
  new ResizeObserver(() => map.invalidateSize()).observe(el);
  return map;
}
export async function globeLib() {
  await loadScript("https://cdn.jsdelivr.net/npm/globe.gl@2/dist/globe.gl.min.js");
  return window.Globe;
}
export async function makeGlobe(el, opts = {}) {
  const G = await globeLib();
  let g;
  try { g = new G(el, { animateIn: false }); if (typeof g === "function") g = g(el); } catch { g = G()(el); }
  g.globeImageUrl("https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg")
   .bumpImageUrl("https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png")
   .backgroundColor("rgba(0,0,0,0)")
   .atmosphereColor("#7FA8D9").atmosphereAltitude(0.12)
   .width(el.clientWidth).height(el.clientHeight);
  new ResizeObserver(() => g.width(el.clientWidth).height(el.clientHeight)).observe(el);
  if (opts.pov) g.pointOfView(opts.pov, 0);
  return g;
}

/* ---------- network ---------- */
export async function getJSON(url, { timeout = 12000, headers, method = "GET", body } = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, headers, method, body });
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; try { e.body = await r.json(); } catch {} throw e; }
    return await r.json();
  } finally { clearTimeout(t); }
}
export async function getText(url, opts = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), opts.timeout || 12000);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.text(); } finally { clearTimeout(t); }
}

/* ---------- relay (your own Cloudflare Worker, holds secrets) ---------- */
export const relayBase = () => (setting("relayUrl") || "").trim().replace(/\/$/, "");
export const hasRelay = () => !!relayBase();
let relayHealth = null;
export async function relayFeatures(force = false) {
  if (!hasRelay()) return null;
  if (relayHealth && !force) return relayHealth;
  try { relayHealth = await relay("/health"); } catch { relayHealth = { ok: false }; }
  return relayHealth;
}
export async function relay(path, params = {}, { method = "GET", body, timeout = 25000, raw = false, headers = {} } = {}) {
  if (!hasRelay()) { const e = new Error("No relay configured. Add one under Connections."); e.code = "no_relay"; throw e; }
  const u = new URL(relayBase() + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
  const h = { ...headers }; const tok = setting("relayToken"); if (tok) h["x-relay-token"] = tok;
  if (body && !h["content-type"]) h["content-type"] = "application/json";
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(u, { method, headers: h, body: body && typeof body !== "string" ? JSON.stringify(body) : body, signal: c.signal });
    if (raw) return r;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `Relay error ${r.status}`); e.code = j.code || "relay_" + r.status; e.status = r.status; throw e; }
    return j;
  } finally { clearTimeout(t); }
}
// Try the public API directly from the browser; if CORS or rate limits block it, retry through the relay.
export async function smartJSON(url, opts = {}) {
  try { return await getJSON(url, opts); }
  catch (e) { if (!hasRelay()) throw e; return await relay("/fetch", { u: url }); }
}

/* ---------- geolocation ---------- */
export function geolocate() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("Geolocation unavailable"));
    navigator.geolocation.getCurrentPosition(p => res([p.coords.latitude, p.coords.longitude]), e => rej(e), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}
// Photon (Komoot) geocoder: free, CORS-enabled, OSM data.
export async function geocode(q, near) {
  const u = new URL("https://photon.komoot.io/api/"); u.searchParams.set("q", q); u.searchParams.set("limit", "6");
  if (near) { u.searchParams.set("lat", near[0]); u.searchParams.set("lon", near[1]); }
  const j = await getJSON(u);
  return j.features.map(f => { const p = f.properties; return { name: [p.name, p.street && (p.street + (p.housenumber ? " " + p.housenumber : "")), p.city, p.country].filter(Boolean).join(", "), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], postcode: p.postcode, city: p.city || p.name }; });
}
export async function reverseGeocode([lat, lon]) {
  try { const j = await getJSON(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`); const p = j.features[0]?.properties || {}; return { name: [p.street && (p.street + (p.housenumber ? " " + p.housenumber : "")), p.city].filter(Boolean).join(", ") || "Current location", postcode: p.postcode, city: p.city }; }
  catch { return { name: "Current location" }; }
}

/* ---------- small UI helpers ---------- */
export function modal(title, html, { wide = false } = {}) {
  const d = document.createElement("dialog"); d.className = "modal" + (wide ? " wide" : "");
  d.innerHTML = `<div class="ph"><h2>${esc(title)}</h2><button class="btn ghost" data-close aria-label="Close">✕</button></div><div class="pb scroll" style="max-height:78vh">${html}</div>`;
  document.body.appendChild(d); d.showModal();
  d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
  d.addEventListener("close", () => d.remove());
  return d;
}
export function confirmBox(title, html, okLabel = "Confirm") {
  return new Promise(res => {
    const d = modal(title, `${html}<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${esc(okLabel)}</button></div>`);
    d.querySelector("[data-ok]").onclick = () => { res(true); d.close(); };
    d.addEventListener("close", () => res(false));
  });
}
export function debounce(fn, ms = 400) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function segmented(el, onChange) {
  el.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; $$("button", el).forEach(x => x.setAttribute("aria-pressed", x === b)); onChange(b.dataset); });
}
// Open an external page in a new tab (used only for final checkout / native apps).
export const openExt = url => window.open(url, "_blank", "noopener");
export const postNewTab = (url, data) => {
  const f = document.createElement("form"); f.method = "POST"; f.action = url; f.target = "_blank";
  const params = new URLSearchParams(data);
  for (const [k, v] of params) { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; f.appendChild(i); }
  document.body.appendChild(f); f.submit(); f.remove();
};
