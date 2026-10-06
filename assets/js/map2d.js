// Lightweight 2D world map (Natural Earth projection, pre-projected paths in data/world.json)
import { $, esc, ago } from "./core.js";

let geoReady = null;
export function loadGeometry() {
  return geoReady ||= fetch("data/world.json").then(r => r.json()).then(g => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("width", 0); s.setAttribute("height", 0); s.style.position = "absolute"; s.setAttribute("aria-hidden", "true");
    s.innerHTML = `<defs><path id="g-sphere" d="${g.sphere}"/><path id="g-grat" d="${g.grat}"/><path id="g-land" d="${g.land}"/><path id="g-bord" d="${g.borders}"/></defs>`;
    document.body.prepend(s);
  });
}
export function proj(lon, lat) {
  const l = lon * Math.PI / 180, f = lat * Math.PI / 180, f2 = f * f, f4 = f2 * f2;
  const x = l * (0.8707 - 0.131979 * f2 + f4 * (-0.013791 + f4 * (0.003971 * f2 - 0.001529 * f4)));
  const y = f * (1.007226 + f2 * (0.015085 + f4 * (-0.044475 + 0.028874 * f2 - 0.005916 * f4)));
  return [480 + x * 175, 250 - y * 175];
}
const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
export const REGIONS = { world: [0, 10, 960, 480], europe: [400, 40, 250, 140], mena: [520, 110, 200, 120], africa: [400, 140, 320, 300], asia: [700, 60, 260, 220], americas: [60, 40, 380, 420] };

export function makeMap(host, { interactive = true, onSelect } = {}) {
  loadGeometry();
  const svg = el("svg", { viewBox: "0 0 960 500", role: "img", "aria-label": "World map" }); host.appendChild(svg);
  const base = el("g", {}, svg);
  el("use", { href: "#g-sphere", class: "m-sphere" }, base); el("use", { href: "#g-grat", class: "m-grat" }, base);
  el("use", { href: "#g-land", class: "m-land" }, base); el("use", { href: "#g-bord", class: "m-bord" }, base);
  const layers = {}; ["events", "gdelt", "quakes", "osint", "iss", "hot"].forEach(k => layers[k] = el("g", { "data-layer": k }, svg));
  let vb = REGIONS.world.slice();
  const apply = () => { svg.setAttribute("viewBox", vb.join(" ")); const k = vb[2] / 960;
    svg.querySelectorAll("[data-r]").forEach(c => c.setAttribute("r", c.dataset.r * k));
    svg.querySelectorAll("[data-sz]").forEach(g => g.setAttribute("transform", `translate(${g.dataset.x} ${g.dataset.y}) scale(${k})`)); };
  const fit = () => { const r = host.getBoundingClientRect(); if (!r.width || !r.height) return; const a = r.width / r.height; let [x, y, w, h] = vb; const cx = x + w / 2, cy = y + h / 2; if (w / h > a) h = w / a; else w = h * a; vb = [cx - w / 2, cy - h / 2, w, h]; apply(); };
  const tip = $("#maptip");
  const showTip = (e, html) => { tip.innerHTML = html; tip.style.display = "block"; tip.style.left = Math.min(e.clientX + 14, innerWidth - 280) + "px"; tip.style.top = (e.clientY + 14) + "px"; };
  const hideTip = () => tip.style.display = "none";
  if (interactive) {
    let drag = null;
    svg.addEventListener("pointerdown", e => { if (e.target.closest(".mk")) return; drag = { x: e.clientX, y: e.clientY, vb: vb.slice() }; svg.setPointerCapture?.(e.pointerId); svg.classList.add("drag"); });
    svg.addEventListener("pointermove", e => { if (!drag) return; const r = svg.getBoundingClientRect(); const s = vb[2] / r.width; vb[0] = drag.vb[0] - (e.clientX - drag.x) * s; vb[1] = drag.vb[1] - (e.clientY - drag.y) * s; apply(); });
    const end = () => { drag = null; svg.classList.remove("drag"); }; svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
    svg.addEventListener("wheel", e => { e.preventDefault(); const r = svg.getBoundingClientRect(); const mx = vb[0] + (e.clientX - r.left) / r.width * vb[2], my = vb[1] + (e.clientY - r.top) / r.height * vb[3];
      const f = e.deltaY > 0 ? 1.2 : 1 / 1.2; const nw = Math.min(1400, Math.max(40, vb[2] * f)); const k = nw / vb[2]; vb = [mx - (mx - vb[0]) * k, my - (my - vb[1]) * k, nw, vb[3] * k]; apply(); }, { passive: false });
    const tools = document.createElement("div"); tools.className = "maptools";
    tools.innerHTML = `<button aria-label="Zoom in">+</button><button aria-label="Zoom out">−</button><button aria-label="Reset view">⟲</button>`; host.appendChild(tools);
    const zoom = f => { const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2; vb = [cx - vb[2] * f / 2, cy - vb[3] * f / 2, vb[2] * f, vb[3] * f]; apply(); };
    tools.children[0].onclick = () => zoom(1 / 1.4); tools.children[1].onclick = () => zoom(1.4); tools.children[2].onclick = () => { vb = REGIONS.world.slice(); fit(); };
  }
  const dot = (layer, cls, lon, lat, r, html, click) => { const [x, y] = proj(lon, lat); const c = el("circle", { class: cls, cx: x, cy: y, "data-r": r }, layer);
    if (html) { c.addEventListener("mouseenter", e => showTip(e, html)); c.addEventListener("mouseleave", hideTip); }
    if (click) { c.style.cursor = "pointer"; c.addEventListener("click", () => { hideTip(); click(); }); } return c; };
  const api = {
    setHot(items, selId) {
      layers.hot.innerHTML = "";
      items.forEach(h => { const [x, y] = proj(h.lon, h.lat);
        const g = el("g", { class: `mk ${h.sev}${h.id === selId ? " sel" : ""}`, tabindex: interactive ? 0 : -1, role: "button", "aria-label": h.title }, layers.hot);
        if (h.sev === "critical") el("circle", { class: "ring", cx: x, cy: y, "data-r": 5 }, g);
        el("circle", { class: "core", cx: x, cy: y, "data-r": h.sev === "critical" ? 5 : h.sev === "high" ? 4.2 : 3.5 }, g);
        g.addEventListener("mouseenter", e => showTip(e, `<b>${esc(h.name)}</b> · ${esc(h.region)}<br>${esc(h.title)}`)); g.addEventListener("mouseleave", hideTip);
        g.addEventListener("click", () => { hideTip(); onSelect && onSelect(h); }); g.addEventListener("keydown", e => { if (e.key === "Enter") onSelect && onSelect(h); });
      }); apply();
    },
    setQuakes(list) { layers.quakes.innerHTML = ""; list.forEach(q => dot(layers.quakes, "qk", q.lon, q.lat, Math.max(1.5, (q.mag - 2) * 1.6), `<b>M${q.mag.toFixed(1)}</b> ${esc(q.place)}<br>${ago(q.time)} ago · depth ${q.depth.toFixed(0)} km`)); apply(); },
    setGdelt(list) { layers.gdelt.innerHTML = ""; list.forEach(g => dot(layers.gdelt, "gd", g.lon, g.lat, Math.min(6, 1.5 + Math.log2(1 + g.count)), `<b>${esc(g.name)}</b><br>${g.count} report${g.count > 1 ? "s" : ""} in 24h (GDELT)`)); apply(); },
    setOsint(list, click) { layers.osint.innerHTML = ""; list.forEach(o => dot(layers.osint, "os", o.lon, o.lat, Math.min(7, 2 + o.n), `<b>${esc(o.name)}</b><br>${o.n} OSINT mention${o.n > 1 ? "s" : ""}`, click && (() => click(o)))); apply(); },
    setEvents(list) { layers.events.innerHTML = ""; list.forEach(v => { const [x, y] = proj(v.lon, v.lat); const g = el("g", { "data-sz": 1, "data-x": x, "data-y": y }, layers.events);
      const r = el("rect", { class: "ev", x: -2.2, y: -2.2, width: 4.4, height: 4.4, transform: "rotate(45)" }, g); r.addEventListener("mouseenter", e => showTip(e, `<b>${esc(v.cat)}</b><br>${esc(v.title)}`)); r.addEventListener("mouseleave", hideTip); }); apply(); },
    setIss(pos, trail) { layers.iss.innerHTML = ""; if (!pos) return;
      if (trail?.length > 1) { let d = "", prev = null; trail.forEach(p => { const [x, y] = proj(p[0], p[1]); d += (prev !== null && Math.abs(p[0] - prev) > 90 ? "M" : (d ? "L" : "M")) + x.toFixed(1) + " " + y.toFixed(1); prev = p[0]; }); el("path", { class: "isstrail", d }, layers.iss); }
      const [x, y] = proj(pos[0], pos[1]); const g = el("g", { "data-sz": 1, "data-x": x, "data-y": y }, layers.iss);
      el("circle", { class: "iss", cx: 0, cy: 0, r: 4 }, g); el("path", { class: "iss", d: "M-8 0h4M4 0h4M0 -8v4M0 4v4" }, g); apply(); },
    toggle(k, on) { layers[k].style.display = on ? "" : "none"; },
    region(k) { vb = REGIONS[k].slice(); fit(); }, fit
  };
  new ResizeObserver(() => fit()).observe(host);
  return api;
}
