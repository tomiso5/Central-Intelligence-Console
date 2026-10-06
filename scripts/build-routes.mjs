// Rebuild data/routes.min.json from Jonty/airline-route-data (updated weekly upstream).
// Usage: node scripts/build-routes.mjs
import { writeFile } from "node:fs/promises";
const SRC = "https://raw.githubusercontent.com/Jonty/airline-route-data/main/airline_routes.json";
const d = await (await fetch(SRC)).json();
const codes = Object.keys(d).filter(c => d[c].latitude && d[c].longitude).sort();
const idx = Object.fromEntries(codes.map((c, i) => [c, i]));
const carriers = new Map(), cl = [];
const ci = c => { const k = c.iata || c.name; if (!carriers.has(k)) { carriers.set(k, cl.length); cl.push([c.iata || "", c.name]); } return carriers.get(k); };
const airports = [], routes = [];
for (const c of codes) {
  const a = d[c];
  airports.push([c, a.name || "", a.city_name || "", a.country || "", a.country_code || "", +(+a.latitude).toFixed(3), +(+a.longitude).toFixed(3), a.continent || ""]);
  routes.push((a.routes || []).filter(r => r.iata in idx).map(r => [idx[r.iata], r.min || 0, ...r.carriers.map(ci)]));
}
await writeFile(new URL("../data/routes.min.json", import.meta.url), JSON.stringify({ v: 1, built: new Date().toISOString().slice(0, 10), source: "https://github.com/Jonty/airline-route-data", airports, carriers: cl, routes }));
console.log(`${airports.length} airports, ${routes.reduce((s, r) => s + r.length, 0)} routes, ${cl.length} carriers`);
