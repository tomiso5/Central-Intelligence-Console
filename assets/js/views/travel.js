import { $, $$, esc, store, tag, empty, money, dur, toast, relay, hasRelay, relayFeatures, modal, postNewTab, isoDate, addDays, setting, makeLeaflet, segmented, me } from "../core.js";
import { I } from "./_icons.js";
import * as AP from "../airports.js";
import { hotspots } from "../data.js";
import { stream, providerSelect } from "../aichat.js";

const serp = p => relay("/serp", { hl: "en", currency: setting("currency"), ...p });
const needRelay = what => `<div class="empty"><b>${what} needs your relay with a SerpApi key</b>Live prices come from Google Flights and Google Hotels via SerpApi, which requires a secret key that can't live in a public website. Deploy the included relay (5 minutes, free tier) and add <span class="kbd">SERPAPI_KEY</span>. See README › Relay.<div style="margin-top:10px"><button class="btn" data-go="connections">Open Connections</button></div></div>`;
let lastQ = null, trips = () => store.get("trips", []);
const fmtT = s => s ? s.split(" ").pop() : "";
function offerHTML(o, i, mode) {
  const f = o.flights || [], first = f[0] || {}, last = f[f.length - 1] || {};
  const stops = f.length - 1; const airlines = [...new Set(f.map(x => x.airline))].join(", ");
  return `<div class="offer"><img class="logo" src="${esc(o.airline_logo || first.airline_logo || "")}" alt="" onerror="this.style.visibility='hidden'">
    <div class="legs"><div class="leg"><div><div class="tm">${esc(fmtT(first.departure_airport?.time))}</div><div class="note">${esc(first.departure_airport?.id)}</div></div><div class="line"><span>${dur(o.total_duration)} · ${stops ? stops + " stop" + (stops > 1 ? "s" : "") : "Nonstop"}</span></div><div><div class="tm">${esc(fmtT(last.arrival_airport?.time))}</div><div class="note">${esc(last.arrival_airport?.id)}</div></div></div>
      <div class="note">${esc(airlines)} · ${f.map(x => esc(x.flight_number)).join(" + ")}${o.layovers?.length ? " · via " + o.layovers.map(l => `${esc(l.id)} (${dur(l.duration)})`).join(", ") : ""}${first.airplane ? " · " + esc(first.airplane) : ""}${o.carbon_emissions ? ` · ${Math.round(o.carbon_emissions.this_flight / 1000)} kg CO₂${o.carbon_emissions.difference_percent ? ` (${o.carbon_emissions.difference_percent > 0 ? "+" : ""}${o.carbon_emissions.difference_percent}%)` : ""}` : ""}</div>
      ${f.some(x => x.legroom) ? `<div class="note">Legroom ${esc(first.legroom || "")} · ${esc((first.extensions || []).slice(0, 3).join(" · "))}</div>` : ""}</div>
    <div class="pr"><b>${o.price ? money(o.price) : "—"}</b><span class="note">${esc(o.type || "")}</span><div style="margin-top:6px"><button class="btn primary" data-pick="${i}">${mode === "out" ? "Select outbound" : mode === "ret" ? "Select return" : "Booking options"}</button></div></div></div>`;
}

const FLIGHTS = {
  async search(host, q) {
    lastQ = q; const R = $("#tr-fr", host); R.innerHTML = `<div class="empty thinking">Searching live fares ${esc(q.departure_id)} → ${esc(q.arrival_id)}…</div>`;
    store.set("trips", [{ o: q.departure_id, d: q.arrival_id, a: q.outbound_date, b: q.return_date, ts: Date.now() }, ...trips()].slice(0, 30)); paintTrips(host);
    const f = await relayFeatures();
    if (!f?.features?.serpapi) { R.innerHTML = needRelay("Live fares") + await FLIGHTS.schedule(q); return; }
    try { const j = await serp({ engine: "google_flights", ...q }); FLIGHTS.render(host, j, q.type === "1" ? "out" : "one", q); }
    catch (e) { R.innerHTML = `<div class="err">${esc(e.message)}</div>` + await FLIGHTS.schedule(q); }
  },
  render(host, j, mode, q, chosen) {
    const R = $("#tr-fr", host); const all = [...(j.best_flights || []), ...(j.other_flights || [])];
    const pi = j.price_insights;
    R.innerHTML = `${pi ? `<div class="tiles" style="grid-template-columns:repeat(4,1fr)"><div class="tile"><div class="k">Lowest</div><div class="v">${money(pi.lowest_price)}</div></div><div class="tile"><div class="k">Price level</div><div class="v" style="text-transform:capitalize">${esc(pi.price_level || "—")}</div></div><div class="tile"><div class="k">Typical</div><div class="v" style="font-size:16px">${pi.typical_price_range ? money(pi.typical_price_range[0]) + "–" + money(pi.typical_price_range[1]) : "—"}</div></div><div class="tile"><div class="k">Options</div><div class="v">${all.length}</div></div></div>` : ""}
      ${chosen ? `<div class="note" style="padding:8px 12px;border-bottom:1px solid var(--line)">Outbound selected: ${esc(chosen)}. Now choose your return.</div>` : ""}
      ${all.length ? all.map((o, i) => offerHTML(o, i, mode)).join("") : empty("No flights found", "Try other dates or nearby airports.")}
      <div class="src">Fares from Google Flights via SerpApi. Prices can change at checkout.</div>`;
    R.onclick = async e => { const b = e.target.closest("[data-pick]"); if (!b) return; const o = all[+b.dataset.pick]; b.disabled = true; b.textContent = "Loading…";
      try {
        if (mode === "out" && o.departure_token) { const r = await serp({ engine: "google_flights", ...q, departure_token: o.departure_token }); FLIGHTS.render(host, r, "ret", q, `${o.flights[0].flight_number} ${fmtT(o.flights[0].departure_airport.time)} · ${money(o.price)}`); }
        else if (o.booking_token) FLIGHTS.book(await serp({ engine: "google_flights", ...q, booking_token: o.booking_token }), o);
        else toast("No booking options returned for this fare", "bad");
      } catch (err) { toast(err.message, "bad"); b.disabled = false; } };
  },
  book(j, o) {
    const opts = j.booking_options || [];
    const d = modal("Booking options", `${(j.selected_flights || [o]).map(s => `<div class="note">${(s.flights || []).map(f => `${esc(f.flight_number)} ${esc(f.departure_airport?.id)} ${esc(fmtT(f.departure_airport?.time))} → ${esc(f.arrival_airport?.id)} ${esc(fmtT(f.arrival_airport?.time))}`).join(" · ")}</div>`).join("")}
      <ul class="list" style="margin-top:10px">${opts.length ? opts.map((b, i) => { const t = b.together || b.departing || {}; return `<li><div style="flex:1"><div class="t">${esc(t.book_with || "Provider")}${t.airline ? ' <span class="pill cor">AIRLINE</span>' : ""}</div><div class="s">${esc((t.extensions || []).slice(0, 4).join(" · "))}${t.marketed_as ? " · " + esc(t.marketed_as.join(", ")) : ""}</div></div><b style="color:var(--brass2);font-size:17px">${t.price ? money(t.price) : ""}</b><button class="btn primary" data-b="${i}">Continue</button></li>`; }).join("") : `<li>${empty("No booking partners returned")}</li>`}</ul>
      <p class="note">Payment happens on the airline or agent's own site, so your card details never pass through this terminal.</p>`, { wide: true });
    d.onclick = e => { const b = e.target.closest("[data-b]"); if (!b) return; const t = opts[+b.dataset.b].together || opts[+b.dataset.b].departing; const r = t.booking_request; if (r?.url) postNewTab(r.url, r.post_data || ""); else toast("This option has no checkout link", "bad"); };
  },
  async schedule(q) {
    const { by, out } = await AP.load(); const a = by[q.departure_id], b = by[q.arrival_id]; if (!a || !b) return "";
    const direct = out[a.i].find(r => r.to.iata === b.iata);
    const via = out[a.i].map(r => [r, out[r.to.i].find(x => x.to.iata === b.iata)]).filter(([, y]) => y).sort((x, y) => (x[0].min + x[1].min) - (y[0].min + y[1].min)).slice(0, 6);
    return `<div class="pb"><h3 style="margin:0 0 6px;font:500 18px var(--serif)">Schedule intelligence (no prices)</h3>${direct ? `<p>Nonstop ${esc(a.iata)} → ${esc(b.iata)}: about ${dur(direct.min)}, flown by ${esc(direct.carriers.map(c => c.name).join(", "))}.</p>` : `<p>No nonstop service ${esc(a.iata)} → ${esc(b.iata)}.</p>`}
      ${via.length ? `<p class="note">Fastest one-stop connections:</p><ul class="list">${via.map(([x, y]) => `<li><div class="t">via ${esc(x.to.iata)} (${esc(x.to.city)})</div><div class="s" style="margin-left:auto">${dur(x.min)} + ${dur(y.min)} flying · ${esc(x.carriers[0]?.name || "")} / ${esc(y.carriers[0]?.name || "")}</div></li>`).join("")}</ul>` : ""}</div>`;
  }
};

const HOTELS = {
  async search(host, q) {
    const R = $("#tr-hr", host); R.innerHTML = `<div class="empty thinking">Searching hotels in ${esc(q.q)}…</div>`;
    const f = await relayFeatures(); if (!f?.features?.serpapi) { R.innerHTML = needRelay("Live hotel prices"); return; }
    try { const j = await serp({ engine: "google_hotels", gl: setting("country").toLowerCase(), ...q }); const props = j.properties || [];
      R.innerHTML = `<div class="mapwrap" style="height:260px" id="tr-hmap"></div><div class="cards">${props.map((p, i) => `<div class="card"><img class="thumb" loading="lazy" src="${esc(p.images?.[0]?.thumbnail || "")}" alt="" onerror="this.style.visibility='hidden'"><div class="cb"><div class="ct">${esc(p.name)}</div><div class="store">${p.hotel_class ? esc(p.hotel_class) + " · " : ""}${p.overall_rating ? "★ " + p.overall_rating + ` (${p.reviews || 0})` : ""}</div><div class="price">${esc(p.rate_per_night?.lowest || "—")}<span class="note"> /night</span></div><div class="note">${p.total_rate?.lowest ? esc(p.total_rate.lowest) + " total · " : ""}${esc((p.amenities || []).slice(0, 3).join(", "))}</div><div class="row"><button class="btn primary" data-h="${i}">Details &amp; rates</button></div></div></div>`).join("") || empty("No hotels found")}</div><div class="src">Rates from Google Hotels via SerpApi.</div>`;
      const pts = props.filter(p => p.gps_coordinates);
      if (pts.length) { const m = await makeLeaflet($("#tr-hmap", host), [pts[0].gps_coordinates.latitude, pts[0].gps_coordinates.longitude], 12); const L = window.L; const grp = [];
        pts.forEach((p, i) => { const mk = L.circleMarker([p.gps_coordinates.latitude, p.gps_coordinates.longitude], { radius: 7, color: "#C8A35A", fillOpacity: .8 }).addTo(m).bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.rate_per_night?.lowest || "")}`); grp.push(mk.getLatLng()); });
        m.fitBounds(grp, { padding: [20, 20] }); }
      R.onclick = e => { const b = e.target.closest("[data-h]"); if (b) HOTELS.detail(props[+b.dataset.h], q); };
    } catch (e) { R.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  },
  async detail(p, q) {
    const d = modal(p.name, `<div class="thinking">Loading rates from every provider…</div>`, { wide: true }); const B = d.querySelector(".pb");
    try { const j = p.property_token ? await serp({ engine: "google_hotels", ...q, property_token: p.property_token }) : p;
      const imgs = (j.images || p.images || []).slice(0, 8);
      B.innerHTML = `<div class="row" style="overflow-x:auto;flex-wrap:nowrap;gap:6px">${imgs.map(x => `<img src="${esc(x.thumbnail || x.original_image)}" alt="" style="height:150px;border:1px solid var(--line)" loading="lazy">`).join("")}</div>
        <div class="grid" style="grid-template-columns:1.2fr 1fr;gap:16px;margin-top:12px"><div>
          <p>${esc(j.description || p.description || "")}</p><dl class="kv"><dt>Address</dt><dd>${esc(j.address || "—")}</dd><dt>Phone</dt><dd>${esc(j.phone || "—")}</dd><dt>Check-in</dt><dd>${esc(j.check_in_time || p.check_in_time || "—")}</dd><dt>Check-out</dt><dd>${esc(j.check_out_time || p.check_out_time || "—")}</dd><dt>Rating</dt><dd>${j.overall_rating ? "★ " + j.overall_rating + ` from ${j.reviews} reviews` : "—"}</dd></dl>
          <p class="note">${esc((j.amenities || p.amenities || []).join(" · "))}</p>
          ${(j.reviews_breakdown || []).length ? `<div class="bars2">${j.reviews_breakdown.slice(0, 6).map(r => `<div class="b"><span>${esc(r.name)}</span><i style="width:${r.positive / Math.max(1, r.total_mentioned) * 100}%;background:var(--signal)"></i><span class="note">${Math.round(r.positive / Math.max(1, r.total_mentioned) * 100)}%</span></div>`).join("")}</div>` : ""}</div>
          <div><h3 style="margin:0 0 6px;font:500 17px var(--serif)">Rates by provider</h3><ul class="list">${[...(j.featured_prices || []), ...(j.prices || [])].map(r => `<li>${r.logo ? `<img class="logo" src="${esc(r.logo)}" alt="">` : ""}<div style="flex:1"><div class="t">${esc(r.source)}${r.official ? ' <span class="pill cor">OFFICIAL</span>' : ""}</div><div class="s">${esc(r.rate_per_night?.lowest || "")} /night${r.total_rate?.lowest ? " · " + esc(r.total_rate.lowest) + " total" : ""}${r.free_cancellation ? " · free cancellation" : ""}</div></div>${r.link ? `<a class="btn primary" href="${esc(r.link)}" target="_blank" rel="noopener">Book</a>` : ""}</li>`).join("") || `<li>${empty("No provider rates returned")}</li>`}</ul>
          <p class="note">You complete the booking with the provider, so payment details never touch this terminal.</p></div></div>`;
    } catch (e) { B.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }
};
function paintTrips(host) { const l = trips(); $("#tr-trips", host).innerHTML = l.length ? l.slice(0, 8).map(t => `<li class="click" data-trip='${esc(JSON.stringify(t))}'><div><div class="t">${esc(t.o)} → ${esc(t.d)}</div><div class="s">${esc(t.a)}${t.b ? " – " + esc(t.b) : " · one way"}</div></div><span class="d">Search again</span></li>`).join("") : `<li>${empty("No trips yet")}</li>`; }

export default {
  id: "travel", title: "Travel desk", group: "Logistics", icon: I.travel,
  render(el) {
    const d0 = isoDate(addDays(14)), d1 = isoDate(addDays(21));
    el.innerHTML = `
    <div class="vhead"><div><h1>Travel desk</h1><p>Live fares and hotel rates inside the terminal, with booking options from airlines and agents. Check the destination against current reporting before you go.</p></div></div>
    <div class="tabs" id="tr-tabs"><button data-t="fl" aria-pressed="true">Flights</button><button data-t="ht">Hotels</button><button data-t="risk">Destination risk</button></div>
    <div id="tr-fl"><div class="grid g12">
      <div class="panel key c4"><div class="ph"><h2>Search flights</h2></div><form class="pb frm" id="tr-ff">
        <div class="frm two"><label class="f">From<input class="i" name="o" value="AMS" required></label><label class="f">To<input class="i" name="d" placeholder="City or code" required></label></div>
        <div class="frm two"><label class="f">Depart<input class="i" type="date" name="a" value="${d0}" required></label><label class="f">Return<input class="i" type="date" name="b" value="${d1}"></label></div>
        <div class="frm two"><label class="f">Travellers<select class="i" name="p"><option>1</option><option>2</option><option>3</option><option>4</option></select></label><label class="f">Cabin<select class="i" name="c"><option value="1">Economy</option><option value="2">Premium economy</option><option value="3">Business</option><option value="4">First</option></select></label></div>
        <label class="row note"><input type="checkbox" name="ns"> Nonstop only</label>
        <button class="btn primary">Search live fares</button></form>
        <div class="ph"><h2>Recent searches</h2></div><ul class="list" id="tr-trips"></ul></div>
      <div class="panel c8"><div class="ph"><h2>Results</h2><div class="meta" id="tr-fm"></div></div><div class="pb flush scroll" style="max-height:calc(100vh - 270px);min-height:420px" id="tr-fr">${empty("Search to see live fares", "Pick airports from the suggestions as you type.")}</div></div>
    </div></div>
    <div id="tr-ht" hidden><div class="grid g12">
      <div class="panel key c4"><div class="ph"><h2>Search hotels</h2></div><form class="pb frm" id="tr-hf">
        <label class="f">Destination<input class="i" name="q" placeholder="Tokyo, Shinjuku" required></label>
        <div class="frm two"><label class="f">Check in<input class="i" type="date" name="a" value="${d0}" required></label><label class="f">Check out<input class="i" type="date" name="b" value="${d1}" required></label></div>
        <div class="frm two"><label class="f">Guests<select class="i" name="g"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label><label class="f">Sort<select class="i" name="s"><option value="">Relevance</option><option value="3">Lowest price</option><option value="8">Highest rating</option><option value="13">Most reviewed</option></select></label></div>
        <label class="f">Minimum rating<select class="i" name="r"><option value="">Any</option><option value="7">3.5+</option><option value="8">4.0+</option><option value="9">4.5+</option></select></label>
        <button class="btn primary">Search hotels</button></form></div>
      <div class="panel c8"><div class="ph"><h2>Hotels</h2></div><div class="pb flush scroll" style="max-height:calc(100vh - 270px);min-height:420px" id="tr-hr">${empty("Search to see hotel rates")}</div></div>
    </div></div>
    <div id="tr-risk" hidden><div class="panel key"><div class="ph"><h2>Destination risk</h2><div class="meta"><select class="i" id="tr-rp" style="width:auto"></select></div></div><div class="pb">
      <div class="row"><input class="i" id="tr-rd" placeholder="Destination country, e.g. Japan" style="flex:1"><button class="btn" id="tr-fcdo">FCDO travel advice</button><button class="btn primary" id="tr-ai">Draft risk brief with my AI</button></div>
      <div class="out" id="tr-ro" style="margin-top:12px"><span class="note">Draft a brief from the latest reporting in this terminal, or open the official FCDO page for the country.</span></div></div></div></div>`;
    segmented($("#tr-tabs", el), d => { $("#tr-fl", el).hidden = d.t !== "fl"; $("#tr-ht", el).hidden = d.t !== "ht"; $("#tr-risk", el).hidden = d.t !== "risk"; });
    const ff = $("#tr-ff", el); AP.autocomplete(ff.elements.o); AP.autocomplete(ff.elements.d, a => { $("#tr-rd", el).value = a.country; });
    ff.onsubmit = e => { e.preventDefault(); const F = ff.elements; const q = { departure_id: F.o.value.trim().toUpperCase(), arrival_id: F.d.value.trim().toUpperCase(), outbound_date: F.a.value, type: F.b.value ? "1" : "2", travel_class: F.c.value, adults: F.p.value };
      if (F.b.value) q.return_date = F.b.value; if (F.ns.checked) q.stops = "1"; FLIGHTS.search(el, q); };
    $("#tr-trips", el).onclick = e => { const li = e.target.closest("[data-trip]"); if (!li) return; const t = JSON.parse(li.dataset.trip); const F = ff.elements; F.o.value = t.o; F.d.value = t.d; F.a.value = t.a; F.b.value = t.b || ""; ff.requestSubmit(); };
    paintTrips(el);
    $("#tr-hf", el).onsubmit = e => { e.preventDefault(); const F = e.target.elements; const q = { q: F.q.value, check_in_date: F.a.value, check_out_date: F.b.value, adults: F.g.value }; if (F.s.value) q.sort_by = F.s.value; if (F.r.value) q.rating = F.r.value; HOTELS.search(el, q); };
    const sel = providerSelect($("#tr-rp", el));
    $("#tr-fcdo", el).onclick = () => { const c = $("#tr-rd", el).value.trim(); if (c) window.open("https://www.gov.uk/foreign-travel-advice/" + c.toLowerCase().replace(/&/g, "and").replace(/[^a-z\s-]/g, "").trim().replace(/\s+/g, "-"), "_blank", "noopener"); };
    $("#tr-ai", el).onclick = async () => { const c = $("#tr-rd", el).value.trim(); if (!c) return $("#tr-rd", el).focus(); const H = await hotspots();
      stream($("#tr-ro", el), { provider: sel.value, maxTokens: 900, system: "You are a travel security analyst. Use general knowledge plus only the dated reporting supplied; never invent current events. Plain text, short labelled lines, no markdown.",
        messages: [{ role: "user", content: `Pre-travel risk brief for ${me().callsign}. Destination: ${c}. Dates: ${ff.elements.a.value} to ${ff.elements.b.value}. Include overall risk (low/medium/high/extreme), 4–6 key risks with mitigations, airspace/route considerations, digital security for the trip, and a reminder to check FCDO advice. Under 280 words.\nREPORTING: ${JSON.stringify(H.map(h => ({ place: h.name, region: h.region, sev: h.sev, date: h.date, summary: h.summary })))}` }] }); };
  },
  show(ctx, p) { if (p?.from || p?.to) { const el = document.getElementById("v-travel"); const F = $("#tr-ff", el).elements; if (p.from) F.o.value = p.from; if (p.to) F.d.value = p.to; $$("#tr-tabs button", el)[0].click(); if (p.from && p.to) $("#tr-ff", el).requestSubmit(); } }
};
