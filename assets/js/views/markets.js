import { $, esc, tag, fmt, pct, empty } from "../core.js";
import { I } from "./_icons.js";
import { intel, fx, crypto, quotes, QUOTES } from "../data.js";
const spark = arr => { if (!arr || arr.length < 2) return ""; const mn = Math.min(...arr), mx = Math.max(...arr), w = 120, h = 26; const d = arr.map((v, i) => `${i ? "L" : "M"}${(i / (arr.length - 1) * w).toFixed(1)} ${(h - (v - mn) / ((mx - mn) || 1) * h).toFixed(1)}`).join(""); return `<svg width="${w}" height="${h}" style="display:block;margin-top:4px"><path d="${d}" fill="none" stroke="${arr[arr.length - 1] >= arr[0] ? "var(--signal)" : "var(--alert)"}" stroke-width="1.3"/></svg>`; };
export default {
  id: "mkt", title: "Markets", group: "Operations", icon: I.mkt,
  async render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Markets &amp; economy</h1><p>Equities, energy, metals, currencies and digital assets, with the signals that matter for the security picture.</p></div></div>
    <div class="grid g12">
      <div class="panel key c12"><div class="ph"><h2>Indices, energy &amp; rates</h2><div class="meta" id="mk-qm"></div></div><div class="tiles" id="mk-q"></div></div>
      <div class="panel c6"><div class="ph"><h2>Sterling cross rates</h2><div class="meta" id="mk-fm"></div></div><div class="tiles" id="mk-f"></div></div>
      <div class="panel c6"><div class="ph"><h2>Digital assets</h2><div class="meta" id="mk-cm"></div></div><div class="tiles" id="mk-c"></div></div>
      <div class="panel c12"><div class="ph"><h2>Economic signals</h2><div class="meta" id="mk-nm"></div></div><ul class="list" id="mk-n"></ul></div>
    </div>`;
    const I2 = await intel(); const M = I2.markets;
    $("#mk-n", el).innerHTML = M.notes.map(n => `<li><div>${esc(n)}</div></li>`).join(""); $("#mk-nm", el).innerHTML = tag("snap", M.asOf + " · " + M.src);
    const snap = () => { $("#mk-q", el).innerHTML = [...M.indices, ...M.commodities].map(x => `<div class="tile"><div class="k">${esc(x.k)}</div><div class="v">${fmt(x.v)}</div>${pct(x.c)}<div class="x">${esc(x.note || M.asOf)}</div></div>`).join(""); $("#mk-qm", el).innerHTML = tag("snap", "Snapshot · connect a relay for live quotes"); };
    const live = () => quotes().then(q => { $("#mk-q", el).innerHTML = QUOTES.map(([s, n]) => { const x = q.quotes?.[s]; return x ? `<div class="tile"><div class="k">${n}</div><div class="v">${fmt(x.price)}</div>${pct(x.changePct)}${spark(x.spark)}<div class="x">${esc(x.currency || "")} · ${x.time ? new Date(x.time * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</div></div>` : ""; }).join(""); $("#mk-qm", el).innerHTML = tag("live", "Live · Yahoo Finance via relay"); }).catch(snap);
    live(); setInterval(() => el.classList.contains("on") && live(), 180000);
    fx().then(j => { $("#mk-f", el).innerHTML = Object.entries(j.rates).map(([k, v]) => `<div class="tile"><div class="k">GBP / ${k}</div><div class="v">${fmt(v, k === "JPY" ? 2 : 4)}</div><div class="x">ECB reference ${esc(j.date)}</div></div>`).join(""); $("#mk-fm", el).innerHTML = tag("live", "Frankfurter"); }).catch(() => $("#mk-f", el).innerHTML = empty("Currency feed unreachable"));
    crypto().then(j => { const n = { bitcoin: "Bitcoin", ethereum: "Ether", "pax-gold": "PAX Gold (gold proxy)", tether: "Tether" };
      $("#mk-c", el).innerHTML = Object.keys(n).filter(k => j[k]).map(k => `<div class="tile"><div class="k">${n[k]}</div><div class="v">$${fmt(j[k].usd, k === "tether" ? 4 : 2)}</div>${pct(j[k].usd_24h_change)}<div class="x">£${fmt(j[k].gbp)} · €${fmt(j[k].eur)}</div></div>`).join(""); $("#mk-cm", el).innerHTML = tag("live", "CoinGecko"); }).catch(() => $("#mk-c", el).innerHTML = empty("Crypto feed unreachable"));
  }
};
