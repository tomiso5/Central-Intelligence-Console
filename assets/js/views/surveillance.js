import { $, esc, tag, fmt, ago, dshort, empty, smartJSON } from "../core.js";
import { I } from "./_icons.js";
import { quakes, hazards, iss } from "../data.js";
const off = (what) => empty(`${what} unreachable`, "The public feed didn't respond. Try again shortly.");
export default {
  id: "surv", title: "Surveillance", group: "Operations", icon: I.surv,
  render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Surveillance</h1><p>Orbital, seismic, airspace and hazard sensors from public feeds.</p></div></div>
    <div class="grid g12">
      <div class="panel key c4"><div class="ph"><h2>ISS overhead track</h2><div class="meta" id="sv-im"></div></div><div class="pb"><dl class="kv" id="sv-iss"></dl></div></div>
      <div class="panel c8"><div class="ph"><h2>Airspace over London, 40 nm</h2><div class="meta" id="sv-am"></div></div><div class="pb flush scroll" style="max-height:260px" id="sv-air"></div></div>
      <div class="panel c6"><div class="ph"><h2>Seismic events, 24h (M2.5+)</h2><div class="meta" id="sv-qm"></div></div><div class="pb flush scroll" style="max-height:360px" id="sv-q"></div><div class="src">Shallow events near known test sites are flagged for review.</div></div>
      <div class="panel c6"><div class="ph"><h2>Natural hazards, open</h2><div class="meta" id="sv-em"></div></div><div class="pb flush scroll" style="max-height:360px" id="sv-e"></div></div>
    </div>`;
    const tickIss = () => iss().then(j => { $("#sv-iss", el).innerHTML = `<dt>Latitude</dt><dd>${j.latitude.toFixed(3)}°</dd><dt>Longitude</dt><dd>${j.longitude.toFixed(3)}°</dd><dt>Altitude</dt><dd>${fmt(j.altitude, 1)} km</dd><dt>Velocity</dt><dd>${fmt(j.velocity, 0)} km/h</dd><dt>Visibility</dt><dd>${esc(j.visibility)}</dd>`; $("#sv-im", el).innerHTML = tag("live", "10 s"); }).catch(() => $("#sv-iss", el).innerHTML = off("ISS tracker"));
    tickIss(); setInterval(() => el.classList.contains("on") && tickIss(), 10000);
    smartJSON("https://api.adsb.lol/v2/point/51.47/-0.3/40").catch(() => smartJSON("https://api.airplanes.live/v2/point/51.47/-0.3/40")).then(j => {
      const s = (j.ac || []).filter(a => (a.flight || "").trim()).sort((a, b) => (b.alt_baro || 0) - (a.alt_baro || 0));
      $("#sv-air", el).innerHTML = `<ul class="list">${s.slice(0, 50).map(a => `<li><div style="flex:1"><div class="t">${esc(a.flight.trim())} <span class="note">${esc(a.t || "")}</span></div><div class="s">${esc(a.r || a.hex)} · ${a.alt_baro === "ground" ? "On ground" : fmt(a.alt_baro || 0, 0) + " ft"} · ${fmt(a.gs || 0, 0)} kt</div></div><span class="d">${a.track != null ? Math.round(a.track) + "°" : ""}</span></li>`).join("")}</ul>`;
      $("#sv-am", el).innerHTML = tag("live", s.length + " contacts") + ` <button class="btn ghost" data-go="radar">3D radar</button>`; }).catch(() => $("#sv-air", el).innerHTML = off("ADS-B feed"));
    quakes().then(q => { const flag = x => x.depth < 5 && x.mag >= 4 && /(Korea|Novaya Zemlya|Lop Nur|Nevada|Kazakhstan)/i.test(x.place);
      $("#sv-q", el).innerHTML = `<ul class="list">${q.slice(0, 60).map(x => `<li><span class="sev" style="background:var(--signal);opacity:${Math.min(1, x.mag / 6)};margin-top:6px"></span><div><div class="t">M${x.mag.toFixed(1)} · ${esc(x.place)}${flag(x) ? ' <span class="pill iw">REVIEW</span>' : ""}</div><div class="s">Depth ${x.depth.toFixed(0)} km · <a href="${esc(x.url)}" target="_blank" rel="noopener">USGS</a></div></div><span class="d">${ago(x.time)}</span></li>`).join("")}</ul>`;
      $("#sv-qm", el).innerHTML = tag("live", "USGS · " + q.length); }).catch(() => $("#sv-q", el).innerHTML = off("USGS feed"));
    hazards().then(v => { $("#sv-e", el).innerHTML = `<ul class="list">${v.slice(0, 50).map(x => `<li><span class="sev high" style="margin-top:6px"></span><div><div class="t">${esc(x.title)}</div><div class="s">${esc(x.cat)}${x.url ? ` · <a href="${esc(x.url)}" target="_blank" rel="noopener">source</a>` : ""}</div></div><span class="d">${dshort(x.date)}</span></li>`).join("")}</ul>`;
      $("#sv-em", el).innerHTML = tag("live", "NASA EONET · " + v.length); }).catch(() => $("#sv-e", el).innerHTML = off("NASA EONET"));
  }
};
