import { $, $$, esc, store, me, uid, bus, hasRelay, relayFeatures, toast } from "./core.js";
import { intel } from "./data.js";
import * as ai from "./ai.js";
import * as google from "./google.js";

// Views (each exports: id, title, group, icon, render(el, ctx), show?(ctx))
import situation from "./views/situation.js";
import conflict from "./views/conflict.js";
import osint from "./views/osint.js";
import radar from "./views/radar.js";
import surv from "./views/surveillance.js";
import cyber from "./views/cyber.js";
import markets from "./views/markets.js";
import analyst from "./views/analyst.js";
import mail from "./views/mail.js";
import comms from "./views/comms.js";
import meet from "./views/meet.js";
import social from "./views/social.js";
import directory from "./views/directory.js";
import travel from "./views/travel.js";
import routes from "./views/routes.js";
import ride from "./views/ride.js";
import food from "./views/food.js";
import shop from "./views/shop.js";
import personnel from "./views/personnel.js";
import q from "./views/qbranch.js";
import aihub from "./views/aihub.js";
import connections from "./views/connections.js";

const VIEWS = [situation, conflict, osint, radar, surv, cyber, markets, analyst, mail, comms, meet, social, directory, travel, routes, ride, food, shop, personnel, q, aihub, connections];
const GROUPS = ["Operations", "Communications", "Logistics", "Support"];
const byId = Object.fromEntries(VIEWS.map(v => [v.id, v]));
const inited = new Set();

function buildNav() {
  $("#rail").innerHTML = GROUPS.map(g => `<h6>${g}</h6>` + VIEWS.filter(v => v.group === g).map(v =>
    `<button data-go="${v.id}"><svg viewBox="0 0 24 24">${v.icon}</svg>${esc(v.title)}<span class="cnt" id="cnt-${v.id}"></span></button>`).join("")).join("");
}
export function go(id, params) {
  const v = byId[id] || situation;
  let sec = $("#v-" + v.id);
  if (!sec) { sec = document.createElement("section"); sec.className = "view"; sec.id = "v-" + v.id; $("#main").appendChild(sec); }
  $$(".view").forEach(s => s.classList.toggle("on", s === sec));
  $$("#rail button").forEach(b => b.setAttribute("aria-current", b.dataset.go === v.id ? "page" : "false"));
  if (!inited.has(v.id)) { inited.add(v.id); try { v.render(sec, ctx); } catch (e) { console.error(e); sec.innerHTML = `<div class="err">This section failed to load: ${esc(e.message)}</div>`; } }
  try { v.show && v.show(ctx, params); } catch (e) { console.error(e); }
  $("#main").scrollTop = 0; store.set("view", v.id);
  if (location.hash.slice(2) !== v.id && !location.hash.includes("=")) history.replaceState(null, "", "#/" + v.id);
}
export const ctx = { go, ai, google, count(id, n) { const c = $("#cnt-" + id); if (!c) return; c.textContent = n; c.classList.toggle("show", n > 0); } };
window.VT = ctx;
document.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) { e.preventDefault(); go(b.dataset.go); } });

/* clocks & header */
const ZONES = [["London", "Europe/London", 1], ["Washington", "America/New_York"], ["Moscow", "Europe/Moscow"], ["Kyiv", "Europe/Kyiv"], ["Tehran", "Asia/Tehran"], ["Beijing", "Asia/Shanghai"], ["Tokyo", "Asia/Tokyo"]];
function clocks() {
  $("#clocks").innerHTML = ZONES.map(([n, z, h], i) => `<div class="clock${h ? " home" : ""}"><div class="t" id="ck${i}">--:--</div><div class="n">${n}<span id="cw${i}"></span></div></div>`).join("");
  const tick = () => { const d = new Date();
    $("#utc").textContent = d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) + " · " + d.toLocaleTimeString("en-GB", { timeZone: "UTC" }) + " UTC";
    ZONES.forEach(([, z], i) => $("#ck" + i).textContent = d.toLocaleTimeString("en-GB", { timeZone: z, hour: "2-digit", minute: "2-digit" })); };
  tick(); setInterval(tick, 1000);
}
async function header() {
  const I = await intel();
  const lv = ["LOW", "MODERATE", "SUBSTANTIAL", "SEVERE", "CRITICAL"], i = lv.indexOf(I.threat.level);
  $("#threatLvl").textContent = I.threat.level; $$("#threatBox .bars i").forEach((el, k) => el.classList.toggle("on", k <= i));
  $("#threatBox").title = `${I.threat.meaning}. Raised ${I.threat.since}. Source: ${I.threat.src}`;
  setTicker(I.ticker);
}
export function setTicker(items) { const h = items.map(t => `<span>${esc(t)}</span>`).join(""); $("#ticker").innerHTML = h + h; }
bus.addEventListener("ticker", e => setTicker(e.detail));
function setAgent() { const m = me(); $("#agentName").textContent = m.callsign; $("#agentBadge").textContent = (m.callsign || "?")[0]; }
async function status() {
  const parts = [];
  parts.push(google.signedIn() ? "Google" : null);
  parts.push(ai.readyProviders().length ? ai.readyProviders().length + " AI" : null);
  if (hasRelay()) { const f = await relayFeatures(); parts.push(f?.ok ? "Relay" : "Relay offline"); }
  const p = parts.filter(Boolean);
  $("#agentSt").textContent = p.length ? "Linked: " + p.join(" · ") : "No accounts linked yet";
}
bus.addEventListener("settings", status); bus.addEventListener("google", status);

/* boot */
function boot() {
  const m = me();
  if (m.callsign && m.id) $("#callsign").value = m.callsign;
  $("#bootForm").onsubmit = e => {
    e.preventDefault();
    const cs = $("#callsign").value.trim().toUpperCase().replace(/[^A-Z0-9 -]/g, "") || "KESTREL";
    store.set("me", { ...m, id: m.id || uid(12), callsign: cs }); setAgent();
    const lines = ["Verifying callsign " + cs + " …", "Key exchange ……… local only", "Loading public intelligence feeds …", "Opening secure channels …", "Access granted."];
    const log = $("#bootLog"); let i = 0; const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = () => { log.textContent += (i ? "\n" : "") + lines[i++]; if (i < lines.length) setTimeout(next, reduce ? 0 : 280);
      else setTimeout(() => { $("#boot").classList.add("gone"); setTimeout(() => $("#boot").remove(), 700); bus.dispatchEvent(new Event("booted")); }, reduce ? 0 : 400); };
    next();
  };
  $("#callsign").focus();
}

/* hash routing, incl. invite links: #add=<id>&cs=<callsign> and #join=<channel>&k=<key> */
function route() {
  const h = location.hash;
  if (h.startsWith("#add=") || h.startsWith("#join=")) { const p = new URLSearchParams(h.slice(1)); go("comms", Object.fromEntries(p)); history.replaceState(null, "", "#/comms"); return; }
  const id = h.replace(/^#\/?/, "");
  go(byId[id] ? id : (store.get("view") || "situation"));
}
window.addEventListener("hashchange", () => { const id = location.hash.replace(/^#\/?/, ""); if (byId[id]) go(id); else if (location.hash.includes("=")) route(); });

buildNav(); clocks(); header().catch(e => toast("Couldn't load intel snapshot: " + e.message, "bad")); setAgent(); boot(); route(); status();
// Messaging connects in the background so friends see you online wherever you are in the portal.
bus.addEventListener("booted", () => {
  const h = new Date().getHours(), g = document.getElementById("greet");
  if (g) g.textContent = `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}, ${me().callsign}`;
  comms.background && comms.background(ctx);
});
