import { $, $$, esc, tag, fmt, empty, smartJSON, getJSON, makeGlobe, debounce, segmented, toast } from "../core.js";
import { I } from "./_icons.js";

// ADS-B providers (readsb v2 JSON). Community feeds, free, no key. Data: ODbL (adsb.lol) / airplanes.live terms.
const PROV = [
  { id: "adsblol", name: "adsb.lol", point: (la, lo, r) => `https://api.adsb.lol/v2/point/${la}/${lo}/${r}`, mil: "https://api.adsb.lol/v2/mil", cs: c => `https://api.adsb.lol/v2/callsign/${c}` },
  { id: "aplive", name: "airplanes.live", point: (la, lo, r) => `https://api.airplanes.live/v2/point/${la}/${lo}/${r}`, mil: "https://api.airplanes.live/v2/mil", cs: c => `https://api.airplanes.live/v2/callsign/${c}` }
];
const SPOTS = [["London", 51.47, -0.45], ["Amsterdam", 52.31, 4.76], ["Frankfurt", 50.04, 8.56], ["New York", 40.64, -73.78], ["Dubai", 25.25, 55.36], ["Gulf", 27.0, 51.5], ["Poland–Ukraine", 50.3, 23.5], ["Black Sea", 44.0, 33.0], ["Taiwan Strait", 24.3, 119.8], ["Tokyo", 35.55, 139.78]];

let G = null, center = [51.47, -0.45], planes = new Map(), hist = new Map(), sel = null, timer = null, prov = 0, mode = "area", filt = "all", lastFetch = 0;
const altFt = a => typeof a.alt_baro === "number" ? a.alt_baro : 0;
const isMil = a => (a.dbFlags & 1) === 1 || a.mil;
const isEmerg = a => ["7500", "7600", "7700"].includes(a.squawk) || (a.emergency && a.emergency !== "none");
const color = a => isEmerg(a) ? "#E0533F" : isMil(a) ? "#E3A33B" : altFt(a) > 25000 ? "#7FD3C7" : altFt(a) > 8000 ? "#5BC0B0" : altFt(a) > 0 ? "#C8A35A" : "#5C6D85";

async function fetchAc(kind) {
  let lastErr;
  for (let i = 0; i < PROV.length; i++) {
    const p = PROV[(prov + i) % PROV.length];
    try { const j = await smartJSON(kind === "mil" ? p.mil : p.point(center[0].toFixed(3), center[1].toFixed(3), 250), { timeout: 12000 }); prov = (prov + i) % PROV.length; return { ac: j.ac || [], src: p.name }; }
    catch (e) { lastErr = e; }
  }
  throw lastErr;
}

export default {
  id: "radar", title: "Flight radar", group: "Operations", icon: I.radar,
  async render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Flight radar</h1><p>Live ADS-B traffic on a 3D globe from community receiver networks. Drag to rotate, scroll to zoom; traffic loads for wherever you look.</p></div>
      <div class="row"><div class="seg" id="rd-mode"><button data-m="area" aria-pressed="true">Area</button><button data-m="mil">Military, worldwide</button></div>
      <form id="rd-find" class="row"><input class="i" name="cs" placeholder="Find callsign, e.g. BAW117" style="width:190px"><button class="btn">Find</button></form></div></div>
    <div class="grid g12">
      <div class="panel key c8"><div class="globe" id="rd-globe" style="height:calc(100vh - 230px);min-height:460px">
        <div class="hud"><div class="row" id="rd-spots"></div><div class="row" id="rd-filt"></div><div class="note" id="rd-stat">Loading globe…</div></div></div></div>
      <div class="c4 grid" style="align-content:start">
        <div class="panel"><div class="ph"><h2 id="rd-sel-t">Aircraft</h2><div class="meta" id="rd-meta"></div></div><div class="pb" id="rd-sel">${empty("Select an aircraft", "Click a dot on the globe or a row below.")}</div></div>
        <div class="panel"><div class="ph"><h2>In view</h2><div class="meta" id="rd-count"></div></div><div class="pb flush scroll" style="max-height:calc(100vh - 560px);min-height:200px" id="rd-list"></div></div>
      </div>
    </div>`;
    $("#rd-spots", el).innerHTML = SPOTS.map(([n, la, lo]) => `<button class="chip" data-la="${la}" data-lo="${lo}">${n}</button>`).join("");
    $("#rd-filt", el).innerHTML = [["all", "All"], ["mil", "Military"], ["emerg", "Emergency"], ["heli", "Helicopters"], ["heavy", "Heavy"]].map(([k, l], i) => `<button class="chip" data-f="${k}" aria-pressed="${i === 0}">${l}</button>`).join("");
    $("#rd-spots", el).onclick = e => { const b = e.target.closest("[data-la]"); if (b) { G.pointOfView({ lat: +b.dataset.la, lng: +b.dataset.lo, altitude: 0.35 }, 1500); } };
    $("#rd-filt", el).onclick = e => { const b = e.target.closest("[data-f]"); if (!b) return; $$("#rd-filt .chip", el).forEach(x => x.setAttribute("aria-pressed", x === b)); filt = b.dataset.f; this.draw(); };
    segmented($("#rd-mode", el), d => { mode = d.m; planes.clear(); this.poll(true); if (mode === "mil") G.pointOfView({ altitude: 2.4 }, 1200); });
    $("#rd-find", el).onsubmit = e => { e.preventDefault(); this.find(new FormData(e.target).get("cs")); };
    $("#rd-list", el).onclick = e => { const r = e.target.closest("[data-hex]"); if (r) this.select(r.dataset.hex, true); };
    try {
      G = await makeGlobe($("#rd-globe", el), { pov: { lat: center[0], lng: center[1], altitude: 0.35 } });
      G.pointsData([]).pointLat(a => a.lat).pointLng(a => a.lon).pointAltitude(a => Math.max(0.0015, altFt(a) / 45000 * 0.03)).pointRadius(a => a.hex === sel ? 0.22 : 0.11).pointColor(color).pointResolution(6)
        .pointLabel(a => `<b>${esc((a.flight || a.r || a.hex).trim())}</b> ${esc(a.t || "")}<br>${fmt(altFt(a), 0)} ft · ${fmt(a.gs || 0, 0)} kt`)
        .onPointClick(a => this.select(a.hex))
        .pathsData([]).pathPoints(p => p.pts).pathPointLat(p => p[0]).pathPointLng(p => p[1]).pathPointAlt(p => p[2]).pathColor(() => ["rgba(200,163,90,.1)", "rgba(226,198,140,.9)"]).pathStroke(1.4)
        .ringsData([]).ringLat(r => r.lat).ringLng(r => r.lon).ringColor(r => t => `rgba(${r.c},${1 - t})`).ringMaxRadius(1.2).ringPropagationSpeed(1.5).ringRepeatPeriod(900);
      const onMove = debounce(() => { const p = G.pointOfView(); const moved = Math.hypot(p.lat - center[0], p.lng - center[1]); if (mode === "area" && moved > 1.5) { center = [p.lat, p.lng]; this.poll(true); } }, 700);
      if (G.onZoom) G.onZoom(onMove); else $("#rd-globe", el).addEventListener("pointerup", onMove);
      this.poll(true);
    } catch (e) { $("#rd-globe", el).innerHTML = `<div class="err" style="margin:20px">3D globe failed to load (${esc(e.message)}). WebGL may be disabled in this browser.</div>`; }
  },
  show() { clearInterval(timer); timer = setInterval(() => { if (document.getElementById("v-radar")?.classList.contains("on")) this.poll(); }, 8000); },
  async poll(force) {
    if (!G || (!force && Date.now() - lastFetch < 6000)) return; lastFetch = Date.now();
    const el = document.getElementById("v-radar");
    try {
      const { ac, src } = await fetchAc(mode);
      const now = Date.now(); const keep = new Map();
      ac.filter(a => isFinite(a.lat) && isFinite(a.lon)).forEach(a => { if (mode === "mil") a.mil = true; keep.set(a.hex, a);
        const h = hist.get(a.hex) || []; const last = h[h.length - 1]; if (!last || last[0] !== a.lat || last[1] !== a.lon) h.push([a.lat, a.lon, Math.max(0.0015, altFt(a) / 45000 * 0.03)]); hist.set(a.hex, h.slice(-60)); });
      planes = keep; this.draw();
      $("#rd-stat", el).innerHTML = `${ac.length} aircraft · ${esc(src)} · ${new Date(now).toLocaleTimeString("en-GB")}`;
      $("#rd-meta", el).innerHTML = tag("live", src);
      if (sel && planes.has(sel)) this.detail(planes.get(sel), false);
      const em = [...planes.values()].filter(isEmerg); if (em.length && !this._warned) { this._warned = 1; toast(`Emergency squawk in view: ${em.map(a => (a.flight || a.hex).trim() + " " + a.squawk).join(", ")}`, "bad"); }
    } catch (e) { $("#rd-stat", el).innerHTML = `<span class="dn">ADS-B feeds unreachable: ${esc(e.message)}.</span> Add your relay under Connections to route around browser restrictions.`; }
  },
  filtered() { return [...planes.values()].filter(a => filt === "all" || (filt === "mil" && isMil(a)) || (filt === "emerg" && isEmerg(a)) || (filt === "heli" && a.category === "A7") || (filt === "heavy" && a.category === "A5")); },
  draw() {
    if (!G) return; const list = this.filtered(); G.pointsData(list);
    G.ringsData(list.filter(a => isEmerg(a) || a.hex === sel).map(a => ({ lat: a.lat, lon: a.lon, c: isEmerg(a) ? "224,83,63" : "226,198,140" })));
    G.pathsData(sel && hist.get(sel)?.length > 1 ? [{ pts: hist.get(sel) }] : []);
    const el = document.getElementById("v-radar");
    $("#rd-count", el).textContent = `${list.length} shown`;
    $("#rd-list", el).innerHTML = list.length ? `<ul class="list">${list.sort((a, b) => altFt(b) - altFt(a)).slice(0, 250).map(a => `<li class="click${a.hex === sel ? " sel" : ""}" data-hex="${a.hex}"><span class="dot" style="background:${color(a)};margin-top:6px"></span><div style="min-width:0;flex:1"><div class="t">${esc((a.flight || "").trim() || a.r || a.hex)} ${isMil(a) ? '<span class="pill iw">MIL</span>' : ""}${isEmerg(a) ? `<span class="pill iw">SQ ${esc(a.squawk)}</span>` : ""}</div><div class="s">${esc(a.t || "—")} · ${esc(a.r || a.hex)}</div></div><span class="d">${altFt(a) ? fmt(altFt(a), 0) + " ft" : "ground"}</span></li>`).join("")}</ul>` : empty("No aircraft", "Nothing matches this filter here.");
  },
  async select(hex, fly) { sel = hex; const a = planes.get(hex); if (!a) return; if (fly) G.pointOfView({ lat: a.lat, lng: a.lon, altitude: 0.18 }, 1200); this.draw(); this.detail(a, true); },
  async detail(a, full) {
    const el = document.getElementById("v-radar"); const cs = (a.flight || "").trim();
    $("#rd-sel-t", el).textContent = cs || a.r || a.hex;
    const base = `<dl class="kv"><dt>Registration</dt><dd>${esc(a.r || "—")}</dd><dt>Type</dt><dd>${esc(a.t || "—")}${a.desc ? " · " + esc(a.desc) : ""}</dd><dt>Altitude</dt><dd>${altFt(a) ? fmt(altFt(a), 0) + " ft" : "On ground"}${a.baro_rate ? ` (${a.baro_rate > 0 ? "▲" : "▼"} ${fmt(Math.abs(a.baro_rate), 0)} fpm)` : ""}</dd><dt>Ground speed</dt><dd>${fmt(a.gs || 0, 0)} kt</dd><dt>Track</dt><dd>${a.track != null ? Math.round(a.track) + "°" : "—"}</dd><dt>Squawk</dt><dd class="${isEmerg(a) ? "dn" : ""}">${esc(a.squawk || "—")}${isEmerg(a) ? " · EMERGENCY" : ""}</dd><dt>Position</dt><dd>${a.lat.toFixed(3)}, ${a.lon.toFixed(3)}</dd><dt>ICAO hex</dt><dd>${esc(a.hex)}</dd></dl><div id="rd-extra"></div>`;
    if (full) $("#rd-sel", el).innerHTML = base; else { const x = $("#rd-extra", el)?.innerHTML; $("#rd-sel", el).innerHTML = base; if (x) $("#rd-extra", el).innerHTML = x; return; }
    const extra = []; 
    try { if (cs) { const r = await getJSON(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`); const f = r.response?.flightroute;
      if (f) extra.push(`<div style="margin-top:10px;padding:10px;background:var(--ink);border:1px solid var(--line)"><div class="note">${esc(f.airline?.name || "Route")}</div><div style="font:500 18px var(--serif)">${esc(f.origin?.iata_code)} → ${esc(f.destination?.iata_code)}</div><div class="note">${esc(f.origin?.municipality)} to ${esc(f.destination?.municipality)}</div></div>`); } } catch {}
    try { const p = await getJSON(`https://api.planespotters.net/pub/photos/hex/${a.hex}`); const ph = p.photos?.[0];
      if (ph) extra.push(`<a href="${esc(ph.link)}" target="_blank" rel="noopener"><img src="${esc(ph.thumbnail_large?.src || ph.thumbnail?.src)}" alt="Photo of ${esc(a.r || a.hex)}" style="width:100%;margin-top:10px;border:1px solid var(--line)"></a><div class="note">Photo © ${esc(ph.photographer)} · Planespotters.net</div>`); } catch {}
    extra.push(`<div class="row" style="margin-top:10px"><button class="btn" id="rd-follow">Fly to</button>${cs ? `<button class="btn ghost" data-go="routes" id="rd-route">Routes from origin</button>` : ""}</div>`);
    const x = $("#rd-extra", el); if (x) x.innerHTML = extra.join("");
    $("#rd-follow", el)?.addEventListener("click", () => G.pointOfView({ lat: a.lat, lng: a.lon, altitude: 0.12 }, 1000));
  },
  async find(cs) {
    cs = String(cs || "").trim().toUpperCase(); if (!cs) return;
    for (const p of PROV) { try { const j = await smartJSON(p.cs(cs)); const a = (j.ac || [])[0]; if (a) { center = [a.lat, a.lon]; mode = "area"; G.pointOfView({ lat: a.lat, lng: a.lon, altitude: 0.18 }, 1500); await this.poll(true); planes.set(a.hex, a); this.select(a.hex); return; } } catch {} }
    toast(`${cs} isn't broadcasting right now`, "bad");
  }
};
