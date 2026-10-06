import { $, esc, empty, toast, geolocate, geocode, reverseGeocode, getJSON, makeLeaflet, debounce, fmt, store } from "../core.js";
import { I } from "./_icons.js";
let map, L, pick = null, drop = null, line = null, mk = {};
function acPlace(input, onPick) {
  const wrap = document.createElement("div"); wrap.className = "ac"; input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
  const menu = document.createElement("div"); menu.className = "menu"; wrap.appendChild(menu); let items = [];
  input.addEventListener("input", debounce(async () => { if (input.value.length < 3) { menu.classList.remove("open"); return; } try { items = await geocode(input.value, pick ? [pick.lat, pick.lon] : null); } catch { items = []; }
    menu.innerHTML = items.map((p, i) => `<button type="button" data-i="${i}">${esc(p.name)}</button>`).join(""); menu.classList.toggle("open", items.length > 0); }, 350));
  menu.addEventListener("mousedown", e => { const b = e.target.closest("[data-i]"); if (b) { e.preventDefault(); const p = items[+b.dataset.i]; input.value = p.name; menu.classList.remove("open"); onPick(p); } });
  input.addEventListener("blur", () => setTimeout(() => menu.classList.remove("open"), 150));
}
export default {
  id: "ride", title: "Ride", group: "Logistics", icon: I.ride,
  async render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Ride</h1><p>Plan a ride on the map with live routing, then hand off to Uber or Bolt with pickup and drop-off filled in. Share your ETA with a friend.</p></div></div>
    <div class="grid g12">
      <div class="panel key c4"><div class="ph"><h2>Trip</h2></div><div class="pb frm">
        <label class="f">Pickup<input class="i" id="rd-p" placeholder="Locating you…"></label><button class="btn ghost" id="rd-loc" style="justify-self:start">Use my location</button>
        <label class="f">Drop-off<input class="i" id="rd-d" placeholder="Where to?"></label>
        <div class="row" id="rd-saved"></div>
        <div id="rd-sum"></div>
        <div class="row"><button class="btn primary" id="rd-uber" disabled>Request with Uber</button><button class="btn" id="rd-bolt" disabled>Open Bolt</button></div>
        <div class="row"><button class="btn ghost" id="rd-share" disabled>Share ETA with a friend</button><button class="btn ghost" id="rd-save" disabled>Save drop-off</button></div>
        <p class="note">Uber and Bolt show the live fare and driver before you confirm in their app. Routing by OSRM on OpenStreetMap data.</p></div></div>
      <div class="panel c8"><div style="height:calc(100vh - 230px);min-height:440px" id="rd-map"></div></div>
    </div>`;
    map = await makeLeaflet($("#rd-map", el), [52.37, 4.9], 13); L = window.L;
    const setP = async (p, label) => { pick = p; $("#rd-p", el).value = label || (await reverseGeocode([p.lat, p.lon])).name; this.mark("p", p, "#5BC0B0"); this.route(); };
    $("#rd-loc", el).onclick = () => geolocate().then(([lat, lon]) => { setP({ lat, lon }); map.setView([lat, lon], 15); }).catch(e => toast("Location unavailable: " + e.message, "bad"));
    $("#rd-loc", el).click();
    acPlace($("#rd-p", el), p => { setP(p, p.name); });
    acPlace($("#rd-d", el), p => { drop = p; this.mark("d", p, "#E0533F"); this.route(); });
    map.on("click", e => { drop = { lat: e.latlng.lat, lon: e.latlng.lng }; reverseGeocode([drop.lat, drop.lon]).then(r => { drop.name = r.name; $("#rd-d", el).value = r.name; }); this.mark("d", drop, "#E0533F"); this.route(); });
    const saved = () => { const s = store.get("ride:saved", []); $("#rd-saved", el).innerHTML = s.map((p, i) => `<button class="chip" data-s="${i}">★ ${esc(p.name.split(",")[0])}</button>`).join(""); };
    saved(); $("#rd-saved", el).onclick = e => { const b = e.target.closest("[data-s]"); if (b) { drop = store.get("ride:saved", [])[+b.dataset.s]; $("#rd-d", el).value = drop.name; this.mark("d", drop, "#E0533F"); this.route(); } };
    $("#rd-save", el).onclick = () => { store.set("ride:saved", [drop, ...store.get("ride:saved", []).filter(x => x.name !== drop.name)].slice(0, 6)); saved(); toast("Saved", "ok"); };
    $("#rd-uber", el).onclick = () => { const u = new URL("https://m.uber.com/ul/"); u.searchParams.set("action", "setPickup");
      if (pick) { u.searchParams.set("pickup[latitude]", pick.lat); u.searchParams.set("pickup[longitude]", pick.lon); u.searchParams.set("pickup[nickname]", $("#rd-p", el).value); } else u.searchParams.set("pickup", "my_location");
      u.searchParams.set("dropoff[latitude]", drop.lat); u.searchParams.set("dropoff[longitude]", drop.lon); u.searchParams.set("dropoff[nickname]", drop.name || $("#rd-d", el).value);
      window.open(u, "_blank", "noopener"); };
    $("#rd-bolt", el).onclick = () => window.open("https://bolt.eu/en/rides/", "_blank", "noopener");
    $("#rd-share", el).onclick = () => window.VT.go("comms", { share: `🚗 On my way to ${drop.name || $("#rd-d", el).value}. ETA ${this.eta}. Route: https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${pick.lat}%2C${pick.lon}%3B${drop.lat}%2C${drop.lon}` });
  },
  mark(k, p, color) { mk[k]?.remove(); mk[k] = L.circleMarker([p.lat, p.lon], { radius: 9, color, fillOpacity: .9, weight: 2 }).addTo(map); },
  async route() {
    const el = document.getElementById("v-ride"); const ok = pick && drop;
    ["#rd-uber", "#rd-bolt", "#rd-share", "#rd-save"].forEach(s => $(s, el).disabled = !drop);
    if (!ok) return;
    try { const j = await getJSON(`https://router.project-osrm.org/route/v1/driving/${pick.lon},${pick.lat};${drop.lon},${drop.lat}?overview=full&geometries=geojson`);
      const r = j.routes[0]; line?.remove(); line = L.geoJSON(r.geometry, { style: { color: "#C8A35A", weight: 5, opacity: .9 } }).addTo(map); map.fitBounds(line.getBounds(), { padding: [40, 40] });
      const mins = Math.round(r.duration / 60); this.eta = new Date(Date.now() + r.duration * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      $("#rd-sum", el).innerHTML = `<div class="tiles" style="grid-template-columns:1fr 1fr 1fr"><div class="tile"><div class="k">Distance</div><div class="v">${fmt(r.distance / 1000, 1)} km</div></div><div class="tile"><div class="k">Drive time</div><div class="v">${mins} min</div></div><div class="tile"><div class="k">Arrive</div><div class="v">${this.eta}</div></div></div><div class="note" style="margin-top:4px">Excludes live traffic and pickup wait.</div>`;
    } catch (e) { $("#rd-sum", el).innerHTML = `<div class="err">Routing unavailable: ${esc(e.message)}</div>`; }
  }
};
