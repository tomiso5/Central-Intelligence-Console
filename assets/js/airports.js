// Airports + nonstop route network (data/routes.min.json, built from github.com/Jonty/airline-route-data).
import { esc } from "./core.js";
let P = null;
export function load() {
  return P ||= fetch("data/routes.min.json").then(r => r.json()).then(d => {
    const ap = d.airports.map(([iata, name, city, country, cc, lat, lon, cont], i) => ({ i, iata, name, city, country, cc, lat, lon, cont }));
    const by = Object.fromEntries(ap.map(a => [a.iata, a]));
    const carriers = d.carriers.map(([iata, name]) => ({ iata, name }));
    const out = d.routes.map(list => list.map(([to, min, ...cs]) => ({ to: ap[to], min, carriers: cs.map(c => carriers[c]) })));
    const inbound = ap.map(() => []); out.forEach((l, from) => l.forEach(r => inbound[r.to.i].push({ from: ap[from], min: r.min, carriers: r.carriers })));
    ap.forEach(a => { a.n = out[a.i].length; });
    return { ap, by, carriers, out, inbound, built: d.built };
  });
}
export const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180; const d = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(d)); };
export async function search(q, limit = 8) {
  const { ap } = await load(); q = q.trim().toLowerCase(); if (!q) return [];
  const score = a => a.iata.toLowerCase() === q ? 1000 : a.city.toLowerCase().startsWith(q) ? 500 + a.n : a.name.toLowerCase().includes(q) ? 200 + a.n : a.country.toLowerCase().startsWith(q) ? 50 + a.n / 10 : -1;
  return ap.map(a => [score(a), a]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => x[1]);
}
/** Attach airport autocomplete to an <input>. Value becomes the IATA code. */
export function autocomplete(input, onPick) {
  const wrap = document.createElement("div"); wrap.className = "ac"; input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
  const menu = document.createElement("div"); menu.className = "menu"; wrap.appendChild(menu); let items = [], hl = 0;
  const render = () => { menu.innerHTML = items.map((a, i) => `<button type="button" data-i="${i}" class="${i === hl ? "hl" : ""}"><b>${a.iata}</b> ${esc(a.city)}<small>${esc(a.name)} · ${esc(a.country)}</small></button>`).join(""); menu.classList.toggle("open", items.length > 0); };
  const pick = a => { input.value = a.iata; input.dataset.label = `${a.city} (${a.iata})`; menu.classList.remove("open"); onPick && onPick(a); };
  input.addEventListener("input", async () => { items = await search(input.value); hl = 0; render(); });
  input.addEventListener("keydown", e => { if (!menu.classList.contains("open")) return; if (e.key === "ArrowDown") { hl = Math.min(items.length - 1, hl + 1); render(); e.preventDefault(); } else if (e.key === "ArrowUp") { hl = Math.max(0, hl - 1); render(); e.preventDefault(); } else if (e.key === "Enter") { e.preventDefault(); pick(items[hl]); } else if (e.key === "Escape") menu.classList.remove("open"); });
  menu.addEventListener("mousedown", e => { const b = e.target.closest("[data-i]"); if (b) { e.preventDefault(); pick(items[+b.dataset.i]); } });
  input.addEventListener("blur", () => setTimeout(() => menu.classList.remove("open"), 150));
}
