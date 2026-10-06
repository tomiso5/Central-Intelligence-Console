import { $, esc, store, me, dshort, toast } from "../core.js";
import { I } from "./_icons.js";
const TRAINING = ["Counter-intelligence awareness", "Hostile environment (HEAT)", "Protective security & vetting", "Cyber hygiene for travellers", "Surveillance detection", "First aid in the field"];
const P = () => ({ leave: [], train: {}, st: "London", ...store.get("hr", {}) });
const days = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 864e5) + 1);
export default {
  id: "hr", title: "Personnel", group: "Support", icon: I.hr,
  render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Personnel portal</h1><p>Your role-play service record, leave and training. Saved in this browser.</p></div></div>
    <div class="grid g12">
      <div class="panel key c4"><div class="ph"><h2>Service record</h2></div><div class="pb"><dl class="kv" id="hr-r"></dl>
        <form class="frm" id="hr-f" style="margin-top:14px"><label class="f">Callsign<input class="i" name="cs" maxlength="24"></label><label class="f">Station<select class="i" name="st">${["London", "Amsterdam", "Washington", "Brussels", "Istanbul", "Dubai", "Nairobi", "Singapore", "Tokyo"].map(s => `<option>${s}</option>`).join("")}</select></label><button class="btn">Update record</button></form></div></div>
      <div class="panel c4"><div class="ph"><h2>Leave</h2></div><div class="pb"><div class="tiles" style="grid-template-columns:1fr 1fr 1fr"><div class="tile"><div class="k">Entitlement</div><div class="v">30</div></div><div class="tile"><div class="k">Booked</div><div class="v" id="hr-b">0</div></div><div class="tile"><div class="k">Remaining</div><div class="v up" id="hr-left">30</div></div></div>
        <form class="frm" id="hr-lf" style="margin-top:12px"><div class="frm two"><label class="f">From<input class="i" type="date" name="a" required></label><label class="f">To<input class="i" type="date" name="b" required></label></div><button class="btn">Book leave</button></form><ul class="list" id="hr-ll" style="margin-top:8px"></ul></div></div>
      <div class="panel c4"><div class="ph"><h2>Mandatory training</h2><div class="meta" id="hr-tm"></div></div><ul class="list" id="hr-t"></ul></div>
    </div>`;
    const save = p => { store.set("hr", p); paint(); };
    const paint = () => { const p = P(), m = me();
      $("#hr-r", el).innerHTML = `<dt>Callsign</dt><dd>${esc(m.callsign)}</dd><dt>Terminal ID</dt><dd>${esc(m.id)}</dd><dt>Clearance</dt><dd>Developed Vetting (DV)</dd><dt>Station</dt><dd>${esc(p.st)}</dd><dt>Grade</dt><dd>Officer, Grade 7</dd>`;
      const F = $("#hr-f", el).elements; F.cs.value = m.callsign; F.st.value = p.st;
      const b = p.leave.reduce((s, l) => s + days(l.a, l.b), 0); $("#hr-b", el).textContent = b; $("#hr-left", el).textContent = 30 - b; $("#hr-left", el).className = "v " + (30 - b < 0 ? "dn" : "up");
      $("#hr-ll", el).innerHTML = p.leave.map((l, i) => `<li><div><div class="t">${dshort(l.a)} – ${dshort(l.b)}</div><div class="s">${days(l.a, l.b)} days · Approved</div></div><button class="btn ghost" data-lv="${i}" style="margin-left:auto">Cancel</button></li>`).join("");
      const done = TRAINING.filter(t => p.train[t]).length; $("#hr-tm", el).textContent = `${done} of ${TRAINING.length}`;
      $("#hr-t", el).innerHTML = TRAINING.map(t => `<li><label class="row" style="cursor:pointer;flex-wrap:nowrap"><input type="checkbox" data-tr="${esc(t)}" ${p.train[t] ? "checked" : ""}> <span>${esc(t)}</span></label><span class="d">${p.train[t] ? "Done " + dshort(p.train[t]) : "Due"}</span></li>`).join(""); };
    $("#hr-f", el).onsubmit = e => { e.preventDefault(); const F = e.target.elements; const cs = F.cs.value.trim().toUpperCase(); if (cs) { store.set("me", { ...me(), callsign: cs }); document.getElementById("agentName").textContent = cs; toast("Callsign updated. Friends see it next time you connect."); } save({ ...P(), st: F.st.value }); };
    $("#hr-lf", el).onsubmit = e => { e.preventDefault(); const F = e.target.elements; if (F.b.value < F.a.value) return toast("End date is before the start date", "bad"); const p = P(); p.leave.push({ a: F.a.value, b: F.b.value }); save(p); e.target.reset(); };
    $("#hr-ll", el).onclick = e => { const b = e.target.closest("[data-lv]"); if (b) { const p = P(); p.leave.splice(+b.dataset.lv, 1); save(p); } };
    $("#hr-t", el).onchange = e => { const t = e.target.dataset.tr; if (!t) return; const p = P(); if (e.target.checked) p.train[t] = new Date().toISOString(); else delete p.train[t]; save(p); };
    paint();
  }
};
