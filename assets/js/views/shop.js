import { $, $$, esc, store, empty, toast, relay, relayFeatures, setting, money, modal, ago } from "../core.js";
import { I } from "./_icons.js";

const DEEP = [
  ["Etsy", q => `https://www.etsy.com/search?q=${q}`],
  ["Vinted", q => `https://www.vinted.${setting("country") === "GB" ? "co.uk" : (setting("country") || "nl").toLowerCase()}/catalog?search_text=${q}`],
  ["Facebook Marketplace", q => `https://www.facebook.com/marketplace/search/?query=${q}`],
  ["Marktplaats", q => `https://www.marktplaats.nl/q/${q}/`],
  ["bol.com", q => `https://www.bol.com/nl/nl/s/?searchtext=${q}`],
  ["AliExpress", q => `https://www.aliexpress.com/wholesale?SearchText=${q}`],
  ["Amazon", q => `https://www.${setting("amazonDomain")}/s?k=${q}`],
  ["eBay", q => `https://www.${setting("ebayDomain")}/sch/i.html?_nkw=${q}`]
];
const num = v => typeof v === "number" ? v : v == null ? null : parseFloat(String(v).replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
const ENG = {
  amazon: { name: "Amazon", p: q => ({ engine: "amazon", k: q, amazon_domain: setting("amazonDomain") }),
    n: j => (j.organic_results || []).map(r => ({ store: "Amazon", title: r.title, url: r.link || r.link_clean, img: r.thumbnail, price: r.extracted_price ?? num(r.price), priceRaw: r.price, rating: r.rating, reviews: r.reviews, note: r.delivery?.[0] || (r.prime ? "Prime" : "") })) },
  ebay: { name: "eBay", p: q => ({ engine: "ebay", _nkw: q, ebay_domain: setting("ebayDomain") }),
    n: j => (j.organic_results || []).map(r => ({ store: "eBay", title: r.title, url: r.link, img: r.thumbnail, price: r.price?.extracted ?? r.price?.from?.extracted ?? num(r.price?.raw), priceRaw: r.price?.raw, rating: r.rating, reviews: r.reviews, note: [r.condition, r.shipping].filter(Boolean).join(" · ") })) },
  shopping: { name: "Google Shopping (Etsy, bol.com, Zalando…)", p: q => ({ engine: "google_shopping", q, gl: setting("country").toLowerCase(), hl: "en" }),
    n: j => (j.shopping_results || []).map(r => ({ store: r.source || "Shop", title: r.title, url: r.product_link || r.link, img: r.thumbnail, price: r.extracted_price ?? num(r.price), priceRaw: r.price, rating: r.rating, reviews: r.reviews, note: r.delivery || r.second_hand_condition || "" })) }
};
let results = [], picked = new Set();
export default {
  id: "shop", title: "Marketplace", group: "Logistics", icon: I.shop,
  render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Marketplace</h1><p>Search Amazon, eBay and hundreds of shops at once, compare prices side by side and keep a watchlist. Second-hand markets open with your search filled in.</p></div></div>
    <form class="panel key" id="sh-f"><div class="pb row"><input class="i" name="q" placeholder="What are you looking for?" style="flex:1;font-size:16px" required>
      ${Object.entries(ENG).map(([k, e]) => `<label class="chip"><input type="checkbox" name="e_${k}" checked> ${esc(e.name.split(" (")[0])}</label>`).join("")}<button class="btn primary">Search</button></div>
      <div class="pb row" style="border-top:1px solid var(--line)"><span class="note">Also search:</span>${DEEP.slice(0, 6).map(([n], i) => `<button class="chip" type="button" data-deep="${i}">${n} ↗</button>`).join("")}</div></form>
    <div class="grid g12" style="margin-top:12px">
      <div class="panel c9" style="grid-column:span 9"><div class="ph"><h2>Results</h2><div class="meta"><select class="i" id="sh-sort" style="width:auto"><option value="rel">Relevance</option><option value="pa">Price: low to high</option><option value="pd">Price: high to low</option><option value="r">Rating</option></select><select class="i" id="sh-store" style="width:auto"><option value="">All stores</option></select><input class="i" id="sh-max" type="number" placeholder="Max price" style="width:110px"><button class="btn" id="sh-cmp" disabled>Compare (0)</button></div></div>
        <div class="pb flush scroll" style="max-height:calc(100vh - 330px);min-height:400px" id="sh-r">${empty("Search to compare prices across stores")}</div></div>
      <div class="panel" style="grid-column:span 3"><div class="ph"><h2>Watchlist</h2></div><ul class="list" id="sh-w"></ul><div class="src">Prices shown are what you saw when you saved. Re-search to refresh.</div></div>
    </div>`;
    const f = $("#sh-f", el);
    f.onsubmit = e => { e.preventDefault(); this.search(f.elements.q.value.trim(), Object.keys(ENG).filter(k => f.elements["e_" + k].checked)); };
    f.onclick = e => { const b = e.target.closest("[data-deep]"); if (!b) return; const q = encodeURIComponent(f.elements.q.value.trim()); if (!q) return toast("Type a search first", "bad"); window.open(DEEP[+b.dataset.deep][1](q), "_blank", "noopener"); };
    ["#sh-sort", "#sh-store", "#sh-max"].forEach(s => $(s, el).oninput = () => this.paint());
    $("#sh-r", el).onclick = e => { const w = e.target.closest("[data-watch]"); if (w) { const r = results[+w.dataset.watch]; store.set("shop:watch", [{ ...r, saved: Date.now() }, ...store.get("shop:watch", []).filter(x => x.url !== r.url)].slice(0, 40)); this.watch(); toast("Added to watchlist", "ok"); }
      const c = e.target.closest("[data-cmp]"); if (c) { const i = +c.dataset.cmp; c.checked ? picked.add(i) : picked.delete(i); if (picked.size > 4) { picked.delete(i); c.checked = false; toast("Compare up to 4 items"); } $("#sh-cmp", el).textContent = `Compare (${picked.size})`; $("#sh-cmp", el).disabled = picked.size < 2; } };
    $("#sh-cmp", el).onclick = () => { const it = [...picked].map(i => results[i]);
      modal("Compare", `<div class="compare">${it.map(r => `<div><img src="${esc(r.img)}" alt="" style="width:100%;aspect-ratio:1;object-fit:contain;background:#fff"><div class="t" style="margin:8px 0">${esc(r.title)}</div><dl class="kv"><dt>Store</dt><dd>${esc(r.store)}</dd><dt>Price</dt><dd><b style="color:var(--brass2)">${r.price != null ? money(r.price) : esc(r.priceRaw || "—")}</b></dd><dt>Rating</dt><dd>${r.rating ? "★ " + r.rating + (r.reviews ? ` (${r.reviews})` : "") : "—"}</dd><dt>Details</dt><dd>${esc(r.note || "—")}</dd></dl><a class="btn primary" style="margin-top:10px" href="${esc(r.url)}" target="_blank" rel="noopener">Buy at ${esc(r.store)}</a></div>`).join("")}</div>`, { wide: true }); };
    $("#sh-w", el).onclick = e => { const b = e.target.closest("[data-rm]"); if (b) { store.set("shop:watch", store.get("shop:watch", []).filter(x => x.url !== b.dataset.rm)); this.watch(); } };
    this.watch();
  },
  async search(q, engines) {
    const el = document.getElementById("v-shop"); if (!q) return; picked.clear();
    const R = $("#sh-r", el); R.innerHTML = `<div class="empty thinking">Searching ${engines.length} marketplaces…</div>`;
    const f = await relayFeatures();
    if (!f?.features?.serpapi) { R.innerHTML = `<div class="empty"><b>In-portal results need your relay with a SerpApi key</b>Store APIs require secret keys that can't live in a public website. Until you add the relay, open each store with your search:<div class="row" style="margin-top:10px">${DEEP.map(([n, u]) => `<a class="btn" href="${esc(u(encodeURIComponent(q)))}" target="_blank" rel="noopener">${n} ↗</a>`).join("")}</div></div>`; return; }
    const settled = await Promise.allSettled(engines.map(k => relay("/serp", ENG[k].p(q)).then(ENG[k].n)));
    results = []; const errs = [];
    settled.forEach((s, i) => s.status === "fulfilled" ? results.push(...s.value) : errs.push(ENG[engines[i]].name + ": " + s.reason.message));
    // interleave for relevance
    results.forEach((r, i) => r.rank = i);
    const stores = [...new Set(results.map(r => r.store))].sort();
    $("#sh-store", el).innerHTML = `<option value="">All stores (${stores.length})</option>` + stores.map(s => `<option>${esc(s)}</option>`).join("");
    this.paint(); if (errs.length) toast(errs.join("; "), "bad");
  },
  paint() {
    const el = document.getElementById("v-shop"); if (!results.length) return;
    const s = $("#sh-sort", el).value, st = $("#sh-store", el).value, mx = parseFloat($("#sh-max", el).value) || Infinity;
    const list = results.map((r, i) => ({ r, i })).filter(({ r }) => (!st || r.store === st) && (r.price == null || r.price <= mx))
      .sort((a, b) => s === "pa" ? (a.r.price ?? 1e12) - (b.r.price ?? 1e12) : s === "pd" ? (b.r.price ?? -1) - (a.r.price ?? -1) : s === "r" ? (b.r.rating || 0) - (a.r.rating || 0) : a.r.rank - b.r.rank);
    const prices = list.map(x => x.r.price).filter(p => p != null); const lo = Math.min(...prices);
    $("#sh-r", el).innerHTML = list.length ? `<div class="cards">${list.map(({ r, i }) => `<div class="card"><img class="thumb" loading="lazy" src="${esc(r.img || "")}" alt="" style="object-fit:contain;background:#fff" onerror="this.style.visibility='hidden'"><div class="cb"><div class="store">${esc(r.store)}${r.price === lo ? ' · <span class="pill cor">LOWEST</span>' : ""}</div><div class="ct" title="${esc(r.title)}">${esc(r.title)}</div><div class="price">${r.price != null ? money(r.price) : esc(r.priceRaw || "—")}</div><div class="note">${r.rating ? "★ " + r.rating + (r.reviews ? ` (${r.reviews})` : "") + " · " : ""}${esc(r.note || "")}</div>
      <div class="row"><a class="btn primary" style="padding:4px 10px" href="${esc(r.url)}" target="_blank" rel="noopener">Buy</a><button class="btn ghost" style="padding:4px 10px" data-watch="${i}">☆ Watch</button><label class="note row" style="margin-left:auto"><input type="checkbox" data-cmp="${i}" ${picked.has(i) ? "checked" : ""}> Compare</label></div></div></div>`).join("")}</div>` : empty("No results match the filters");
  },
  watch() { const l = store.get("shop:watch", []); $("#sh-w").innerHTML = l.length ? l.map(r => `<li><img src="${esc(r.img || "")}" alt="" style="width:38px;height:38px;object-fit:contain;background:#fff;flex:none"><div style="min-width:0;flex:1"><div class="t" style="font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></div><div class="s">${esc(r.store)} · ${r.price != null ? money(r.price) : esc(r.priceRaw || "")} · ${ago(r.saved)} ago</div></div><button class="btn ghost" data-rm="${esc(r.url)}">✕</button></li>`).join("") : `<li>${empty("Nothing saved yet")}</li>`; }
};
