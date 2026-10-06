import { $, $$, esc, store, tag, ago, empty, relay, hasRelay, smartJSON, getJSON, decodeEntities, modal, toast, bus, segmented, debounce } from "../core.js";
import { I } from "./_icons.js";
import * as bsky from "../bsky.js";

/* ---------- configuration ---------- */
const DEFAULTS = {
  on: { tg: true, x: true, bsky: true, masto: true, reddit: true, gdelt: true },
  tg: ["DeepStateUA", "ClashReport"],
  x: "(missile OR drone OR airstrike OR airspace OR mobilization OR explosion) -is:retweet lang:en",
  bsky: "OSINT (missile OR drone OR strike OR airspace)",
  masto: { instance: "mastodon.social", tags: ["osint", "ukraine", "iran", "geopolitics"] },
  reddit: ["CredibleDefense", "geopolitics", "OSINT", "worldnews"],
  gdelt: "(airstrike OR missile OR drone OR mobilization OR \"military exercise\" OR evacuation)",
  official: ["DefenceHQ", "ukmto", "CENTCOM", "NATO", "IDF", "GeneralStaffUA", "mod_russia", "StateDept", "FCDOGovUK", "DeptofDefense", "EUCOM", "INDOPACOM"]
};
const cfg = () => ({ ...DEFAULTS, ...store.get("osint:cfg", {}) });

/* ---------- Indicators & Warnings taxonomy ---------- */
export const IW = [
  ["Strike / air raid", /\b(air ?strikes?|missiles?|ballistic|cruise missile|drone (strike|attack)|shahed|geran|intercept(ed|ion|or)|air raid|sirens?|rocket fire)\b/i],
  ["Airspace / NOTAM", /\b(notam|airspace (is )?(closed|closure|restricted)|flights? (suspended|diverted|cancell?ed)|no-fly|airport (closed|shut))\b/i],
  ["Naval activity", /\b(carrier (strike )?group|warships?|frigate|destroyer|submarine|naval|tanker (was )?(attacked|hit|seized)|ukmto|boarded|strait)\b/i],
  ["Troops / mobilisation", /\b(mobili[sz]ation|troops? (massing|build-?up|deploy)|military convoy|reservists?|redeploy|armou?red column)\b/i],
  ["Evacuation / diplomatic", /\b(embassy (evacuat|clos|suspend)|evacuat(e|ion|ing) (of )?(nationals|citizens|staff)|leave (the country )?immediately|ambassador (recalled|expelled))\b/i],
  ["Explosion / sabotage", /\b(explosions?|blasts?|sabotage|arson|detonat|fire at (a|an|the) (base|plant|depot|refinery))\b/i],
  ["Cyber / EW", /\b(gps (jamming|spoofing)|jamming|spoofing|cyber ?attack|ddos|internet (outage|shutdown)|blackout)\b/i],
  ["Nuclear / CBRN", /\b(nuclear|radiation|enrichment|uranium|chemical weapons?|iaea|radiological)\b/i],
  ["Unrest / coup", /\b(coup|martial law|curfew|state of emergency|riots?|mass protests?)\b/i]
];
// Gazetteer for place extraction (name, lat, lon).
const PLACES = `Kyiv,50.45,30.52|Kharkiv,49.99,36.23|Odesa,46.48,30.73|Odessa,46.48,30.73|Dnipro,48.46,35.05|Zaporizhzhia,47.84,35.14|Kherson,46.64,32.61|Donetsk,48.0,37.8|Pokrovsk,48.28,37.18|Kramatorsk,48.72,37.56|Sumy,50.91,34.8|Mykolaiv,46.97,32.0|Lviv,49.84,24.03|Luhansk,48.57,39.31|Kursk,51.73,36.19|Belgorod,50.6,36.59|Bryansk,53.24,34.36|Moscow,55.76,37.62|St Petersburg,59.93,30.36|Crimea,45.0,34.1|Sevastopol,44.6,33.52|Novorossiysk,44.72,37.77|Engels,51.48,46.11|Tehran,35.69,51.39|Isfahan,32.65,51.67|Natanz,33.72,51.73|Fordow,34.88,50.99|Bandar Abbas,27.18,56.27|Hormuz,26.57,56.25|Bushehr,28.97,50.84|Tabriz,38.08,46.29|Tel Aviv,32.08,34.78|Jerusalem,31.77,35.21|Haifa,32.79,34.99|Eilat,29.56,34.95|Gaza,31.5,34.47|Rafah,31.29,34.25|Khan Younis,31.35,34.3|West Bank,31.95,35.3|Jenin,32.46,35.3|Beirut,33.89,35.5|Tyre,33.27,35.2|Damascus,33.51,36.29|Aleppo,36.2,37.16|Idlib,35.93,36.63|Baghdad,33.31,44.37|Erbil,36.19,44.01|Sanaa,15.37,44.19|Aden,12.79,45.02|Hodeidah,14.8,42.95|Red Sea,20.0,38.5|Bab al-Mandab,12.6,43.3|Gulf of Aden,12.5,48.0|Riyadh,24.71,46.68|Dubai,25.2,55.27|Abu Dhabi,24.45,54.38|Doha,25.29,51.53|Kuwait,29.38,47.99|Bahrain,26.07,50.56|Muscat,23.59,58.41|Taiwan,23.7,121.0|Taipei,25.03,121.56|Kinmen,24.44,118.38|South China Sea,13.0,114.0|Scarborough Shoal,15.15,117.76|Manila,14.6,120.98|Pyongyang,39.03,125.75|Seoul,37.57,126.98|Tokyo,35.68,139.69|Okinawa,26.33,127.8|Beijing,39.9,116.4|Shanghai,31.23,121.47|Khartoum,15.5,32.56|El Fasher,13.63,25.35|El Obeid,13.18,30.22|Darfur,13.5,24.0|Port Sudan,19.62,37.22|Kordofan,12.5,29.5|Mogadishu,2.05,45.32|Tripoli,32.89,13.19|Benghazi,32.12,20.07|Bamako,12.64,-8.0|Niamey,13.51,2.11|Ouagadougou,12.37,-1.52|Goma,-1.68,29.22|Kinshasa,-4.44,15.27|Addis Ababa,9.03,38.74|Tigray,14.0,39.0|Caracas,10.48,-66.9|Port-au-Prince,18.59,-72.31|Islamabad,33.68,73.05|Karachi,24.86,67.0|Kashmir,34.08,74.8|New Delhi,28.61,77.21|Kabul,34.53,69.17|Yerevan,40.18,44.51|Baku,40.41,49.87|Tbilisi,41.72,44.78|Minsk,53.9,27.56|Vilnius,54.69,25.28|Riga,56.95,24.11|Tallinn,59.44,24.75|Warsaw,52.23,21.01|Kaliningrad,54.71,20.51|Chisinau,47.01,28.86|Transnistria,46.84,29.6|Belgrade,44.79,20.45|Pristina,42.66,21.17|Baltic Sea,57.0,19.0|Black Sea,43.4,34.0|London,51.51,-0.13|Paris,48.86,2.35|Berlin,52.52,13.4|Washington,38.9,-77.04|Guam,13.44,144.79|Diego Garcia,-7.32,72.42`
  .split("|").map(s => { const [n, a, b] = s.split(","); return { n, lat: +a, lon: +b, re: new RegExp("\\b" + n.replace(/ /g, "[\\s-]") + "\\b", "i") }; });

/* ---------- collectors ---------- */
const strip = h => decodeEntities(String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")).trim();
const C = {
  async tg(c) { if (!hasRelay()) throw new Error("Telegram needs your relay"); const out = [];
    await Promise.all(c.tg.map(async ch => { try { const j = await relay("/tg", { c: ch }); j.posts.forEach(p => out.push({ id: "tg:" + p.url, src: "Telegram", author: "@" + ch, text: p.text, ts: p.ts, url: p.url, media: p.photo })); } catch {} }));
    return out; },
  async x(c) { if (!hasRelay()) throw new Error("X needs your relay with an X API token"); const j = await relay("/x/search", { q: c.x });
    const users = Object.fromEntries((j.includes?.users || []).map(u => [u.id, u])); const media = Object.fromEntries((j.includes?.media || []).map(m => [m.media_key, m]));
    return (j.data || []).map(t => { const u = users[t.author_id] || {}; const mk = t.attachments?.media_keys?.[0];
      return { id: "x:" + t.id, src: "X", author: "@" + (u.username || "unknown"), name: u.name, text: t.text, ts: new Date(t.created_at).getTime(), url: `https://x.com/${u.username || "i"}/status/${t.id}`, media: mk && (media[mk]?.url || media[mk]?.preview_image_url), verified: u.verified }; }); },
  async bsky(c) { return bsky.search(c.bsky, 40); },
  async masto(c) { const out = [];
    await Promise.all(c.masto.tags.map(async t => { try { const j = await getJSON(`https://${c.masto.instance}/api/v1/timelines/tag/${encodeURIComponent(t)}?limit=20`);
      j.forEach(s => out.push({ id: "ma:" + s.url, src: "Mastodon", author: "@" + s.account.acct, name: s.account.display_name, text: strip(s.content), ts: new Date(s.created_at).getTime(), url: s.url, media: s.media_attachments?.[0]?.preview_url })); } catch {} }));
    return out; },
  async reddit(c) { const out = [];
    await Promise.all(c.reddit.map(async sub => { try { const j = await smartJSON(`https://www.reddit.com/r/${sub}/new.json?limit=20&raw_json=1`);
      j.data.children.forEach(({ data: d }) => out.push({ id: "rd:" + d.id, src: "Reddit", author: "r/" + sub + " · u/" + d.author, text: d.title + (d.selftext ? "\n" + d.selftext.slice(0, 280) : ""), ts: d.created_utc * 1000, url: "https://www.reddit.com" + d.permalink, media: d.preview?.images?.[0]?.source?.url || (/^https?:/.test(d.thumbnail) ? d.thumbnail : null) })); } catch {} }));
    return out; },
  async gdelt(c) { const j = await smartJSON(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(c.gdelt)}&mode=artlist&maxrecords=60&format=json&sort=datedesc&timespan=12h`);
    return (j.articles || []).map(a => { const s = a.seendate; const ts = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15));
      return { id: "gd:" + a.url, src: "News", author: a.domain + (a.sourcecountry ? " · " + a.sourcecountry : ""), text: a.title, ts, url: a.url, media: a.socialimage, news: true }; }); }
};
const SRC_IC = { Telegram: "TG", X: "X", Bluesky: "BS", Mastodon: "MA", Reddit: "RD", News: "NW" };

/* ---------- analysis ---------- */
function analyse(items, official) {
  const off = new Set(official.map(s => "@" + s.toLowerCase()));
  items.forEach(it => {
    it.iw = IW.filter(([, re]) => re.test(it.text)).map(([n]) => n);
    it.places = PLACES.filter(p => p.re.test(it.text)).map(p => p.n.replace("Odessa", "Odesa"));
    it.official = off.has(String(it.author).toLowerCase());
    it.cor = 0;
  });
  // Corroboration: other sources/authors reporting same place + same I&W category within 3 hours.
  for (const a of items) { if (!a.iw.length || !a.places.length) continue;
    const others = new Set();
    for (const b of items) { if (a === b || b.author === a.author || Math.abs(a.ts - b.ts) > 3 * 3600e3) continue;
      if (b.places.some(p => a.places.includes(p)) && b.iw.some(c => a.iw.includes(c))) others.add(b.src + b.author); }
    a.cor = others.size; }
  return items;
}

/* ---------- military air activity (ADS-B) ---------- */
const MIL_REGIONS = { "Europe & Baltic": [35, -12, 72, 32], "Black Sea & Ukraine": [40, 27, 56, 42], "Middle East & Gulf": [12, 32, 40, 62], "East Asia & Pacific": [0, 100, 50, 160], "North America": [15, -170, 72, -50] };
async function milAir() {
  let j; try { j = await smartJSON("https://api.adsb.lol/v2/mil"); } catch { j = await smartJSON("https://api.airplanes.live/v2/mil"); }
  const ac = j.ac || j.aircraft || [];
  const counts = Object.fromEntries(Object.entries(MIL_REGIONS).map(([k, [la1, lo1, la2, lo2]]) => [k, ac.filter(a => a.lat >= la1 && a.lat <= la2 && a.lon >= lo1 && a.lon <= lo2).length]));
  const hist = store.get("osint:milhist", []).filter(h => Date.now() - h.t < 24 * 3600e3); hist.push({ t: Date.now(), c: counts, total: ac.length }); store.set("osint:milhist", hist.slice(-200));
  const base = hist.filter(h => Date.now() - h.t > 30 * 60e3);
  const avg = k => base.length ? base.reduce((s, h) => s + (h.c[k] || 0), 0) / base.length : null;
  const tankers = ac.filter(a => /^(K35R|KC46|A332|K35E|A330|KC10|MRTT)/.test(a.t || "") || /^(QID|LAGR|BLUE|NCHO)/i.test((a.flight || "").trim()));
  return { total: ac.length, counts, avg, tankers: tankers.length, sample: ac.slice(0, 400), emergencies: ac.filter(a => ["7500", "7600", "7700"].includes(a.squawk)) };
}

/* ---------- view ---------- */
let items = [], filter = { src: "All", iw: false, cor: false, q: "" }, timer = null, running = false;
export default {
  id: "osint", title: "OSINT", group: "Operations", icon: I.osint,
  render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>OSINT collection</h1><p>Open-source reporting from Telegram, X, Bluesky, Mastodon, Reddit and world news, auto-tagged for indicators &amp; warnings and cross-checked across sources. Everything here is unverified until corroborated.</p></div>
      <div class="row"><input class="i" id="os-q" placeholder="Filter: place, unit, keyword" style="width:220px"><button class="btn" id="os-cfg">Sources</button><button class="btn primary" id="os-run">Start collection</button></div></div>
    <div class="grid g12">
      <div class="panel key c8"><div class="ph" style="flex-wrap:wrap"><div class="tabs" id="os-tabs" style="margin:0;border:0"></div><div class="meta"><label class="row note"><input type="checkbox" id="os-iw"> I&amp;W only</label><label class="row note"><input type="checkbox" id="os-cor"> Corroborated</label><span id="os-meta"></span></div></div>
        <div class="pb flush scroll feed" style="max-height:calc(100vh - 240px);min-height:400px" id="os-feed">${empty("Collection stopped", "Press Start collection to pull the latest posts. Add your relay under Connections to include Telegram and X.")}</div></div>
      <div class="c4 grid" style="align-content:start">
        <div class="panel"><div class="ph"><h2>Indicators &amp; warnings, last 6h</h2></div><div class="pb"><div class="bars2" id="os-iwb"></div></div></div>
        <div class="panel"><div class="ph"><h2>Military air activity</h2><div class="meta" id="os-milmeta"></div></div><div class="pb" id="os-mil"><span class="note">ADS-B military transponders worldwide. Starts with collection.</span></div></div>
        <div class="panel"><div class="ph"><h2>Most-mentioned places</h2></div><div class="pb" id="os-places"><span class="note">Waiting for data.</span></div></div>
        <div class="panel"><div class="ph"><h2>Verification checklist</h2></div><ul class="list">
          <li><div class="s">Who posted first? Trace to the original uploader and their track record.</div></li>
          <li><div class="s">Geolocate: match skyline, roads and terrain against satellite imagery.</div></li>
          <li><div class="s">Chronolocate: shadows, weather and timestamps against the claimed time.</div></li>
          <li><div class="s">Recycled? Reverse-image search for older copies of the media.</div></li>
          <li><div class="s">Corroborate with an independent source before acting or sharing.</div></li></ul></div>
      </div>
    </div>`;
    const tabs = ["All", "Telegram", "X", "Bluesky", "Mastodon", "Reddit", "News"];
    $("#os-tabs", el).innerHTML = tabs.map((t, i) => `<button data-src="${t}" aria-pressed="${i === 0}">${t}</button>`).join("");
    segmented($("#os-tabs", el), d => { filter.src = d.src; this.paint(); });
    $("#os-iw", el).onchange = e => { filter.iw = e.target.checked; this.paint(); };
    $("#os-cor", el).onchange = e => { filter.cor = e.target.checked; this.paint(); };
    $("#os-q", el).oninput = debounce(e => { filter.q = e.target.value.trim().toLowerCase(); this.paint(); }, 250);
    $("#os-run", el).onclick = () => running ? this.stop() : this.start();
    $("#os-cfg", el).onclick = () => this.config();
    $("#os-places", el).addEventListener("click", e => { const b = e.target.closest("[data-place]"); if (b) { $("#os-q", el).value = b.dataset.place; filter.q = b.dataset.place.toLowerCase(); this.paint(); } });
  },
  show(ctx, p) { if (p?.q) { const el = document.getElementById("v-osint"); $("#os-q", el).value = p.q; filter.q = p.q.toLowerCase(); this.paint(); if (!running) this.start(); } },
  start() { running = true; const b = $("#os-run"); b.textContent = "Pause collection"; b.classList.remove("primary"); this.collect(); timer = setInterval(() => this.collect(), 120000); },
  stop() { running = false; clearInterval(timer); const b = $("#os-run"); b.textContent = "Start collection"; b.classList.add("primary"); $("#os-meta").innerHTML = tag("off", "Paused"); },
  async collect() {
    const c = cfg(), el = document.getElementById("v-osint");
    $("#os-meta", el).innerHTML = tag("live", "Collecting…");
    const results = await Promise.allSettled(Object.keys(C).filter(k => c.on[k]).map(k => C[k](c).then(r => [k, r])));
    const errs = []; const fresh = [];
    results.forEach((r, i) => { if (r.status === "fulfilled") fresh.push(...r.value[1]); else errs.push(r.reason?.message || "error"); });
    const seen = new Map(items.map(x => [x.id, x])); fresh.forEach(x => seen.set(x.id, x));
    items = analyse([...seen.values()].filter(x => Date.now() - x.ts < 48 * 3600e3 && x.text).sort((a, b) => b.ts - a.ts).slice(0, 600), c.official);
    window.VT_OSINT = items;
    this.places(); this.paint(); this.board();
    $("#os-meta", el).innerHTML = tag("live", `${items.length} items · ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`) + (errs.length ? ` <span class="note" title="${esc([...new Set(errs)].join("\n"))}">${errs.length} source${errs.length > 1 ? "s" : ""} unavailable ⓘ</span>` : "");
    const flash = items.filter(i => i.iw.length && (i.cor || i.official)).slice(0, 10).map(i => `${i.places[0] || i.src} — ${i.text.replace(/\s+/g, " ").slice(0, 90)}`);
    if (flash.length) bus.dispatchEvent(new CustomEvent("ticker", { detail: flash }));
    milAir().then(m => this.mil(m)).catch(e => { $("#os-mil", el).innerHTML = `<span class="note">ADS-B feed unreachable (${esc(e.message)}). Configure the relay to route around CORS limits.</span>`; });
  },
  places() {
    const counts = {}; items.filter(i => Date.now() - i.ts < 12 * 3600e3).forEach(i => i.places.forEach(p => counts[p] = (counts[p] || 0) + 1));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    window.VT_OSINT_PLACES = top.map(([n, k]) => { const p = PLACES.find(x => x.n === n); return { name: n, n: k, lat: p.lat, lon: p.lon }; });
    dispatchEvent(new Event("vt-osint"));
    $("#os-places").innerHTML = top.length ? `<div class="row">${top.slice(0, 18).map(([n, k]) => `<button class="chip" data-place="${esc(n)}">${esc(n)} <b>${k}</b></button>`).join("")}</div><div class="row" style="margin-top:10px"><button class="btn ghost" data-go="map">Plot on conflict map</button></div>` : `<span class="note">No places recognised yet.</span>`;
  },
  board() {
    const recent = items.filter(i => Date.now() - i.ts < 6 * 3600e3);
    const rows = IW.map(([n]) => [n, recent.filter(i => i.iw.includes(n)).length, recent.filter(i => i.iw.includes(n) && i.cor).length]);
    const max = Math.max(1, ...rows.map(r => r[1]));
    $("#os-iwb").innerHTML = rows.map(([n, k, c]) => `<div class="b"><span>${esc(n)}</span><i style="width:${k / max * 100}%;${k ? "" : "opacity:.15;width:2px"}"></i><span class="note">${k}${c ? ` · ${c}✓` : ""}</span></div>`).join("");
  },
  mil(m) {
    const rows = Object.entries(m.counts).map(([k, v]) => { const a = m.avg(k); const d = a ? (v - a) / Math.max(1, a) * 100 : null;
      return `<li><div class="t" style="flex:1;font-weight:400">${esc(k)}</div><div style="min-width:40px;text-align:right;font-weight:600">${v}</div><div style="min-width:70px;text-align:right">${d == null ? '<span class="note">baseline…</span>' : `<span class="${d > 30 ? "dn" : d < -30 ? "up" : "note"}">${d > 0 ? "+" : ""}${d.toFixed(0)}%${d > 30 ? " surge" : ""}</span>`}</div></li>`; }).join("");
    $("#os-mil").innerHTML = `<ul class="list" style="margin:-10px -12px">${rows}</ul>
      <div class="note" style="margin-top:8px">${m.total} military aircraft broadcasting · ${m.tankers} likely tankers${m.emergencies.length ? ` · <b class="dn">${m.emergencies.length} emergency squawk${m.emergencies.length > 1 ? "s" : ""}</b>` : ""}. Baseline is built from your own sessions; most military aircraft don't broadcast.</div>
      <button class="btn ghost" data-go="radar" style="margin-top:8px">Open flight radar</button>`;
    $("#os-milmeta").innerHTML = tag("live", "ADS-B");
  },
  paint() {
    const el = document.getElementById("v-osint"); if (!el) return;
    const list = items.filter(i => (filter.src === "All" || i.src === filter.src) && (!filter.iw || i.iw.length) && (!filter.cor || i.cor > 0) && (!filter.q || (i.text + " " + i.author + " " + i.places.join(" ")).toLowerCase().includes(filter.q)));
    if (!items.length) return;
    $("#os-feed", el).innerHTML = list.length ? list.slice(0, 200).map(i => `
      <div class="item"><div class="src-ic" title="${i.src}">${SRC_IC[i.src]}</div><div style="min-width:0">
        <div class="who"><b>${esc(i.name || i.author)}</b><span>${esc(i.name ? i.author : "")}</span><span>· ${ago(i.ts)}</span>
          ${i.official ? '<span class="pill off">OFFICIAL</span>' : i.cor ? `<span class="pill cor">CORROBORATED ×${i.cor + 1}</span>` : i.news ? "" : '<span class="pill unv">UNVERIFIED</span>'}
          ${i.iw.map(c => `<span class="pill iw">${esc(c)}</span>`).join("")}</div>
        <div class="txt">${esc(i.text.slice(0, 700))}</div>
        ${i.media ? `<img class="media" loading="lazy" src="${esc(i.media)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
        <div class="row note" style="margin-top:4px">${i.places.map(p => `<span>📍 ${esc(p)}</span>`).join("")}<a href="${esc(i.url)}" target="_blank" rel="noopener">Open source</a><button class="btn ghost" style="padding:1px 8px" data-share="${esc(i.id)}">Share to chat</button></div>
      </div></div>`).join("") : empty("No items match", "Loosen the filters or wait for the next collection cycle.");
    $$("[data-share]", el).forEach(b => b.onclick = () => { const it = items.find(x => x.id === b.dataset.share); window.VT.go("comms", { share: `[${it.src}] ${it.text.slice(0, 280)}\n${it.url}` }); });
  },
  config() {
    const c = cfg();
    const d = modal("OSINT sources", `<form class="frm" id="oc">
      <div class="row">${Object.keys(C).map(k => `<label class="chip"><input type="checkbox" name="on_${k}" ${c.on[k] ? "checked" : ""}> ${({ tg: "Telegram", x: "X", bsky: "Bluesky", masto: "Mastodon", reddit: "Reddit", gdelt: "World news (GDELT)" })[k]}</label>`).join("")}</div>
      <label class="f">Telegram public channels (usernames, comma separated) — via relay<input class="i" name="tg" value="${esc(c.tg.join(", "))}"></label>
      <label class="f">X search query (X API v2 syntax) — via relay with your X bearer token<input class="i" name="x" value="${esc(c.x)}"></label>
      <label class="f">Bluesky search — sign in under Connections<input class="i" name="bsky" value="${esc(c.bsky)}"></label>
      <div class="frm two"><label class="f">Mastodon instance<input class="i" name="mi" value="${esc(c.masto.instance)}"></label><label class="f">Mastodon hashtags<input class="i" name="mt" value="${esc(c.masto.tags.join(", "))}"></label></div>
      <label class="f">Subreddits<input class="i" name="rd" value="${esc(c.reddit.join(", "))}"></label>
      <label class="f">World news query (GDELT syntax)<input class="i" name="gd" value="${esc(c.gdelt)}"></label>
      <label class="f">Official accounts (shown as OFFICIAL)<input class="i" name="of" value="${esc(c.official.join(", "))}"></label>
      <p class="note">Defaults are starting points, not endorsements. Many conflict channels are partisan; judge each source on its record.</p>
      <div class="row"><button class="btn primary">Save sources</button><button class="btn" type="button" id="oc-reset">Reset to defaults</button></div></form>`);
    const list = s => s.split(",").map(x => x.trim().replace(/^[@#]|^r\//, "")).filter(Boolean);
    $("#oc", d).onsubmit = e => { e.preventDefault(); const f = new FormData(e.target);
      store.set("osint:cfg", { on: Object.fromEntries(Object.keys(C).map(k => [k, f.get("on_" + k) === "on"])), tg: list(f.get("tg")), x: f.get("x"), bsky: f.get("bsky"), masto: { instance: f.get("mi").replace(/^https?:\/\//, "").replace(/\/.*/, ""), tags: list(f.get("mt")) }, reddit: list(f.get("rd")), gdelt: f.get("gd"), official: list(f.get("of")) });
      d.close(); toast("Sources saved", "ok"); if (running) this.collect(); };
    $("#oc-reset", d).onclick = () => { store.del("osint:cfg"); d.close(); toast("Sources reset"); };
  }
};
