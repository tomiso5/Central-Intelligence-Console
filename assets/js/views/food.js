import { $, esc, empty, toast, geolocate, geocode, reverseGeocode, makeLeaflet, setting, debounce } from "../core.js";
import { I } from "./_icons.js";
let map, L, here = null, layer, places = [];
const OP = q => `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`;
const services = (country, name, city) => {
  const g = (site) => `https://www.google.com/search?q=${encodeURIComponent(`site:${site} ${name} ${city || ""}`)}`;
  const ue = `https://www.ubereats.com/search?q=${encodeURIComponent(name)}`;
  const map = { NL: [["Thuisbezorgd", g("thuisbezorgd.nl")], ["Uber Eats", ue]], BE: [["Takeaway", g("takeaway.com")], ["Uber Eats", ue], ["Deliveroo", g("deliveroo.be")]], DE: [["Lieferando", g("lieferando.de")], ["Uber Eats", ue], ["Wolt", g("wolt.com")]], GB: [["Just Eat", g("just-eat.co.uk")], ["Deliveroo", g("deliveroo.co.uk")], ["Uber Eats", ue]], JP: [["Uber Eats", ue], ["Wolt", g("wolt.com")], ["Demae-can", g("demae-can.com")]], US: [["Uber Eats", ue], ["DoorDash", g("doordash.com")], ["Grubhub", g("grubhub.com")]] };
  return map[country] || [["Uber Eats", ue]];
};
export default {
  id: "food", title: "Food delivery", group: "Logistics", icon: I.food,
  async render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Food delivery</h1><p>Restaurants around you from OpenStreetMap, with hours, phone and website, and a one-tap jump to order on Thuisbezorgd, Uber Eats or your local service.</p></div>
      <div class="row"><input class="i" id="fd-where" placeholder="Address or area" style="width:240px"><button class="btn" id="fd-loc">Near me</button><select class="i" id="fd-r" style="width:auto"><option value="800">800 m</option><option value="1500" selected>1.5 km</option><option value="3000">3 km</option></select></div></div>
    <div class="grid g12">
      <div class="panel key c5"><div class="ph"><input class="i" id="fd-q" placeholder="Cuisine or name: sushi, pizza, vegan…" style="flex:1"><div class="meta" id="fd-m"></div></div><div class="pb flush scroll" style="max-height:calc(100vh - 260px);min-height:420px" id="fd-l">${empty("Finding restaurants near you…")}</div></div>
      <div class="panel c7"><div style="height:calc(100vh - 230px);min-height:440px" id="fd-map"></div></div>
    </div>`;
    map = await makeLeaflet($("#fd-map", el), [52.37, 4.9], 14); L = window.L; layer = L.layerGroup().addTo(map);
    const go = async (lat, lon, label) => { here = { lat, lon, ...(await reverseGeocode([lat, lon])) }; if (label) here.name = label; map.setView([lat, lon], 15); this.load(); };
    $("#fd-loc", el).onclick = () => geolocate().then(([a, b]) => go(a, b)).catch(e => { toast("Location unavailable; type an address instead", "bad"); go(52.3676, 4.9041, "Amsterdam"); });
    $("#fd-where", el).onkeydown = async e => { if (e.key !== "Enter") return; const r = await geocode(e.target.value).catch(() => []); if (r[0]) go(r[0].lat, r[0].lon, r[0].name); else toast("Address not found", "bad"); };
    $("#fd-r", el).onchange = () => here && this.load(); $("#fd-q", el).oninput = debounce(() => this.paint(), 200);
    $("#fd-l", el).onclick = e => { const b = e.target.closest("[data-i]"); if (b && !e.target.closest("a")) { const p = places[+b.dataset.i]; map.setView([p.lat, p.lon], 17); p.mk.openPopup(); } };
    $("#fd-loc", el).click();
  },
  async load() {
    const el = document.getElementById("v-food"); const r = $("#fd-r", el).value;
    $("#fd-l", el).innerHTML = `<div class="empty thinking">Scanning ${r} m around ${esc(here.name || "you")}…</div>`;
    try { const q = `[out:json][timeout:25];(nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["name"](around:${r},${here.lat},${here.lon}););out center 250;`;
      const r2 = await fetch(OP(q)); const j = await r2.json();
      places = j.elements.map(e => ({ name: e.tags.name, type: e.tags.amenity, cuisine: (e.tags.cuisine || "").replace(/;/g, ", ").replace(/_/g, " "), lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, phone: e.tags.phone || e.tags["contact:phone"], web: e.tags.website || e.tags["contact:website"], hours: e.tags.opening_hours, delivery: e.tags.delivery, takeaway: e.tags.takeaway, veg: e.tags["diet:vegetarian"], vegan: e.tags["diet:vegan"], addr: [e.tags["addr:street"], e.tags["addr:housenumber"]].filter(Boolean).join(" ") }))
        .filter(p => p.lat).map(p => ({ ...p, d: Math.hypot((p.lat - here.lat) * 111, (p.lon - here.lon) * 111 * Math.cos(here.lat * Math.PI / 180)) })).sort((a, b) => a.d - b.d);
      this.paint();
    } catch (e) { $("#fd-l", el).innerHTML = `<div class="err">OpenStreetMap search failed: ${esc(e.message)}</div>`; }
  },
  paint() {
    const el = document.getElementById("v-food"); const q = $("#fd-q", el).value.toLowerCase(); const cc = setting("country");
    layer.clearLayers(); L.circleMarker([here.lat, here.lon], { radius: 8, color: "#5BC0B0", fillOpacity: 1 }).addTo(layer).bindPopup("You");
    const list = places.filter(p => !q || (p.name + " " + p.cuisine + " " + (p.vegan ? "vegan" : "") + (p.veg ? "vegetarian" : "")).toLowerCase().includes(q));
    list.forEach(p => { p.mk = L.circleMarker([p.lat, p.lon], { radius: 6, color: p.type === "cafe" ? "#7FA8D9" : "#C8A35A", fillOpacity: .85, weight: 1 }).addTo(layer).bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.cuisine || p.type)}`); });
    $("#fd-m", el).textContent = `${list.length} places`;
    $("#fd-l", el).innerHTML = list.length ? `<ul class="list">${list.slice(0, 150).map((p, i) => `<li class="click" data-i="${places.indexOf(p)}"><div style="flex:1;min-width:0"><div class="t">${esc(p.name)}</div><div class="s">${esc(p.cuisine || p.type)}${p.vegan === "yes" ? " · vegan options" : p.veg === "yes" ? " · vegetarian options" : ""}${p.delivery === "yes" ? " · delivers" : ""}${p.takeaway === "yes" ? " · takeaway" : ""}</div>${p.hours ? `<div class="s">🕓 ${esc(p.hours)}</div>` : ""}
      <div class="row" style="margin-top:6px">${services(cc, p.name, here.city).map(([n, u]) => `<a class="btn ${n === "Thuisbezorgd" || n === "Uber Eats" ? "primary" : ""}" style="padding:3px 9px" href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join("")}${p.phone ? `<a class="btn ghost" style="padding:3px 9px" href="tel:${esc(p.phone)}">Call</a>` : ""}${p.web ? `<a class="btn ghost" style="padding:3px 9px" href="${esc(p.web)}" target="_blank" rel="noopener">Website</a>` : ""}</div></div><span class="d">${p.d < 1 ? Math.round(p.d * 1000) + " m" : p.d.toFixed(1) + " km"}</span></li>`).join("")}</ul>` : empty("Nothing matches", "Widen the radius or clear the filter.");
  }
};
