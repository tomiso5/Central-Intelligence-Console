import { $, $$, esc, tag, dshort, segmented } from "../core.js";
import { I } from "./_icons.js";
import { hotspots, intel, snapLabel, quakes, hazards, gdeltGeo, iss } from "../data.js";
import { makeMap } from "../map2d.js";

let map, HOT = [], sel = null, trail = [], issTimer;
export default {
  id: "map", title: "Conflict map", group: "Operations", icon: I.map,
  async render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Conflict map</h1><p>Curated flashpoints, plus live GDELT news geolocation, OSINT mentions, seismic, hazard and orbital layers. Drag to pan, scroll to zoom.</p></div>
      <div class="seg" id="cm-reg"><button data-r="world" aria-pressed="true">World</button><button data-r="europe">Europe</button><button data-r="mena">Middle East</button><button data-r="africa">Africa</button><button data-r="asia">Indo-Pacific</button><button data-r="americas">Americas</button></div></div>
    <div class="grid g12">
      <div class="panel key c8"><div class="mapwrap" style="height:calc(100vh - 230px);min-height:440px" id="cm-map"></div></div>
      <div class="panel c4"><div class="ph"><h2 id="cm-title">Flashpoint detail</h2><div class="meta"><span class="tag snap" id="cm-snap"></span></div></div>
        <div class="pb" id="cm-detail">${'<div class="empty"><b>Select a marker</b>Or choose a flashpoint below.</div>'}</div>
        <div class="pb flush scroll" style="max-height:calc(100vh - 480px);border-top:1px solid var(--line)"><ul class="list" id="cm-list"></ul></div></div>
    </div>`;
    map = makeMap($("#cm-map", el), { onSelect: h => this.select(h) });
    const legend = document.createElement("div"); legend.className = "legend";
    legend.innerHTML = [["hot", "var(--alert)", "Curated flashpoints", ""], ["gdelt", "var(--sky)", "GDELT conflict news, 24h", "lg-g"], ["osint", "#C77DFF", "OSINT mentions", "lg-o"], ["quakes", "var(--signal)", "Seismic, 24h", "lg-q"], ["events", "var(--amber)", "Natural hazards", "lg-e"], ["iss", "#fff", "ISS", "lg-i"]]
      .map(([k, c, l, id]) => `<label><input type="checkbox" data-l="${k}" checked><span class="sev" style="background:${c}"></span>${l} <span class="note" id="${id}"></span></label>`).join("");
    $("#cm-map", el).appendChild(legend);
    legend.addEventListener("change", e => map.toggle(e.target.dataset.l, e.target.checked));
    segmented($("#cm-reg", el), d => map.region(d.r));
    const I2 = await intel(); HOT = await hotspots(); $("#cm-snap", el).textContent = snapLabel(I2);
    map.setHot(HOT);
    $("#cm-list", el).innerHTML = HOT.map(h => `<li class="click" data-id="${h.id}"><span class="sev ${h.sev}" style="margin-top:6px"></span><div><div class="t">${esc(h.title)}</div><div class="s">${esc(h.name)}, ${esc(h.region)}</div></div><span class="d">${dshort(h.date)}</span></li>`).join("");
    $("#cm-list", el).addEventListener("click", e => { const li = e.target.closest("li[data-id]"); if (li) this.select(HOT.find(x => x.id === li.dataset.id)); });
    const set = (id, t) => { const n = $("#" + id, el); if (n) n.textContent = t; };
    gdeltGeo().then(g => { map.setGdelt(g); set("lg-g", g.length); }).catch(() => set("lg-g", "offline"));
    quakes().then(q => { map.setQuakes(q); set("lg-q", q.length); }).catch(() => set("lg-q", "offline"));
    hazards().then(v => { map.setEvents(v); set("lg-e", v.length); }).catch(() => set("lg-e", "offline"));
    const tickIss = () => iss().then(j => { trail.push([j.longitude, j.latitude]); if (trail.length > 90) trail.shift(); map.setIss([j.longitude, j.latitude], trail); set("lg-i", "live"); }).catch(() => set("lg-i", "offline"));
    tickIss(); issTimer = setInterval(tickIss, 10000);
    const paintOsint = () => { const pts = window.VT_OSINT_PLACES || []; map.setOsint(pts); set("lg-o", pts.length ? pts.length + " places" : "open OSINT"); };
    paintOsint(); addEventListener("vt-osint", paintOsint);
  },
  show(ctx, p) { setTimeout(() => map && map.fit(), 0); if (p?.focus) { const h = HOT.find(x => x.id === p.focus); if (h) this.select(h); } },
  select(h) {
    sel = h.id; map.setHot(HOT, sel); const el = document.getElementById("v-map");
    $("#cm-title", el).textContent = h.name;
    $("#cm-detail", el).innerHTML = `<div class="row" style="margin-bottom:6px"><span class="sev ${h.sev}"></span><span class="note">${esc(h.region)} · ${h.sev[0].toUpperCase() + h.sev.slice(1)} · ${dshort(h.date)}</span></div>
      <div style="font:500 18px/1.25 var(--serif);margin-bottom:8px">${esc(h.title)}</div><p style="margin:0 0 10px;max-width:60ch">${esc(h.summary)}</p>
      <div class="note">Source: <a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.src)}</a></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-osint="${esc(h.name)}">Search OSINT for ${esc(h.name)}</button></div>`;
    $("[data-osint]", el).onclick = e => window.VT.go("osint", { q: e.target.dataset.osint });
    $$("#cm-list li", el).forEach(li => li.classList.toggle("sel", li.dataset.id === h.id));
  }
};
