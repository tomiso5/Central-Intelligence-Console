import { $, $$, esc, empty, dur, fmt, makeGlobe, segmented, debounce, toast } from "../core.js";
import { I } from "./_icons.js";
import * as AP from "../airports.js";

let G = null, D = null, origin = null, other = null, mode = "from", rows = [], selTo = null;
const CONT = { EU: "Europe", AS: "Asia", NA: "North America", SA: "South America", AF: "Africa", OC: "Oceania", AN: "Antarctica" };
export default {
  id: "routes", title: "Route explorer", group: "Logistics", icon: I.routes,
  async render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Route explorer</h1><p>Every nonstop commercial route from any airport, who flies it and how long it takes. Find connections between two airports or destinations they share.</p></div>
      <div class="seg" id="ro-mode"><button data-m="from" aria-pressed="true">Nonstop from</button><button data-m="conn">A → B connections</button><button data-m="both">Shared destinations</button></div></div>
    <div class="grid g12">
      <div class="panel key c8"><div class="globe" id="ro-globe" style="height:calc(100vh - 230px);min-height:460px"><div class="hud"><div class="panel"><div class="pb frm" style="padding:10px">
        <div class="frm two"><label class="f">Airport A<input class="i" id="ro-a" value="AMS"></label><label class="f" id="ro-bl" hidden>Airport B<input class="i" id="ro-b" placeholder="e.g. NRT"></label></div>
        <div class="frm two"><label class="f">Airline<select class="i" id="ro-al"><option value="">Any airline</option></select></label><label class="f">Max flight time<select class="i" id="ro-mx"><option value="">Any</option><option value="120">2h</option><option value="240">4h</option><option value="480">8h</option><option value="720">12h</option></select></label></div>
        <label class="f">Region<select class="i" id="ro-ct"><option value="">Worldwide</option>${Object.entries(CONT).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label></div></div>
        <div class="note" id="ro-stat"></div></div></div></div>
      <div class="c4 grid" style="align-content:start">
        <div class="panel"><div class="ph"><h2 id="ro-dt">Route detail</h2></div><div class="pb" id="ro-d">${empty("Pick a destination", "Click an arc end or a row below.")}</div></div>
        <div class="panel"><div class="ph"><input class="i" id="ro-q" placeholder="Filter destinations" style="flex:1"><div class="seg" id="ro-sort"><button data-s="min" aria-pressed="true">Time</button><button data-s="city">A–Z</button><button data-s="n">Airlines</button></div></div><div class="pb flush scroll" style="max-height:calc(100vh - 560px);min-height:220px" id="ro-l"></div></div>
      </div></div>`;
    D = await AP.load();
    const a = $("#ro-a", el), b = $("#ro-b", el);
    AP.autocomplete(a, ap => { origin = ap; this.update(); }); AP.autocomplete(b, ap => { other = ap; this.update(); });
    segmented($("#ro-mode", el), d => { mode = d.m; $("#ro-bl", el).hidden = mode === "from"; this.update(); });
    let sort = "min"; segmented($("#ro-sort", el), d => { sort = d.s; this.list(sort); });
    ["#ro-al", "#ro-mx", "#ro-ct"].forEach(s => $(s, el).onchange = () => this.update());
    $("#ro-q", el).oninput = debounce(() => this.list(sort), 200);
    $("#ro-l", el).onclick = e => { const r = e.target.closest("[data-to]"); if (r) this.detail(r.dataset.to); };
    this.sort = () => sort;
    origin = D.by.AMS; this.update();
    try {
      G = await makeGlobe($("#ro-globe", el), { pov: { lat: 50, lng: 10, altitude: 2 } });
      G.arcColor(r => r.to.iata === selTo ? ["#E2C68C", "#E2C68C"] : ["rgba(200,163,90,.65)", "rgba(91,192,176,.65)"]).arcStroke(r => r.to.iata === selTo ? 0.9 : 0.35)
        .arcDashLength(0.5).arcDashGap(0.15).arcDashAnimateTime(r => 1200 + (r.min || 60) * 6).arcAltitudeAutoScale(0.4)
        .arcLabel(r => `${esc(r.from.iata)} → ${esc(r.to.iata)} · ${esc(r.to.city)} · ${dur(r.min)}`).onArcClick(r => this.detail(r.to.iata))
        .pointsData([]).pointLat("lat").pointLng("lon").pointColor(p => p === origin || p === other ? "#E0533F" : "#C8A35A").pointAltitude(0.005).pointRadius(p => p === origin || p === other ? 0.5 : 0.18)
        .pointLabel(p => `${esc(p.iata)} · ${esc(p.city)}`).onPointClick(p => p === origin ? null : this.detail(p.iata));
    } catch (e) { $("#ro-globe", el).insertAdjacentHTML("beforeend", `<div class="err" style="position:absolute;bottom:10px;left:10px">3D globe unavailable: ${esc(e.message)}. The list still works.</div>`); }
    this.update();
  },
  show(ctx, p) { if (p?.from && D?.by[p.from]) { origin = D.by[p.from]; $("#ro-a").value = p.from; this.update(); } },
  update() {
    const el = document.getElementById("v-routes"); if (!D || !origin) return;
    const al = $("#ro-al", el).value, mx = +$("#ro-mx", el).value || 1e9, ct = $("#ro-ct", el).value;
    const ok = r => (!al || r.carriers.some(c => (c.iata || c.name) === al)) && r.min <= mx && (!ct || r.to.cont === ct);
    if (mode === "from") rows = D.out[origin.i].filter(ok).map(r => ({ from: origin, ...r }));
    else if (mode === "both" && other) { const set = new Map(D.out[other.i].map(r => [r.to.iata, r])); rows = D.out[origin.i].filter(r => set.has(r.to.iata) && ok(r)).map(r => ({ from: origin, ...r, alt: set.get(r.to.iata) })); }
    else if (mode === "conn" && other) {
      const direct = D.out[origin.i].find(r => r.to.iata === other.iata);
      const hubs = D.out[origin.i].filter(ok).map(r => [r, D.out[r.to.i].find(x => x.to.iata === other.iata)]).filter(([, y]) => y).sort((x, y) => (x[0].min + x[1].min) - (y[0].min + y[1].min));
      rows = [...(direct ? [{ from: origin, ...direct, direct: true }] : []), ...hubs.slice(0, 60).map(([x, y]) => ({ from: origin, ...x, leg2: y, total: x.min + y.min }))];
    } else rows = [];
    // airline options from origin
    const cs = new Map(); D.out[origin.i].forEach(r => r.carriers.forEach(c => cs.set(c.iata || c.name, c)));
    const sel = $("#ro-al", el); const cur = sel.value;
    sel.innerHTML = `<option value="">Any airline (${cs.size})</option>` + [...cs.values()].sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${esc(c.iata || c.name)}" ${cur === (c.iata || c.name) ? "selected" : ""}>${esc(c.name)}</option>`).join("");
    const countries = new Set(rows.map(r => r.to.country)); const longest = rows.reduce((m, r) => r.min > (m?.min || 0) ? r : m, null);
    $("#ro-stat", el).innerHTML = mode === "from" ? `<b>${rows.length}</b> nonstop destinations from ${esc(origin.city)} (${esc(origin.iata)}) in ${countries.size} countries${longest ? ` · longest ${esc(longest.to.iata)} ${dur(longest.min)}` : ""} · data ${esc(D.built)}`
      : mode === "conn" ? (other ? `${rows.filter(r => r.direct).length ? "Nonstop available · " : "No nonstop · "}${rows.filter(r => !r.direct).length} one-stop hubs ${esc(origin.iata)} → ${esc(other.iata)}` : "Choose airport B")
      : (other ? `${rows.length} destinations served nonstop from both ${esc(origin.iata)} and ${esc(other.iata)}` : "Choose airport B");
    if (G) {
      const arcs = mode === "conn" ? rows.flatMap(r => r.direct ? [r] : [r, { from: r.to, to: other, min: r.leg2.min, carriers: r.leg2.carriers }]) : mode === "both" ? [...rows, ...rows.map(r => ({ from: other, to: r.to, min: r.alt.min, carriers: r.alt.carriers }))] : rows;
      G.arcsData(arcs.slice(0, 700)).arcStartLat(r => r.from.lat).arcStartLng(r => r.from.lon).arcEndLat(r => r.to.lat).arcEndLng(r => r.to.lon);
      G.pointsData([origin, ...(other && mode !== "from" ? [other] : []), ...new Set(rows.map(r => r.to))]);
      G.pointOfView({ lat: origin.lat, lng: origin.lon, altitude: mode === "from" && rows.length > 80 ? 2.2 : 1.6 }, 1200);
    }
    this.list(this.sort());
  },
  list(sort) {
    const el = document.getElementById("v-routes"); const q = $("#ro-q", el).value.toLowerCase();
    const L = rows.filter(r => !q || (r.to.city + r.to.iata + r.to.country + r.carriers.map(c => c.name).join()).toLowerCase().includes(q))
      .sort((a, b) => sort === "city" ? a.to.city.localeCompare(b.to.city) : sort === "n" ? b.carriers.length - a.carriers.length : (a.total || a.min) - (b.total || b.min));
    $("#ro-l", el).innerHTML = L.length ? `<ul class="list">${L.map(r => `<li class="click" data-to="${r.to.iata}"><div style="min-width:44px;font-weight:600">${esc(r.to.iata)}</div><div style="flex:1;min-width:0"><div class="t">${esc(r.to.city)}${r.direct ? ' <span class="pill cor">NONSTOP</span>' : ""}${r.leg2 ? ` <span class="note">→ ${esc(other.iata)}</span>` : ""}</div><div class="s" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.carriers.map(c => c.name).join(", "))}</div></div><span class="d">${r.total ? dur(r.total) : dur(r.min)}</span></li>`).join("")}</ul>` : empty("No routes match");
  },
  detail(iata) {
    const el = document.getElementById("v-routes"); selTo = iata; const r = rows.find(x => x.to.iata === iata); const to = D.by[iata]; if (!to) return;
    if (G) G.arcsData(G.arcsData());
    $("#ro-dt", el).textContent = `${origin.iata} → ${iata}`;
    $("#ro-d", el).innerHTML = `<div style="font:500 20px var(--serif)">${esc(to.city)}</div><div class="note">${esc(to.name)} · ${esc(to.country)}</div>
      <dl class="kv" style="margin-top:10px"><dt>Distance</dt><dd>${fmt(AP.km(origin, to), 0)} km</dd>${r ? `<dt>Flight time</dt><dd>${dur(r.min)}${r.leg2 ? ` + ${dur(r.leg2.min)} via ${esc(to.iata)}` : ""}</dd><dt>Airlines</dt><dd>${esc(r.carriers.map(c => c.name + (c.iata ? ` (${c.iata})` : "")).join(", "))}</dd>` : ""}<dt>Routes from ${esc(to.iata)}</dt><dd>${to.n} nonstop</dd></dl>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="ro-price">Price this route</button><button class="btn" id="ro-from">Explore from ${esc(to.iata)}</button></div>`;
    $("#ro-price", el).onclick = () => window.VT.go("travel", { from: origin.iata, to: mode === "conn" && other ? other.iata : iata });
    $("#ro-from", el).onclick = () => { origin = to; $("#ro-a", el).value = to.iata; mode = "from"; $$("#ro-mode button", el).forEach((b, i) => b.setAttribute("aria-pressed", i === 0)); $("#ro-bl", el).hidden = true; this.update(); };
  }
};
