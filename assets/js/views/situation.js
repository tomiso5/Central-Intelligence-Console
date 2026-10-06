import { $, esc, tag, dshort, fmt, pct, ago, empty, money } from "../core.js";
import { I } from "./_icons.js";
import { intel, hotspots, snapLabel, quakes, weather, WCODE, crypto, quotes, QUOTES } from "../data.js";
import { makeMap } from "../map2d.js";
import * as google from "../google.js";

export default {
  id: "situation", title: "Situation room", group: "Operations", icon: I.situation,
  async render(el, ctx) {
    const h = new Date().getHours();
    el.innerHTML = `
    <div class="vhead"><div><h1 id="greet"></h1><p>Overnight picture across conflict, OSINT, cyber and markets.</p></div></div>
    <div class="grid g12">
      <div class="panel key c8"><div class="ph"><h2>Global flashpoints</h2><div class="meta"><span class="tag snap" id="s-snap"></span><button class="btn ghost" data-go="map">Open map</button></div></div><div class="mapwrap" style="height:340px" id="s-map"></div></div>
      <div class="panel c4"><div class="ph"><h2>Priority reporting</h2></div><div class="pb flush scroll" style="max-height:340px"><ul class="list" id="s-prio"></ul></div></div>
      <div class="panel c4"><div class="ph"><h2>Your day</h2><div class="meta" id="s-daymeta"></div></div><div class="pb flush scroll" style="max-height:230px" id="s-day"></div></div>
      <div class="panel c4"><div class="ph"><h2>Latest OSINT</h2><div class="meta"><button class="btn ghost" data-go="osint">Open feed</button></div></div><div class="pb flush scroll" style="max-height:230px" id="s-osint"></div></div>
      <div class="panel c4"><div class="ph"><h2>Cyber watch</h2><div class="meta"><button class="btn ghost" data-go="cyber">All</button></div></div><div class="pb flush scroll" style="max-height:230px"><ul class="list" id="s-cyber"></ul></div></div>
      <div class="panel c8"><div class="ph"><h2>Markets</h2><div class="meta" id="s-mktmeta"></div></div><div class="tiles" id="s-mkt"></div></div>
      <div class="panel c4"><div class="ph"><h2>Station weather</h2><div class="meta" id="s-wxmeta"></div></div><ul class="list" id="s-wx"></ul></div>
    </div>`;
    const m = JSON.parse(localStorage.getItem("vt2:me") || "{}");
    $("#greet", el).textContent = `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}, ${m.callsign || "agent"}`;
    const I2 = await intel(); const HOT = await hotspots();
    $("#s-snap", el).textContent = snapLabel(I2);
    const map = makeMap($("#s-map", el), { interactive: false, onSelect: x => ctx.go("map", { focus: x.id }) }); map.setHot(HOT);
    quakes().then(q => map.setQuakes(q.filter(x => x.mag >= 4.5))).catch(() => {});
    $("#s-prio", el).innerHTML = HOT.slice(0, 8).map(x => `<li class="click" data-go="map"><span class="sev ${x.sev}" style="margin-top:6px"></span><div><div class="t">${esc(x.title)}</div><div class="s">${esc(x.name)}, ${esc(x.region)}</div></div><span class="d">${dshort(x.date)}</span></li>`).join("");
    $("#s-cyber", el).innerHTML = I2.cyber.slice(0, 6).map(c => `<li><span class="sev ${c.sev}" style="margin-top:6px"></span><div class="t">${esc(c.title)}</div><span class="d">${dshort(c.date)}</span></li>`).join("");
    // markets: live via relay if possible, else snapshot
    const snapTiles = [...I2.markets.indices.slice(0, 5), ...I2.markets.commodities].map(x => `<div class="tile"><div class="k">${esc(x.k)}</div><div class="v">${fmt(x.v)}</div>${pct(x.c)}<div class="x">${esc(I2.markets.asOf)}</div></div>`).join("");
    quotes().then(q => { $("#s-mkt", el).innerHTML = QUOTES.slice(0, 8).map(([s, n]) => { const x = q.quotes?.[s]; return x ? `<div class="tile"><div class="k">${n}</div><div class="v">${fmt(x.price)}</div>${pct(x.changePct)}<div class="x">Live</div></div>` : ""; }).join(""); $("#s-mktmeta", el).innerHTML = tag("live", "Live via relay"); })
      .catch(() => { $("#s-mkt", el).innerHTML = snapTiles; $("#s-mktmeta", el).innerHTML = tag("snap", "Snapshot"); });
    crypto().then(j => { if (j.bitcoin) $("#s-mkt", el).insertAdjacentHTML("beforeend", `<div class="tile"><div class="k">Bitcoin</div><div class="v">$${fmt(j.bitcoin.usd, 0)}</div>${pct(j.bitcoin.usd_24h_change)}<div class="x">Live · CoinGecko</div></div>`); }).catch(() => {});
    weather().then(arr => { const W = ["London", "Washington", "Moscow", "Kyiv", "Tehran", "Beijing", "Tokyo"];
      $("#s-wx", el).innerHTML = arr.map((w, i) => `<li><div class="t" style="min-width:90px">${W[i]}</div><div class="s" style="margin:0">${WCODE(w.current.weather_code)} · ${Math.round(w.current.wind_speed_10m)} km/h</div><span class="d" style="color:var(--text);font-size:14px">${Math.round(w.current.temperature_2m)}°C</span></li>`).join("");
      arr.forEach((w, i) => { const n = document.getElementById("cw" + i); if (n) n.textContent = Math.round(w.current.temperature_2m) + "°"; });
      $("#s-wxmeta", el).innerHTML = tag("live", "Open-Meteo"); }).catch(() => $("#s-wx", el).innerHTML = `<li>${empty("Weather feed unreachable")}</li>`);
    this.refreshDay(el);
    this.refreshOsint(el);
  },
  show(ctx) { const el = document.getElementById("v-situation"); if (el?.dataset.r) { this.refreshDay(el); this.refreshOsint(el); } if (el) el.dataset.r = 1; },
  async refreshDay(el) {
    const host = $("#s-day", el);
    if (!google.signedIn()) { host.innerHTML = empty("Calendar not linked", "Sign in with Google to see today's meetings.", `<button class="btn" data-go="meet">Link calendar</button>`); return; }
    try { const s = new Date(); s.setHours(0, 0, 0, 0); const evs = await google.listEvents(s, new Date(s.getTime() + 864e5));
      host.innerHTML = evs.length ? `<ul class="list">${evs.map(e => `<li><div class="t" style="min-width:52px">${e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "All day"}</div><div style="flex:1">${esc(e.summary || "(untitled)")}</div>${e.hangoutLink ? `<a class="btn primary" href="${esc(e.hangoutLink)}" target="_blank" rel="noopener">Join</a>` : ""}</li>`).join("")}</ul>` : empty("Nothing scheduled today");
      $("#s-daymeta", el).innerHTML = tag("live", evs.length + " today");
    } catch (e) { host.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  },
  refreshOsint(el) {
    const items = (window.VT_OSINT || []).slice(0, 8);
    $("#s-osint", el).innerHTML = items.length ? `<ul class="list">${items.map(i => `<li><span class="pill ${i.cor ? "cor" : "unv"}">${i.cor ? "CORROB." : "UNVERIFIED"}</span><div style="min-width:0"><div class="t" style="font-weight:400">${esc(i.text.slice(0, 140))}</div><div class="s">${esc(i.src)} · ${esc(i.author)}</div></div><span class="d">${ago(i.ts)}</span></li>`).join("")}</ul>`
      : empty("OSINT feed idle", "Open the OSINT section to start collecting.", `<button class="btn" data-go="osint">Start collection</button>`);
  }
};
