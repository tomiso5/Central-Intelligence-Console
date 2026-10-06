import { $, esc, store, me } from "../core.js";
import { I } from "./_icons.js";
import { providerSelect, mountChat } from "../aichat.js";
const GADGETS = [
  { id: "G-11", n: "Signet relay", d: "Ring with a short-range NFC key emulator for access-control testing. One-touch wipe.", st: "Ready", c: 92 },
  { id: "G-14", n: "Lapel channel", d: "Bone-conduction earpiece and pin mic on a frequency-hopping link to the handler.", st: "Ready", c: 78 },
  { id: "G-19", n: "Chronograph sweep", d: "Wristwatch with an RF sensor that buzzes on unknown transmitters nearby.", st: "Issued", c: 64 },
  { id: "G-22", n: "Faraday attaché", d: "Leather case lined to block cellular, GNSS and Wi-Fi. Stops a phone being tracked.", st: "Ready", c: 100 },
  { id: "G-27", n: "Swift micro-UAV", d: "Palm-sized quadcopter, 18 minutes' endurance, thermal camera, folds into a pen case.", st: "Maintenance", c: 35 },
  { id: "G-31", n: "Cufflink beacon", d: "Distress beacon with burst transmission to satellite. Seven days on standby.", st: "Ready", c: 88 },
  { id: "G-36", n: "Ink-pen scanner", d: "Document scanner in a working fountain pen. 400 pages, encrypted at rest.", st: "Ready", c: 71 },
  { id: "G-40", n: "Heel transmitter", d: "Shoe-heel unit that sends a last-known position when the wearer stops moving.", st: "Ready", c: 97 }];
export default {
  id: "q", title: "Q Branch", group: "Support", icon: I.q,
  render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Q Branch</h1><p>Fictional equipment held for issue. Request kit, run a training bug sweep, or put a question to the quartermaster through your own AI.</p></div></div>
    <div class="grid g12">
      <div class="panel key c12"><div class="ph"><h2>Inventory</h2><div class="meta" id="q-m"></div></div><div class="gadgets" id="q-g"></div></div>
      <div class="panel c6"><div class="ph"><h2>RF sweep (training)</h2><div class="meta"><span id="q-ss" class="note">Idle</span><button class="btn" id="q-sw">Run sweep</button></div></div><canvas class="spec" id="q-c" width="800" height="140"></canvas><ul class="list" id="q-sl"></ul></div>
      <div class="panel c6" style="min-height:400px"><div class="ph"><h2>Ask Q</h2><div class="meta"><select class="i" id="q-p" style="width:auto"></select></div></div><div class="chat" style="min-height:0;flex:1"><div class="chatlog" id="q-log"><div class="msg"><div class="h"><b>Q</b></div><div class="b">Do try not to break anything this time. What do you need?</div></div></div>
        <form class="chatin" id="q-f"><input class="i" id="q-t" placeholder="e.g. What would you issue for a week in a hostile city?" autocomplete="off"><button class="btn primary">Ask</button></form></div></div>
    </div>`;
    const paint = () => { const req = store.get("q:req", {});
      $("#q-g", el).innerHTML = GADGETS.map(g => { const r = req[g.id]; return `<div class="gadget"><div class="code">${g.id} · ${r ? "Requested" : g.st}</div><h3>${esc(g.n)}</h3><p>${esc(g.d)}</p><div class="meter"><i style="width:${g.c}%;background:${g.c < 40 ? "var(--amber)" : "var(--signal)"}"></i></div><div class="row"><span class="note">Charge ${g.c}%</span><button class="btn${r ? "" : " primary"}" style="margin-left:auto" data-req="${g.id}" ${g.st !== "Ready" ? "disabled" : ""}>${r ? "Withdraw" : g.st === "Ready" ? "Request issue" : g.st}</button></div></div>`; }).join("");
      $("#q-m", el).textContent = `${GADGETS.filter(g => g.st === "Ready").length} ready · ${Object.keys(req).length} requested`; };
    $("#q-g", el).onclick = e => { const b = e.target.closest("[data-req]"); if (!b) return; const r = store.get("q:req", {}); r[b.dataset.req] ? delete r[b.dataset.req] : r[b.dataset.req] = Date.now(); store.set("q:req", r); paint(); };
    paint();
    const cv = $("#q-c", el), cx = cv.getContext("2d");
    const draw = (t, found) => { const W = cv.width, H = cv.height; cx.fillStyle = "#0A1018"; cx.fillRect(0, 0, W, H); cx.strokeStyle = "#162235"; for (let x = 0; x < W; x += 50) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
      cx.beginPath(); cx.strokeStyle = "#5BC0B0"; for (let x = 0; x < W; x++) { let y = H - 18 - Math.random() * 10 - Math.sin(x / 9 + t / 120) * 3; found.forEach(f => { const d = Math.abs(x - f.x); if (d < 14) y -= f.p * (1 - d / 14); }); x ? cx.lineTo(x, y) : cx.moveTo(x, y); } cx.stroke();
      cx.fillStyle = "#5C6D85"; cx.font = "11px sans-serif"; ["400 MHz", "800", "1.8 GHz", "2.4", "5.8"].forEach((l, i) => cx.fillText(l, 6 + i * (W / 5), H - 4)); };
    draw(0, []);
    $("#q-sw", el).onclick = () => { $("#q-sl", el).innerHTML = ""; $("#q-ss", el).textContent = "Sweeping…"; const sigs = [{ x: 250, p: 60, n: "2.41 GHz · Wi-Fi access point (known)", k: "watch" }, { x: 340, p: 45, n: "868 MHz · smart meter (benign)", k: "watch" }];
      if (Math.random() < .6) sigs.push({ x: 120 + Math.random() * 560 | 0, p: 80, n: "Unregistered burst transmitter · intermittent", k: "critical" });
      const t0 = performance.now(); const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const step = t => { const e = t - t0; draw(e, sigs.filter(s => e > s.x * 4)); if (e < 3400 && !reduce) requestAnimationFrame(step); else { draw(e, sigs); $("#q-ss", el).textContent = sigs.some(s => s.k === "critical") ? "Anomaly found" : "Room clear";
        $("#q-sl", el).innerHTML = sigs.map(s => `<li><span class="sev ${s.k}" style="margin-top:6px"></span><div>${esc(s.n)}</div></li>`).join("") + `<li><div class="note">Training simulation only.</div></li>`; } };
      requestAnimationFrame(step); };
    const sel = providerSelect($("#q-p", el));
    mountChat({ form: $("#q-f", el), input: $("#q-t", el), log: $("#q-log", el), who: "Q", select: sel,
      rules: () => `You are "Q", the dry, witty, faintly exasperated quartermaster of a fictional spy agency's gadget branch, in a role-play app. You're talking to officer "${me().callsign}". Inventory: ${JSON.stringify(GADGETS.map(g => ({ id: g.id, name: g.n, desc: g.d, status: g.st })))}. Recommend kit from the inventory and invent playful fictional gadgets when asked. Stay in fiction and widely known general technology; never give real instructions for weapons, hacking, defeating security systems or covert surveillance of real people. Under 120 words, British English, no markdown.` });
  }
};
