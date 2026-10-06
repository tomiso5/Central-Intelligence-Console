import { $, $$, esc, tag, empty, segmented, debounce, confirmBox, toast, me, bus } from "../core.js";
import { I } from "./_icons.js";
import * as g from "../google.js";

let Q = "in:inbox", threads = [], cur = null;
const name = f => { const m = String(f || "").match(/^"?([^"<]+?)"?\s*<.+>$/); return m ? m[1] : f; };
const addr = f => { const m = String(f || "").match(/<([^>]+)>/); return m ? m[1] : f; };
export function googleGate(el, what) {
  if (g.signedIn()) return false;
  el.innerHTML = g.clientId() ? empty(`Sign in to use ${what}`, "Your Google token stays in this tab's memory and is never stored.", `<button class="btn primary" data-gsignin>Sign in with Google</button>`)
    : empty(`${what} needs a Google OAuth Client ID`, "The site owner (or you, under Connections) adds one. See README › Google setup.", `<button class="btn" data-go="connections">Open Connections</button>`);
  const b = el.querySelector("[data-gsignin]"); if (b) b.onclick = () => g.signIn().catch(e => toast(e.message, "bad"));
  return true;
}
export default {
  id: "mail", title: "Secure mail", group: "Communications", icon: I.mail,
  render(el, ctx) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Secure mail</h1><p>Your Gmail, read and sent from inside the terminal. Remote images are blocked until you allow them.</p></div>
      <div class="row"><div class="seg" id="ml-tabs"><button data-q="in:inbox" aria-pressed="true">Inbox</button><button data-q="in:inbox is:unread">Unread</button><button data-q="is:starred">Starred</button><button data-q="in:sent">Sent</button></div><button class="btn primary" id="ml-new">Compose</button></div></div>
    <div class="grid g12">
      <div class="panel c5"><div class="ph"><input class="i" id="ml-s" placeholder="Search (Gmail syntax, e.g. from:boss newer_than:7d)" style="flex:1"><div class="meta" id="ml-m"></div></div>
        <div class="pb flush scroll" style="max-height:calc(100vh - 290px);min-height:340px" id="ml-l"></div></div>
      <div class="panel c7"><div class="ph"><h2 id="ml-pt">Message</h2><div class="meta" id="ml-pa"></div></div><div class="pb scroll" style="max-height:calc(100vh - 270px)" id="ml-r">${empty("Select a message")}</div></div>
    </div>`;
    segmented($("#ml-tabs", el), d => { Q = d.q; this.load(); });
    $("#ml-s", el).oninput = debounce(() => this.load(), 600);
    $("#ml-l", el).onclick = e => { const li = e.target.closest("li[data-id]"); if (li) this.open(li.dataset.id); };
    $("#ml-new", el).onclick = () => this.compose();
    bus.addEventListener("google", () => this.load());
    this.load();
  },
  async load() {
    const el = document.getElementById("v-mail"); if (!el) return; const L = $("#ml-l", el);
    if (googleGate(L, "Gmail")) return;
    L.innerHTML = `<div class="empty thinking">Decrypting traffic…</div>`;
    try {
      threads = await g.listThreads(Q + " " + $("#ml-s", el).value.trim(), 30);
      L.innerHTML = threads.length ? `<ul class="list">${threads.map(t => `<li class="click" data-id="${t.id}"><span class="dot ${t.unread ? "on" : ""}" style="margin-top:7px;${t.unread ? "background:var(--brass)" : ""}"></span><div style="min-width:0;flex:1"><div class="t" style="${t.unread ? "" : "font-weight:400;color:var(--muted)"}">${esc(name(Q.includes("sent") ? t.to : t.from))}${t.count > 1 ? ` <span class="note">(${t.count})</span>` : ""}</div><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.subject || "(no subject)")}</div><div class="s" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.snippet).replace(/&amp;#39;/g, "'")}</div></div><span class="d">${Date.now() - t.date < 864e5 ? new Date(t.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : new Date(t.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></li>`).join("")}</ul>` : empty("Nothing here", "No threads match this view.");
      const u = threads.filter(t => t.unread).length; if (Q === "in:inbox") window.VT.count("mail", u);
      $("#ml-m", el).innerHTML = tag("live", (g.account()?.email || "Gmail"));
    } catch (e) { L.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  },
  async open(id) {
    const el = document.getElementById("v-mail"); $$("#ml-l li", el).forEach(li => li.classList.toggle("sel", li.dataset.id === id));
    const R = $("#ml-r", el); R.innerHTML = `<div class="thinking">Opening…</div>`;
    try {
      const msgs = await g.getThread(id); cur = msgs; const last = msgs[msgs.length - 1];
      $("#ml-pt", el).textContent = msgs[0].subject || "(no subject)";
      $("#ml-pa", el).innerHTML = `<button class="btn" id="ml-rep">Reply</button><button class="btn ghost" id="ml-img">Load images</button>`;
      R.innerHTML = msgs.map((m, i) => `<div style="border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:12px"><dl class="kv"><dt>From</dt><dd>${esc(m.from)}</dd><dt>To</dt><dd>${esc(m.to)}</dd>${m.cc ? `<dt>Cc</dt><dd>${esc(m.cc)}</dd>` : ""}<dt>Date</dt><dd>${new Date(m.date).toLocaleString("en-GB")}</dd>${m.attachments.length ? `<dt>Attachments</dt><dd>${m.attachments.map(a => esc(a.name)).join(", ")}</dd>` : ""}</dl>
        ${m.html ? `<iframe class="mailframe" sandbox="allow-popups allow-popups-to-escape-sandbox" data-i="${i}" title="Message body"></iframe>` : `<div class="out" style="margin-top:10px">${esc(m.text)}</div>`}</div>`).join("");
      const paint = (allow) => $$("iframe.mailframe", R).forEach(f => { let h = msgs[+f.dataset.i].html; if (!allow) h = h.replace(/<img\b([^>]*?)\bsrc=/gi, "<img$1data-blocked-src=").replace(/url\((['"]?)https?:/gi, "url($1blocked:");
        f.srcdoc = `<base target="_blank"><style>body{font:14px/1.5 -apple-system,Segoe UI,Arial,sans-serif;margin:12px;color:#111}</style>` + h;
        f.onload = () => { try { f.style.height = Math.min(1600, f.contentDocument.body.scrollHeight + 30) + "px"; } catch {} }; });
      paint(false);
      $("#ml-img", el).onclick = () => paint(true);
      $("#ml-rep", el).onclick = () => this.compose({ to: addr(last.from), subject: /^re:/i.test(last.subject) ? last.subject : "Re: " + last.subject, threadId: last.threadId, inReplyTo: last.msgId });
    } catch (e) { R.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  },
  compose(p = {}) {
    const el = document.getElementById("v-mail"); const R = $("#ml-r", el);
    if (googleGate(R, "Gmail")) return;
    $("#ml-pt", el).textContent = p.threadId ? "Reply" : "New secure message"; $("#ml-pa", el).innerHTML = "";
    R.innerHTML = `<form class="frm" id="ml-c"><label class="f">To<input class="i" name="to" value="${esc(p.to || "")}" required></label><label class="f">Cc<input class="i" name="cc"></label>
      <div class="frm two"><label class="f">Subject<input class="i" name="su" value="${esc(p.subject || "")}"></label><label class="f">Marking<select class="i" name="mk"><option value="">None</option><option>OFFICIAL</option><option>OFFICIAL-SENSITIVE</option></select></label></div>
      <label class="f">Message<textarea class="i" name="b" style="min-height:220px">${esc(p.body || "")}</textarea></label>
      <div class="row"><button class="btn primary">Send</button><button class="btn ghost" type="button" id="ml-ai">Draft with my AI</button></div></form>`;
    $("#ml-ai", R).onclick = async () => { const ai = await import("../ai.js"); const f = $("#ml-c", R).elements; const ask = prompt("What should the email say?"); if (!ask) return;
      try { f.b.value = ""; await ai.chat({ system: "You draft concise, professional emails. Output only the email body.", messages: [{ role: "user", content: `Draft an email to ${f.to.value} about: ${ask}${p.threadId ? `\nIt's a reply to: ${cur?.[cur.length - 1]?.text?.slice(0, 2000) || ""}` : ""}\nSign off as ${me().callsign}.` }], onText: t => f.b.value = t }); } catch (e) { toast(e.message, "bad"); } };
    $("#ml-c", R).onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); const mk = f.get("mk");
      const subject = (mk ? `[${mk}] ` : "") + f.get("su"), body = (mk ? mk + "\n\n" : "") + f.get("b");
      if (!await confirmBox("Send this email?", `<dl class="kv"><dt>To</dt><dd>${esc(f.get("to"))}</dd><dt>Subject</dt><dd>${esc(subject)}</dd></dl>`, "Send")) return;
      try { await g.sendMail({ to: f.get("to"), cc: f.get("cc"), subject, body, threadId: p.threadId, inReplyTo: p.inReplyTo }); toast("Sent", "ok"); R.innerHTML = empty("Message sent"); this.load(); } catch (err) { toast(err.message, "bad"); } };
  }
};
