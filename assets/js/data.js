// Shared live data feeds (cached), used by several views.
import { getJSON, smartJSON, relay, hasRelay } from "./core.js";

const cache = {};
const cached = (key, ttl, fn) => {
  const c = cache[key];
  if (c && Date.now() - c.t < ttl) return c.p;
  const p = fn().catch(e => { delete cache[key]; throw e; });
  cache[key] = { t: Date.now(), p }; return p;
};
export const invalidate = k => delete cache[k];

export const intel = () => cached("intel", 1e9, () => getJSON("data/intel.json"));
export const SEVORDER = { critical: 0, high: 1, elevated: 2, watch: 3, medium: 2, info: 3 };
export const snapLabel = i => "Snapshot " + new Date(i.asOf).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
export const hotspots = async () => [...(await intel()).hotspots].sort((a, b) => SEVORDER[a.sev] - SEVORDER[b.sev] || b.date.localeCompare(a.date));

export const quakes = () => cached("quakes", 5 * 60e3, async () => {
  const j = await getJSON("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson");
  return j.features.map(f => ({ id: f.id, mag: f.properties.mag || 0, place: f.properties.place || "Unknown", time: f.properties.time, url: f.properties.url, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2] || 0 })).sort((a, b) => b.time - a.time);
});
export const hazards = () => cached("eonet", 15 * 60e3, async () => {
  const j = await getJSON("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=80");
  return j.events.map(v => { const g = v.geometry[v.geometry.length - 1]; let c = g.coordinates; if (Array.isArray(c[0])) c = Array.isArray(c[0][0]) ? c[0][0] : c[0];
    return { title: v.title, cat: v.categories[0]?.title || "Event", lon: c[0], lat: c[1], date: g.date, url: v.sources?.[0]?.url }; }).filter(v => isFinite(v.lon));
});
export const iss = () => getJSON("https://api.wheretheiss.at/v1/satellites/25544", { timeout: 6000 });
export const kev = () => cached("kev", 60 * 60e3, async () => {
  const j = await getJSON("https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json", { timeout: 20000 });
  return { count: j.count, list: j.vulnerabilities.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)).slice(0, 25) };
});
export const wire = () => cached("wire", 10 * 60e3, async () => {
  const j = await getJSON("https://hn.algolia.com/api/v1/search_by_date?tags=story&query=vulnerability%20OR%20breach%20OR%20ransomware&hitsPerPage=30");
  return j.hits.filter(x => x.title && /vulnerab|breach|ransom|exploit|hack|zero-day|malware|CVE|attack|leak|spyware/i.test(x.title));
});
export const fx = () => cached("fx", 30 * 60e3, () => getJSON("https://api.frankfurter.app/latest?from=GBP&to=USD,EUR,JPY,CHF,CNY,AED"));
export const crypto = () => cached("crypto", 2 * 60e3, () => getJSON("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,pax-gold,tether&vs_currencies=usd,gbp,eur&include_24hr_change=true"));
export const WX = [["London", 51.51, -0.13], ["Washington", 38.9, -77.04], ["Moscow", 55.76, 37.62], ["Kyiv", 50.45, 30.52], ["Tehran", 35.69, 51.39], ["Beijing", 39.9, 116.4], ["Tokyo", 35.68, 139.69]];
export const weather = () => cached("wx", 20 * 60e3, async () => {
  const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${WX.map(w => w[1])}&longitude=${WX.map(w => w[2])}&current=temperature_2m,weather_code,wind_speed_10m`);
  return Array.isArray(j) ? j : [j];
});
export const WCODE = c => c === 0 ? "Clear" : c <= 3 ? "Cloud" : c <= 48 ? "Fog" : c <= 57 ? "Drizzle" : c <= 67 ? "Rain" : c <= 77 ? "Snow" : c <= 82 ? "Showers" : c <= 99 ? "Storm" : "—";
// GDELT 2.0 GEO API: geolocated news mentions of conflict terms in the last 24h.
export const gdeltGeo = () => cached("gdeltgeo", 30 * 60e3, async () => {
  const q = encodeURIComponent("(airstrike OR missile OR shelling OR drone strike OR artillery OR military offensive)");
  const j = await smartJSON(`https://api.gdeltproject.org/api/v2/geo/geo?query=${q}&mode=PointData&format=GeoJSON&timespan=24h&maxpoints=300`);
  return (j.features || []).map(f => ({ name: f.properties.name, count: f.properties.count || 1, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], html: f.properties.html })).filter(x => isFinite(x.lat));
});
// Index & commodity quotes through the relay (Yahoo Finance chart endpoint).
export const QUOTES = [["^GSPC", "S&P 500"], ["^IXIC", "Nasdaq Comp."], ["^DJI", "Dow Jones"], ["^FTSE", "FTSE 100"], ["^GDAXI", "DAX"], ["^AEX", "AEX"], ["^N225", "Nikkei 225"], ["^HSI", "Hang Seng"], ["BZ=F", "Brent crude"], ["CL=F", "WTI crude"], ["GC=F", "Gold"], ["NG=F", "Natural gas"], ["^TNX", "US 10Y yield"], ["^VIX", "VIX"]];
export const quotes = () => cached("quotes", 3 * 60e3, async () => {
  if (!hasRelay()) throw Object.assign(new Error("Relay needed for live index quotes"), { code: "no_relay" });
  return relay("/quotes", { s: QUOTES.map(q => q[0]).join(",") });
});
