import { $, esc, store, empty, toast, uid, confirmBox } from "../core.js";
import { I } from "./_icons.js";
export default {
  id: "dir", title: "Directory", group: "Communications", icon: I.dir,
  render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Directory</h1><p>Your contacts and terminal friends, plus emergency lines. Stored in this browser.</p></div><input class="i" id="dr-s" placeholder="Filter by name, station or role" style="max-width:300px"></div>
    <div class="grid g12">
      <div class="panel key c8"><div class="ph"><h2>Contacts</h2><div class="meta" id="dr-m"></div><button class="btn ghost" id="dr-exp">Export vCard</button></div><div class="pb flush scroll" style="max-height:calc(100vh - 260px)" id="dr-l"></div></div>
      <div class="c4 grid" style="align-content:start">
        <div class="panel"><div class="ph"><h2>Add contact</h2></div><form class="pb frm" id="dr-f"><label class="f">Name<input class="i" name="n" required></label>
          <div class="frm two"><label class="f">Role<input class="i" name="r"></label><label class="f">Station<input class="i" name="s"></label></div>
          <label class="f">Email<input class="i" name="e" type="email"></label><label class="f">Phone<input class="i" name="p" type="tel"></label><button class="btn primary">Save contact</button></form></div>
        <div class="panel"><div class="ph"><h2>Emergency lines</h2></div><ul class="list">
          <li><div><div class="t">FCDO consular assistance, 24h</div><div class="s"><a href="tel:+442070085000">+44 20 7008 5000</a></div></div></li>
          <li><div><div class="t">UK Anti-Terrorist Hotline</div><div class="s"><a href="tel:0800789321">0800 789 321</a> · <a href="https://act.campaign.gov.uk/" target="_blank" rel="noopener">report online</a></div></div></li>
          <li><div><div class="t">Emergency services</div><div class="s">UK <a href="tel:999">999</a> · EU <a href="tel:112">112</a> · US <a href="tel:911">911</a></div></div></li>
          <li><div><div class="t">NCSC incident reporting</div><div class="s"><a href="https://report.ncsc.gov.uk/" target="_blank" rel="noopener">report.ncsc.gov.uk</a></div></div></li></ul></div>
      </div></div>`;
    const paint = () => { const q = $("#dr-s", el).value.toLowerCase(); const fr = store.get("fr:list", []).map(f => ({ id: "fr:" + f.id, n: f.cs, r: "Terminal friend", s: "", friend: f.id }));
      const all = [...fr, ...store.get("dir:list", [])].filter(c => !q || [c.n, c.r, c.s].join(" ").toLowerCase().includes(q));
      $("#dr-m", el).textContent = all.length + " shown";
      $("#dr-l", el).innerHTML = all.length ? `<ul class="list">${all.map(c => `<li><div style="width:32px;height:32px;border:1px solid var(--line2);display:grid;place-items:center;font:600 13px var(--serif);color:var(--brass2);flex:none">${esc((c.n || "?").split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase())}</div><div style="flex:1"><div class="t">${esc(c.n)}</div><div class="s">${esc([c.r, c.s].filter(Boolean).join(" · "))}</div></div><div class="row" style="flex-wrap:nowrap">${c.friend ? `<button class="btn ghost" data-go="comms">Message</button>` : ""}${c.e ? `<a class="btn ghost" href="mailto:${esc(c.e)}">Email</a>` : ""}${c.p ? `<a class="btn ghost" href="tel:${esc(c.p)}">Call</a><a class="btn ghost" href="https://wa.me/${esc(c.p.replace(/[^\d]/g, ""))}" target="_blank" rel="noopener">WhatsApp</a>` : ""}${!c.friend ? `<button class="btn ghost" data-del="${c.id}">✕</button>` : ""}</div></li>`).join("")}</ul>` : empty("No contacts yet", "Add one with the form, or add friends in Field messages."); };
    $("#dr-s", el).oninput = paint;
    $("#dr-f", el).onsubmit = e => { e.preventDefault(); const o = Object.fromEntries(new FormData(e.target)); o.id = uid(); store.set("dir:list", [...store.get("dir:list", []), o].sort((a, b) => a.n.localeCompare(b.n))); e.target.reset(); paint(); toast("Contact saved", "ok"); };
    $("#dr-l", el).onclick = async e => { const b = e.target.closest("[data-del]"); if (b && await confirmBox("Delete contact?", "This can't be undone.", "Delete")) { store.set("dir:list", store.get("dir:list", []).filter(c => c.id !== b.dataset.del)); paint(); } };
    $("#dr-exp", el).onclick = () => { const v = store.get("dir:list", []).map(c => `BEGIN:VCARD\nVERSION:3.0\nFN:${c.n}\n${c.r ? "TITLE:" + c.r + "\n" : ""}${c.e ? "EMAIL:" + c.e + "\n" : ""}${c.p ? "TEL:" + c.p + "\n" : ""}END:VCARD`).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([v], { type: "text/vcard" })); a.download = "vauxhall-contacts.vcf"; a.click(); };
    paint(); addEventListener("focus", paint);
  }
};
