import { $, esc, tag, empty, toast, isoDate, me, bus, confirmBox } from "../core.js";
import { I } from "./_icons.js";
import * as g from "../google.js";
import { googleGate } from "./mail.js";
export default {
  id: "meet", title: "Calls & meetings", group: "Communications", icon: I.meet,
  render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Secure calls &amp; meetings</h1><p>Your Google Calendar for the next 14 days. New meetings get a Google Meet link automatically, and guests are invited.</p></div><div class="row"><a class="btn" href="https://meet.google.com/new" target="_blank" rel="noopener">Instant call</a></div></div>
    <div class="grid g12">
      <div class="panel key c7"><div class="ph"><h2>Agenda</h2><div class="meta" id="mt-m"></div></div><div class="pb flush scroll" style="max-height:calc(100vh - 260px)" id="mt-l"></div></div>
      <div class="panel c5"><div class="ph"><h2>Schedule a secure call</h2></div><form class="pb frm" id="mt-f">
        <label class="f">Title<input class="i" name="t" required placeholder="Debrief: Hormuz shipping"></label>
        <div class="frm two"><label class="f">Date<input class="i" type="date" name="d" required value="${isoDate()}"></label><label class="f">Start<input class="i" type="time" name="s" value="10:00" required></label></div>
        <div class="frm two"><label class="f">Duration<select class="i" name="m"><option value="15">15 min</option><option value="30" selected>30 min</option><option value="60">1 hour</option><option value="90">90 min</option></select></label><label class="f">Marking<select class="i" name="c"><option>OFFICIAL</option><option selected>OFFICIAL-SENSITIVE</option></select></label></div>
        <label class="f">Guests (emails, comma separated)<input class="i" name="g"></label>
        <label class="f">Agenda<textarea class="i" name="a"></textarea></label>
        <label class="row note"><input type="checkbox" name="meet" checked> Add Google Meet video link</label>
        <button class="btn primary">Create meeting</button></form></div>
    </div>`;
    $("#mt-f", el).onsubmit = async e => { e.preventDefault(); if (!g.signedIn()) { try { await g.signIn(); } catch (err) { return toast(err.message, "bad"); } }
      const f = new FormData(e.target); const st = new Date(f.get("d") + "T" + f.get("s")); const en = new Date(st.getTime() + f.get("m") * 60000);
      const guests = String(f.get("g")).split(",").map(s => s.trim()).filter(Boolean);
      if (guests.length && !await confirmBox("Send invitations?", `${guests.length} guest${guests.length > 1 ? "s" : ""} will be emailed an invite from your Google account.`, "Create and invite")) return;
      try { const ev = await g.createMeeting({ summary: `[${f.get("c")}] ${f.get("t")}`, description: `${f.get("a")}\n\nScheduled from Vauxhall Terminal by ${me().callsign}.`, start: st, end: en, attendees: guests, meet: f.get("meet") === "on" });
        toast("Meeting created" + (ev.hangoutLink ? " with Meet link" : ""), "ok"); e.target.reset(); this.load(); } catch (err) { toast(err.message, "bad"); } };
    bus.addEventListener("google", () => this.load()); this.load();
  },
  async load() {
    const el = document.getElementById("v-meet"); if (!el) return; const L = $("#mt-l", el);
    if (googleGate(L, "Google Calendar")) return;
    L.innerHTML = `<div class="empty thinking">Loading schedule…</div>`;
    try { const s = new Date(); s.setHours(0, 0, 0, 0); const evs = await g.listEvents(s, new Date(s.getTime() + 14 * 864e5));
      const by = {}; evs.forEach(e => { const k = (e.start.dateTime || e.start.date).slice(0, 10); (by[k] ||= []).push(e); });
      L.innerHTML = evs.length ? Object.keys(by).sort().map(k => `<div style="padding:8px 12px;background:var(--panel2);border-bottom:1px solid var(--line);font-size:12px;color:var(--brass2)">${new Date(k + "T12:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div><ul class="list">${by[k].map(e => { const join = e.hangoutLink || e.conferenceData?.entryPoints?.find(p => p.entryPointType === "video")?.uri;
        return `<li><div style="min-width:70px"><div class="t">${e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "All day"}</div><div class="s">${e.end?.dateTime ? new Date(e.end.dateTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}</div></div><div style="flex:1;min-width:0"><div class="t">${esc(e.summary || "(untitled)")}</div><div class="s">${esc(e.location || "")}${e.attendees ? ` · ${e.attendees.length} attendees` : ""}</div></div><div class="row" style="flex-wrap:nowrap">${join ? `<a class="btn primary" href="${esc(join)}" target="_blank" rel="noopener">Join</a>` : ""}<a class="btn ghost" href="${esc(e.htmlLink)}" target="_blank" rel="noopener">Open</a></div></li>`; }).join("")}</ul>`).join("") : empty("No meetings in the next two weeks");
      const today = by[isoDate()]?.length || 0; window.VT.count("meet", today); $("#mt-m", el).innerHTML = tag("live", evs.length + " in 14 days");
    } catch (e) { L.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }
};
