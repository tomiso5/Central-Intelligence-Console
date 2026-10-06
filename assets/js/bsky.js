// Bluesky (AT Protocol). Optional sign-in with an *app password* (Settings → Privacy → App passwords on bsky.app).
import { store, getJSON } from "./core.js";
const PDS = "https://bsky.social/xrpc", PUB = "https://public.api.bsky.app/xrpc";
export const session = () => store.get("bsky:session");
export async function login(identifier, password) {
  const r = await fetch(PDS + "/com.atproto.server.createSession", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, password }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.message || "Bluesky sign-in failed");
  store.set("bsky:session", { did: j.did, handle: j.handle, accessJwt: j.accessJwt, refreshJwt: j.refreshJwt }); return j;
}
export const logout = () => store.del("bsky:session");
async function refresh() {
  const s = session(); if (!s) return null;
  const r = await fetch(PDS + "/com.atproto.server.refreshSession", { method: "POST", headers: { authorization: "Bearer " + s.refreshJwt } });
  if (!r.ok) { logout(); return null; }
  const j = await r.json(); store.set("bsky:session", { ...s, accessJwt: j.accessJwt, refreshJwt: j.refreshJwt }); return session();
}
export async function xrpc(method, params = {}, { auth = true, post } = {}) {
  let s = auth ? session() : null;
  const url = (s ? PDS : PUB) + "/" + method + (post ? "" : "?" + new URLSearchParams(params));
  const go = async () => fetch(url, { method: post ? "POST" : "GET", headers: { ...(s ? { authorization: "Bearer " + s.accessJwt } : {}), ...(post ? { "content-type": "application/json" } : {}) }, body: post ? JSON.stringify(post) : undefined });
  let r = await go();
  if (r.status === 400 || r.status === 401) { const j = await r.clone().json().catch(() => ({})); if (s && /expired/i.test(j.error + j.message)) { s = await refresh(); if (s) r = await go(); } }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.message || "Bluesky " + r.status), { status: r.status }); return j;
}
export const postUrl = p => `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split("/").pop()}`;
export const norm = p => ({ id: "bs:" + p.uri, src: "Bluesky", author: "@" + p.author.handle, name: p.author.displayName, text: p.record?.text || "", ts: new Date(p.record?.createdAt || p.indexedAt).getTime(), url: postUrl(p),
  media: p.embed?.images?.[0]?.thumb || p.embed?.media?.images?.[0]?.thumb || p.embed?.external?.thumb, likes: p.likeCount, reposts: p.repostCount });
export async function search(q, limit = 40) {
  try { return (await xrpc("app.bsky.feed.searchPosts", { q, sort: "latest", limit })).posts.map(norm); }
  catch (e) { if (!session()) { e.message = "Bluesky search needs sign-in (app password) under Connections."; } throw e; }
}
export async function timeline(limit = 40) { return (await xrpc("app.bsky.feed.getTimeline", { limit })).feed.map(f => norm(f.post)); }
export async function createPost(text) {
  const s = session(); if (!s) throw new Error("Sign in to Bluesky first");
  return xrpc("com.atproto.repo.createRecord", {}, { post: { repo: s.did, collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString() } } });
}
