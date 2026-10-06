// Google Identity Services token flow. Runs entirely in the browser; the access token
// stays in memory and is never stored. Requires an OAuth Client ID (see README).
import { setting, loadScript, bus } from "./core.js";

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "openid", "email", "profile"
].join(" ");

let token = null, expires = 0, client = null, pending = null, who = null;
export const signedIn = () => !!token && Date.now() < expires - 60000;
export const account = () => who;
export const clientId = () => (setting("googleClientId") || "").trim();

async function ensureClient() {
  if (!clientId()) { const e = new Error("Add a Google OAuth Client ID under Connections to use Gmail and Calendar."); e.code = "no_client"; throw e; }
  await loadScript("https://accounts.google.com/gsi/client");
  if (!client) client = google.accounts.oauth2.initTokenClient({
    client_id: clientId(), scope: SCOPES, callback: () => {},
  });
  return client;
}
export async function signIn(interactive = true) {
  if (signedIn()) return token;
  if (pending) return pending;
  const c = await ensureClient();
  pending = new Promise((res, rej) => {
    c.callback = async r => {
      pending = null;
      if (r.error) return rej(Object.assign(new Error(r.error_description || r.error), { code: r.error }));
      token = r.access_token; expires = Date.now() + (r.expires_in || 3600) * 1000;
      try { who = await (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { authorization: "Bearer " + token } })).json(); } catch {}
      bus.dispatchEvent(new Event("google"));
      res(token);
    };
    c.error_callback = e => { pending = null; rej(Object.assign(new Error(e.message || "Sign-in window closed"), { code: e.type || "popup_closed" })); };
    c.requestAccessToken({ prompt: interactive ? "" : "none" });
  });
  return pending;
}
export function signOut() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
  token = null; expires = 0; who = null; bus.dispatchEvent(new Event("google"));
}
export async function gfetch(url, opts = {}) {
  if (!signedIn()) { const e = new Error("Not signed in to Google"); e.code = "signed_out"; throw e; }
  const r = await fetch(url, { ...opts, headers: { authorization: "Bearer " + token, ...(opts.body ? { "content-type": "application/json" } : {}), ...(opts.headers || {}) } });
  if (r.status === 401) { token = null; bus.dispatchEvent(new Event("google")); throw Object.assign(new Error("Google session expired. Sign in again."), { code: "expired" }); }
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).error?.message || m; } catch {} throw Object.assign(new Error(m), { code: "http_" + r.status }); }
  return r.status === 204 ? null : r.json();
}

/* ---------- Gmail ---------- */
const GM = "https://gmail.googleapis.com/gmail/v1/users/me";
const hdr = (m, n) => (m.payload?.headers || []).find(h => h.name.toLowerCase() === n.toLowerCase())?.value || "";
export async function listThreads(q = "in:inbox", max = 25) {
  const l = await gfetch(`${GM}/threads?maxResults=${max}&q=${encodeURIComponent(q)}`);
  const ids = (l.threads || []).map(t => t.id);
  const out = await Promise.all(ids.map(id => gfetch(`${GM}/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`).catch(() => null)));
  return out.filter(Boolean).map(t => { const last = t.messages[t.messages.length - 1];
    return { id: t.id, count: t.messages.length, from: hdr(last, "From"), to: hdr(last, "To"), subject: hdr(t.messages[0], "Subject"), date: Number(last.internalDate), snippet: last.snippet, unread: t.messages.some(m => (m.labelIds || []).includes("UNREAD")), labels: last.labelIds || [] }; });
}
const b64 = s => { const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/")); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); };
function bodyOf(part) {
  let html = "", text = "";
  (function walk(p) { if (!p) return; if (p.mimeType === "text/html" && p.body?.data) html ||= b64(p.body.data); else if (p.mimeType === "text/plain" && p.body?.data) text ||= b64(p.body.data); (p.parts || []).forEach(walk); })(part);
  return { html, text };
}
export async function getThread(id) {
  const t = await gfetch(`${GM}/threads/${id}?format=full`);
  return t.messages.map(m => ({ id: m.id, threadId: t.id, from: hdr(m, "From"), to: hdr(m, "To"), cc: hdr(m, "Cc"), subject: hdr(m, "Subject"), date: Number(m.internalDate), msgId: hdr(m, "Message-ID"), ...bodyOf(m.payload), attachments: (function a(p, acc = []) { if (p?.filename) acc.push({ name: p.filename, size: p.body?.size }); (p?.parts || []).forEach(x => a(x, acc)); return acc; })(m.payload) }));
}
const enc = s => "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(s))) + "?=";
export async function sendMail({ to, cc = "", subject, body, threadId, inReplyTo }) {
  const lines = [`To: ${to}`, cc ? `Cc: ${cc}` : "", `Subject: ${enc(subject)}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", inReplyTo ? `In-Reply-To: ${inReplyTo}\r\nReferences: ${inReplyTo}` : "", "", body].filter((l, i) => l !== "" || i > 3);
  const raw = btoa(unescape(encodeURIComponent(lines.join("\r\n")))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return gfetch(`${GM}/messages/send`, { method: "POST", body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) });
}

/* ---------- Calendar ---------- */
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
export async function listEvents(from, to) {
  const j = await gfetch(`${CAL}?singleEvents=true&orderBy=startTime&maxResults=100&timeMin=${encodeURIComponent(from.toISOString())}&timeMax=${encodeURIComponent(to.toISOString())}`);
  return (j.items || []).filter(e => e.status !== "cancelled");
}
export async function createMeeting({ summary, description, start, end, attendees = [], meet = true }) {
  const body = { summary, description, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() }, attendees: attendees.map(email => ({ email })) };
  if (meet) body.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  return gfetch(`${CAL}?conferenceDataVersion=1&sendUpdates=all`, { method: "POST", body: JSON.stringify(body) });
}
