// Field messages: serverless peer-to-peer chat (WebRTC data channels via Trystero, signalling over
// public Nostr relays). No backend, no accounts. Messages live in each participant's browser.
import { $, $$, esc, store, me, uid, toast, modal, ago, empty, confirmBox } from "../core.js";
import { I } from "./_icons.js";

const APP = "vauxhall-terminal-v2";
let T = null; const lib = async () => T ||= await import("https://esm.sh/trystero@0");
const rooms = {};            // convId -> { room, tx, peers: Map(peerId -> {id, cs}) }
let active = null, started = false, ctxRef = null, typingTimers = {};
const requests = new Map();  // friendId -> {id, cs, pid, convId}

/* ---------- persistence ---------- */
const friends = () => store.get("fr:list", []);
const setFriends = l => store.set("fr:list", l);
const chans = () => store.get("fr:chans", []);
const msgs = c => store.get("fr:m:" + c, []);
const saveMsgs = (c, l) => { l = l.slice(-300); try { store.set("fr:m:" + c, l); } catch { store.set("fr:m:" + c, l.map(m => ({ ...m, img: m.img ? null : undefined, imgDropped: !!m.img }))); } };
const unread = () => store.get("fr:unread", {});
const setUnread = u => { store.set("fr:unread", u); ctxRef?.count("comms", Object.values(u).reduce((a, b) => a + b, 0)); };
const dmId = fid => "dm-" + [me().id, fid].sort().join("-");
async function sha(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
const inviteLink = () => `${location.origin}${location.pathname}#add=${me().id}&cs=${encodeURIComponent(me().callsign)}`;

/* ---------- networking ---------- */
async function join(convId, password, kind) {
  if (rooms[convId]) return rooms[convId];
  const { joinRoom } = await lib();
  const room = joinRoom({ appId: APP, password: password || convId }, convId);
  const peers = new Map(); const tx = {};
  const act = n => { const [s, g] = room.makeAction(n); tx[n] = s; return g; };
  const R = rooms[convId] = { room, tx, peers, kind };
  act("hi")((d, pid) => { peers.set(pid, d); presence(); if (kind === "dm") flush(convId);
    if (kind === "grp") tx.syn(msgs(convId).slice(-60), pid);
    if (kind === "inbox" && d.id !== me().id && store.get("fr:outreq", []).some(r => r.id === d.id && convId === "inbox-" + d.id)) tx.req({ id: me().id, cs: me().callsign }, pid); });
  act("msg")((m, pid) => receive(convId, m, pid));
  act("rd")((a) => { const l = msgs(convId); const m = l.find(x => x.mid === a.mid); if (m && rank(a.s) > rank(m.status)) { m.status = a.s; saveMsgs(convId, l); if (active === convId) paintLog(); } });
  act("typ")((d, pid) => { const who = peers.get(pid)?.cs || "Someone"; typingTimers[convId] = { who, until: Date.now() + 3500 }; if (active === convId) paintTyping(); });
  act("rct")((r) => { const l = msgs(convId); const m = l.find(x => x.mid === r.mid); if (!m) return; m.reacts ||= {}; const s = new Set(m.reacts[r.e] || []); r.on ? s.add(r.from) : s.delete(r.from); m.reacts[r.e] = [...s]; saveMsgs(convId, l); if (active === convId) paintLog(); });
  act("syn")((list) => { const l = msgs(convId); const have = new Set(l.map(m => m.mid)); let n = 0; list.forEach(m => { if (!have.has(m.mid)) { l.push({ ...m, status: "delivered" }); n++; } }); if (n) { l.sort((a, b) => a.ts - b.ts); saveMsgs(convId, l); if (active === convId) paintLog(); } });
  act("bzz")((d, pid) => { const who = peers.get(pid)?.cs || "A contact"; toast(`⚡ ${who} is pinging you`); navigator.vibrate?.([120, 60, 120]); const v = document.getElementById("v-comms"); v?.classList.add("buzz"); setTimeout(() => v?.classList.remove("buzz"), 1200); });
  act("req")((d, pid) => { if (friends().some(f => f.id === d.id)) return; requests.set(d.id, { ...d, pid, convId }); toast(`Friend request from ${d.cs}`); paintSide(); });
  act("acc")((d) => { addFriend(d.id, d.cs); toast(`${d.cs} accepted your request`, "ok"); });
  room.onPeerJoin(pid => tx.hi({ id: me().id, cs: me().callsign }, pid));
  room.onPeerLeave(pid => { peers.delete(pid); presence(); });
  room.onPeerStream?.((stream, pid) => onStream(convId, stream, pid));
  return R;
}
const rank = s => ({ queued: 0, sent: 1, delivered: 2, read: 3 })[s] ?? 0;
function receive(convId, m, pid) {
  const l = msgs(convId); if (l.some(x => x.mid === m.mid)) return;
  l.push({ ...m, status: "delivered" }); saveMsgs(convId, l);
  rooms[convId]?.tx.rd({ mid: m.mid, s: active === convId && !document.hidden ? "read" : "delivered" }, pid);
  if (active === convId && document.getElementById("v-comms")?.classList.contains("on")) paintLog();
  else { const u = unread(); u[convId] = (u[convId] || 0) + 1; setUnread(u); toast(`${m.cs}: ${m.burn ? "🔥 burn-on-read message" : (m.text || "📷 image").slice(0, 60)}`); paintSide(); }
}
function flush(convId) {
  const R = rooms[convId]; if (!R || !R.peers.size) return; const l = msgs(convId); let ch = false;
  l.filter(m => m.status === "queued" && m.from === me().id).forEach(m => { const { status, ...wire } = m; R.tx.msg(wire); m.status = "sent"; ch = true; });
  if (ch) { saveMsgs(convId, l); if (active === convId) paintLog(); }
}
function online(fid) { const R = rooms[dmId(fid)]; return R ? [...R.peers.values()].some(p => p.id === fid) : false; }
function presence() { paintSide(); if (active) paintHead(); }
async function addFriend(id, cs) {
  if (!id || id === me().id) return;
  const l = friends(); if (!l.some(f => f.id === id)) { l.push({ id, cs, since: Date.now() }); setFriends(l); }
  store.set("fr:outreq", store.get("fr:outreq", []).filter(r => r.id !== id));
  requests.delete(id); await join(dmId(id), dmId(id), "dm"); paintSide();
}
async function sendRequest(id, cs) {
  id = id.trim(); if (!id || id === me().id) return toast("That's your own ID", "bad");
  const out = store.get("fr:outreq", []); if (!out.some(r => r.id === id)) out.push({ id, cs: cs || "Unknown", t: Date.now() }); store.set("fr:outreq", out);
  await join("inbox-" + id, "inbox-" + id, "inbox"); await join(dmId(id), dmId(id), "dm");
  toast(`Request sent to ${cs || id}. It's delivered as soon as they're online.`, "ok"); paintSide();
}
export async function startNetwork(ctx) {
  if (started || !me().id) return; started = true; ctxRef = ctx || ctxRef;
  try {
    await join("inbox-" + me().id, "inbox-" + me().id, "inbox");
    for (const f of friends()) await join(dmId(f.id), dmId(f.id), "dm");
    for (const c of chans()) await join(c.id, c.key, "grp");
    for (const r of store.get("fr:outreq", [])) await join("inbox-" + r.id, "inbox-" + r.id, "inbox");
    setUnread(unread());
  } catch (e) { started = false; console.warn(e); toast("Messaging network unavailable: " + e.message, "bad"); }
}
export async function sendTo(convId, text) {
  const R = rooms[convId]; const m = { mid: uid(12), from: me().id, cs: me().callsign, text, ts: Date.now() };
  const l = msgs(convId); l.push({ ...m, status: R?.peers.size ? "sent" : "queued" }); saveMsgs(convId, l);
  if (R?.peers.size) R.tx.msg(m);
}

/* ---------- UI ---------- */
let EL;
const convName = c => c.startsWith("dm-") ? (friends().find(f => dmId(f.id) === c)?.cs || "Contact") : (chans().find(x => x.id === c)?.name || "Channel");
function paintSide() {
  if (!EL) return; const u = unread();
  $("#fr-me", EL).innerHTML = `<div style="padding:12px;border-bottom:1px solid var(--line)"><div class="note">You are</div><div style="font:600 17px var(--serif)">${esc(me().callsign)}</div><div class="note" style="word-break:break-all">ID ${esc(me().id)}</div>
    <div class="row" style="margin-top:8px"><button class="btn" id="fr-copy">Copy invite link</button><button class="btn primary" id="fr-add">Add friend</button></div></div>`;
  $("#fr-copy", EL).onclick = async () => { try { await navigator.clipboard.writeText(inviteLink()); toast("Invite link copied", "ok"); } catch { prompt("Copy this invite link:", inviteLink()); } };
  $("#fr-add", EL).onclick = () => addDialog();
  const reqs = [...requests.values()], out = store.get("fr:outreq", []);
  $("#fr-req", EL).innerHTML = reqs.length || out.length ? `<div class="sec"><span>Requests</span></div>` + reqs.map(r => `<div style="padding:6px 12px" class="row"><b style="flex:1">${esc(r.cs)}</b><button class="btn primary" data-acc="${esc(r.id)}">Accept</button><button class="btn ghost" data-dec="${esc(r.id)}">Decline</button></div>`).join("")
    + out.map(r => `<div style="padding:6px 12px" class="row note"><span style="flex:1">Waiting for ${esc(r.cs)}…</span><button class="btn ghost" data-cancel="${esc(r.id)}">Cancel</button></div>`).join("") : "";
  const fl = friends();
  $("#fr-list", EL).innerHTML = `<div class="sec"><span>Friends · ${fl.filter(f => online(f.id)).length} online</span></div>` + (fl.length ? fl.sort((a, b) => online(b.id) - online(a.id)).map(f => { const c = dmId(f.id);
    return `<button data-conv="${c}" aria-current="${active === c}"><span class="av">${esc(f.cs[0])}<span class="dot ${online(f.id) ? "on" : ""}"></span></span><span style="min-width:0"><div>${esc(f.cs)}</div><div class="note" style="font-size:11.5px">${online(f.id) ? "Online" : "Offline"}</div></span>${u[c] ? `<span class="unread">${u[c]}</span>` : ""}</button>`; }).join("") : `<div class="note" style="padding:4px 12px 10px">No friends yet. Share your invite link.</div>`);
  const cl = chans();
  $("#fr-ch", EL).innerHTML = `<div class="sec"><span>Channels</span><button class="btn ghost" id="fr-newch" style="padding:2px 8px">+ New</button></div>` + cl.map(c => { const n = rooms[c.id]?.peers.size || 0;
    return `<button data-conv="${c.id}" aria-current="${active === c.id}"><span class="av">#</span><span style="min-width:0"><div>${esc(c.name)}</div><div class="note" style="font-size:11.5px">${n} other${n === 1 ? "" : "s"} here</div></span>${u[c.id] ? `<span class="unread">${u[c.id]}</span>` : ""}</button>`; }).join("");
  $("#fr-newch", EL).onclick = () => channelDialog();
}
function paintHead() {
  if (!EL || !active) return; const R = rooms[active]; const isDm = active.startsWith("dm-");
  const f = isDm ? friends().find(x => dmId(x.id) === active) : null; const ch = !isDm ? chans().find(c => c.id === active) : null;
  const status = isDm ? (online(f.id) ? '<span class="dot on"></span> Online' : '<span class="dot"></span> Offline · messages queue until they connect') : `${R?.peers.size || 0} others online · ${[...(R?.peers.values() || [])].map(p => esc(p.cs)).join(", ")}`;
  $("#fr-head", EL).innerHTML = `<div style="flex:1;min-width:0"><h2 style="margin:0;font:500 18px var(--serif)">${isDm ? esc(f.cs) : "#" + esc(ch.name)}</h2><div class="note row" style="gap:6px">${status}</div></div>
    <div class="row">${isDm ? `<button class="btn" id="fr-buzz" title="Ping">⚡ Ping</button><button class="btn" id="fr-call">Video call</button>` : `<button class="btn" id="fr-inv">Invite link</button>`}<button class="btn ghost" id="fr-more">⋯</button></div>`;
  $("#fr-buzz", EL)?.addEventListener("click", () => { R?.tx.bzz({}); toast("Ping sent"); });
  $("#fr-call", EL)?.addEventListener("click", () => startCall(active));
  $("#fr-inv", EL)?.addEventListener("click", async () => { const link = `${location.origin}${location.pathname}#join=${encodeURIComponent(ch.name)}&k=${encodeURIComponent(ch.key)}`; try { await navigator.clipboard.writeText(link); toast("Channel invite copied. Anyone with it can join.", "ok"); } catch { prompt("Channel invite:", link); } });
  $("#fr-more", EL).onclick = async () => { if (await confirmBox(isDm ? "Remove friend?" : "Leave channel?", `This deletes the conversation history from this browser.`, isDm ? "Remove" : "Leave")) {
    if (isDm) setFriends(friends().filter(x => x.id !== f.id)); else store.set("fr:chans", chans().filter(c => c.id !== active));
    rooms[active]?.room.leave(); delete rooms[active]; store.del("fr:m:" + active); active = null; paintSide(); paintConv(); } };
}
function paintLog() {
  if (!EL || !active) return; const log = $("#fr-log", EL); const l = msgs(active);
  const tick = s => s === "queued" ? "🕓 queued" : s === "sent" ? "✓" : s === "delivered" ? "✓✓" : s === "read" ? '<span style="color:var(--signal)">✓✓ read</span>' : "";
  log.innerHTML = l.length ? l.map(m => { const mine = m.from === me().id;
    return `<div class="msg${mine ? " me" : ""}${m.burn && !mine && !m.revealed ? " burn" : ""}" data-mid="${m.mid}"><div class="h"><b>${esc(m.cs)}</b><span>${new Date(m.ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>${m.burn ? "<span>🔥</span>" : ""}</div>
      <div class="b" ${m.burn && !mine ? 'title="Click to reveal. It self-destructs 10 s later."' : ""}>${esc(m.text || "")}${m.img ? `<img class="att" src="${m.img}" alt="Shared image">` : m.imgDropped ? '<div class="note">[image not stored: browser storage full]</div>' : ""}</div>
      ${m.reacts && Object.values(m.reacts).some(v => v.length) ? `<div class="reacts">${Object.entries(m.reacts).filter(([, v]) => v.length).map(([e, v]) => `<span>${e} ${v.length}</span>`).join("")}</div>` : ""}
      <div class="meta2">${mine ? tick(m.status) : ""}<span class="act">${["👍", "✅", "❗", "👀", "😂"].map(e => `<button data-react="${e}">${e}</button>`).join("")}</span></div></div>`; }).join("")
    : empty("Start the conversation", active.startsWith("dm-") ? "Messages go peer-to-peer and are kept only in your two browsers." : "Everyone with the channel invite can read this. History syncs from whoever is online.");
  log.scrollTop = log.scrollHeight;
  // read receipts
  const R = rooms[active]; if (R?.peers.size && !document.hidden) l.filter(m => m.from !== me().id && !m.ackRead).forEach(m => { R.tx.rd({ mid: m.mid, s: "read" }); m.ackRead = 1; });
  saveMsgs(active, l);
}
function paintTyping() { const t = typingTimers[active]; const el = $("#fr-typing", EL); if (!el) return; el.textContent = t && t.until > Date.now() ? `${t.who} is typing…` : ""; if (t) setTimeout(paintTyping, 1200); }
function paintConv() {
  if (!active) { $("#fr-main", EL).innerHTML = empty("Select a friend or channel", "Add friends with your invite link. They appear online here when the terminal is open on their side."); return; }
  $("#fr-main", EL).innerHTML = `<div class="ph" id="fr-head"></div><div class="chatlog" id="fr-log" style="flex:1"></div><div class="typing" id="fr-typing"></div>
    <form class="chatin" id="fr-form"><label class="btn ghost" title="Attach image" style="cursor:pointer">📎<input type="file" accept="image/*" id="fr-file" hidden></label><input class="i" id="fr-text" maxlength="2000" placeholder="Message" autocomplete="off"><label class="row note" style="flex-wrap:nowrap" title="Recipient sees it once, then it's deleted"><input type="checkbox" id="fr-burn"> 🔥</label><button class="btn primary">Send</button></form>`;
  paintHead(); paintLog(); paintTyping();
  const u = unread(); delete u[active]; setUnread(u); paintSide();
  let lastTyp = 0;
  $("#fr-text", EL).oninput = () => { if (Date.now() - lastTyp > 2000) { rooms[active]?.tx.typ({}); lastTyp = Date.now(); } };
  $("#fr-form", EL).onsubmit = e => { e.preventDefault(); const t = $("#fr-text", EL).value.trim(); if (!t) return; post({ text: t, burn: $("#fr-burn", EL).checked }); $("#fr-text", EL).value = ""; $("#fr-burn", EL).checked = false; };
  $("#fr-file", EL).onchange = async e => { const f = e.target.files[0]; if (!f) return; post({ text: "", img: await shrink(f) }); e.target.value = ""; };
  $("#fr-log", EL).onclick = e => {
    const r = e.target.closest("[data-react]"); if (r) { const mid = r.closest("[data-mid]").dataset.mid; const l = msgs(active); const m = l.find(x => x.mid === mid); m.reacts ||= {}; const s = new Set(m.reacts[r.dataset.react] || []); const on = !s.has(me().id); on ? s.add(me().id) : s.delete(me().id); m.reacts[r.dataset.react] = [...s]; saveMsgs(active, l); rooms[active]?.tx.rct({ mid, e: r.dataset.react, on, from: me().id }); paintLog(); return; }
    const b = e.target.closest(".msg.burn"); if (b) { const mid = b.dataset.mid, conv = active; const l = msgs(conv); const m = l.find(x => x.mid === mid); m.revealed = 1; saveMsgs(conv, l); paintLog(); setTimeout(() => { saveMsgs(conv, msgs(conv).filter(x => x.mid !== mid)); if (active === conv) paintLog(); }, 10000); }
  };
}
function post(p) {
  const R = rooms[active]; const m = { mid: uid(12), from: me().id, cs: me().callsign, ts: Date.now(), ...p };
  const l = msgs(active); const live = R?.peers.size > 0;
  l.push({ ...m, status: live ? "sent" : "queued" }); saveMsgs(active, l); if (live) R.tx.msg(m); paintLog();
}
function shrink(file) { return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const s = Math.min(1, 1024 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.78)); URL.revokeObjectURL(img.src); }; img.onerror = rej; img.src = URL.createObjectURL(file); }); }
function addDialog(pre = {}) {
  const d = modal("Add a friend", `<form class="frm" id="ad"><p class="note" style="margin:0">Ask your friend for their invite link or ID (shown at the top of their Field messages). Paste either below.</p>
    <label class="f">Invite link or ID<input class="i" name="id" value="${esc(pre.add || "")}" required></label><label class="f">Callsign (how they appear to you)<input class="i" name="cs" value="${esc(pre.cs || "")}"></label>
    <div class="row"><button class="btn primary">Send friend request</button></div></form>`);
  $("#ad", d).onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); let id = String(f.get("id")).trim(), cs = String(f.get("cs")).trim();
    const m = id.match(/add=([a-z0-9]+)(?:&cs=([^&]+))?/i); if (m) { id = m[1]; cs ||= decodeURIComponent(m[2] || ""); } d.close(); sendRequest(id, cs || id.slice(0, 6)); };
}
function channelDialog(pre = {}) {
  const d = modal(pre.join ? "Join channel" : "New channel", `<form class="frm" id="ch"><label class="f">Channel name<input class="i" name="n" value="${esc(pre.join || "")}" required maxlength="40"></label>
    <label class="f">Access key (shared secret)<input class="i" name="k" value="${esc(pre.k || uid(16))}" required></label><p class="note" style="margin:0">Anyone with the name and key can join and read. The key also encrypts connection set-up.</p><button class="btn primary">${pre.join ? "Join" : "Create"} channel</button></form>`);
  $("#ch", d).onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); const name = f.get("n").trim(), key = f.get("k").trim();
    const id = "grp-" + (await sha(name + "|" + key)).slice(0, 20); const l = chans(); if (!l.some(c => c.id === id)) { l.push({ id, name, key }); store.set("fr:chans", l); }
    d.close(); await join(id, key, "grp"); active = id; paintSide(); paintConv(); };
}
/* video calls (DMs) */
let call = null;
async function startCall(convId) {
  const R = rooms[convId]; if (!R?.peers.size) return toast("Your friend needs to be online to take a call", "bad");
  try { const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); R.room.addStream(stream); openCall(convId, stream); R.tx.msg({ mid: uid(12), from: me().id, cs: me().callsign, ts: Date.now(), text: "📹 Started a video call" }); }
  catch (e) { toast("Camera or microphone unavailable: " + e.message, "bad"); }
}
function openCall(convId, local) {
  if (call) return call; const d = modal("Secure video call · " + convName(convId), `<div class="grid" style="grid-template-columns:1fr 1fr;gap:8px"><video id="cv-l" autoplay playsinline muted style="width:100%;background:#000"></video><video id="cv-r" autoplay playsinline style="width:100%;background:#000"></video></div><div class="row" style="margin-top:10px"><button class="btn primary" data-close>Hang up</button></div>`, { wide: true });
  call = { d, convId, local }; if (local) $("#cv-l", d).srcObject = local;
  d.addEventListener("close", () => { call?.local?.getTracks().forEach(t => t.stop()); try { rooms[convId]?.room.removeStream(call.local); } catch {} call = null; });
  return call;
}
async function onStream(convId, stream) {
  if (!call) { if (!await confirmBox("Incoming video call", `${esc(convName(convId))} is calling.`, "Answer")) return;
    try { const local = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); rooms[convId].room.addStream(local); openCall(convId, local); } catch { openCall(convId, null); } }
  $("#cv-r", call.d).srcObject = stream;
}

export default {
  id: "comms", title: "Field messages", group: "Communications", icon: I.comms,
  background(ctx) { ctxRef = ctx; startNetwork(ctx); },
  render(el, ctx) {
    EL = el; ctxRef = ctx;
    el.innerHTML = `
    <div class="vhead"><div><h1>Field messages</h1><p>Direct messages, group channels and video calls between friends, peer-to-peer. No server stores your messages; they live in each participant's browser.</p></div></div>
    <div class="panel key friends"><aside><div id="fr-me"></div><div id="fr-req"></div><div class="flist" id="fr-list"></div><div class="flist" id="fr-ch"></div></aside>
      <div style="display:flex;flex-direction:column;min-height:0" id="fr-main"></div></div>`;
    el.addEventListener("click", e => { const b = e.target.closest("[data-conv]"); if (b) { active = b.dataset.conv; paintConv(); }
      const a = e.target.closest("[data-acc]"); if (a) { const r = requests.get(a.dataset.acc); addFriend(r.id, r.cs).then(() => rooms[r.convId]?.tx.acc({ id: me().id, cs: me().callsign }, r.pid)); toast(`You and ${r.cs} are now friends`, "ok"); }
      const dcl = e.target.closest("[data-dec]"); if (dcl) { requests.delete(dcl.dataset.dec); paintSide(); }
      const c = e.target.closest("[data-cancel]"); if (c) { store.set("fr:outreq", store.get("fr:outreq", []).filter(r => r.id !== c.dataset.cancel)); paintSide(); } });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && active) paintLog(); });
    startNetwork(ctx).then(() => { paintSide(); paintConv(); });
    paintSide(); paintConv();
  },
  show(ctx, p = {}) {
    if (!me().id) return;
    if (p.add) addDialog(p);
    if (p.join) channelDialog(p);
    if (p.share) { if (active) { setTimeout(() => { const t = $("#fr-text", EL); if (t) { t.value = p.share; t.focus(); } }, 50); } else toast("Pick a friend or channel, then paste. Text copied.", ""), navigator.clipboard?.writeText(p.share).catch(() => {}); }
    if (active) paintLog();
  }
};
