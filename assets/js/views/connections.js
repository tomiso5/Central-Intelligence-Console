import { $, esc, store, setting, setSetting, toast, relayFeatures, hasRelay, CFG, confirmBox } from "../core.js";
import { I } from "./_icons.js";
import * as g from "../google.js";
import * as bsky from "../bsky.js";
import * as ai from "../ai.js";
export default {
  id: "connections", title: "Connections", group: "Support", icon: I.conn,
  render(el) { this.el = el; this.paint(); },
  async paint() {
    const el = this.el; const f = hasRelay() ? await relayFeatures(true) : null; const bs = bsky.session();
    const yes = (b, t) => b ? `<span class="tag live">${t || "On"}</span>` : `<span class="tag off">${t ? "Off" : "Off"}</span>`;
    el.innerHTML = `
    <div class="vhead"><div><h1>Connections</h1><p>Everything you link is stored in this browser only. Nothing is sent to the site owner. Secret service keys (SerpApi, X) live in a relay you deploy yourself.</p></div></div>
    <div class="statusgrid">
      <div class="panel key"><div class="ph"><h2>Relay</h2><div class="meta">${yes(f?.ok, f?.ok ? "Online" : "")}</div></div><form class="pb frm" id="cn-relay">
        <label class="f">Relay URL<input class="i" name="u" value="${esc(setting("relayUrl") || "")}" placeholder="https://vt-relay.you.workers.dev"></label>
        <label class="f">Relay access token (if you set RELAY_TOKEN)<input class="i" name="t" type="password" value="${esc(setting("relayToken") || "")}"></label>
        <div class="note">${f?.ok ? `Features: SerpApi ${yes(f.features?.serpapi)} · X ${yes(f.features?.x)} · Telegram ${yes(true)} · Quotes ${yes(true)} · CORS proxy ${yes(true)}` : "Unlocks in-portal flights, hotels, shopping, X, Telegram OSINT and live index quotes. See README › Relay."}</div>
        <button class="btn primary">Save relay</button></form></div>
      <div class="panel"><div class="ph"><h2>Google</h2><div class="meta">${yes(g.signedIn(), g.signedIn() ? "Signed in" : "")}</div></div><form class="pb frm" id="cn-g">
        <div class="note">${g.signedIn() ? `Signed in as ${esc(g.account()?.email || "")}. Gmail, Calendar and Meet are active for this tab.` : "Gmail, Calendar and Meet. The access token is kept in memory and cleared when you close the tab."}</div>
        <label class="f">OAuth Client ID ${CFG.googleClientId ? "(set by site owner)" : ""}<input class="i" name="c" value="${esc(setting("googleClientId") || "")}" placeholder="xxxx.apps.googleusercontent.com"></label>
        <div class="row"><button class="btn">Save ID</button>${g.signedIn() ? `<button class="btn" type="button" id="cn-gout">Sign out</button>` : `<button class="btn primary" type="button" id="cn-gin">Sign in with Google</button>`}</div></form></div>
      <div class="panel"><div class="ph"><h2>Bluesky</h2><div class="meta">${yes(!!bs, bs ? "@" + bs.handle : "")}</div></div><form class="pb frm" id="cn-b">
        ${bs ? `<div class="note">Signed in. Enables your home timeline, search and posting.</div><button class="btn" type="button" id="cn-bout">Sign out</button>` : `<label class="f">Handle<input class="i" name="h" placeholder="you.bsky.social"></label><label class="f">App password (bsky.app › Settings › App passwords)<input class="i" name="p" type="password"></label><button class="btn primary">Sign in</button><div class="note">Use an app password, never your main password.</div>`}</form></div>
      <div class="panel"><div class="ph"><h2>AI assistants</h2><div class="meta">${yes(ai.readyProviders().length, ai.readyProviders().length + " linked")}</div></div><div class="pb"><p class="note" style="margin-top:0">${ai.readyProviders().map(id => esc(ai.PROVIDERS[id].name)).join(", ") || "None yet."}</p><button class="btn" data-go="ai">Manage AI connectors</button></div></div>
      <div class="panel"><div class="ph"><h2>Region</h2></div><form class="pb frm" id="cn-r">
        <div class="frm two"><label class="f">Country (ISO)<input class="i" name="country" value="${esc(setting("country"))}" maxlength="2"></label><label class="f">Currency<input class="i" name="currency" value="${esc(setting("currency"))}" maxlength="3"></label></div>
        <div class="frm two"><label class="f">Amazon domain<input class="i" name="amazonDomain" value="${esc(setting("amazonDomain"))}"></label><label class="f">eBay domain<input class="i" name="ebayDomain" value="${esc(setting("ebayDomain"))}"></label></div>
        <button class="btn">Save region</button></form></div>
      <div class="panel"><div class="ph"><h2>Your data</h2></div><div class="pb frm"><p class="note" style="margin:0">Friends, messages, contacts, trips, watchlists and keys are stored in this browser's local storage.</p>
        <div class="row"><button class="btn" id="cn-exp">Export backup</button><label class="btn" style="cursor:pointer">Import backup<input type="file" accept="application/json" id="cn-imp" hidden></label><button class="btn ghost" id="cn-wipe">Wipe everything</button></div></div></div>
    </div>`;
    $("#cn-relay", el).onsubmit = async e => { e.preventDefault(); const F = e.target.elements; setSetting("relayUrl", F.u.value.trim()); setSetting("relayToken", F.t.value.trim()); const r = await relayFeatures(true); toast(r?.ok ? "Relay connected" : "Relay didn't answer. Check the URL and ALLOWED_ORIGINS.", r?.ok ? "ok" : "bad"); this.paint(); };
    $("#cn-g", el).onsubmit = e => { e.preventDefault(); setSetting("googleClientId", e.target.elements.c.value.trim()); toast("Client ID saved. Reload the page to apply.", "ok"); };
    $("#cn-gin", el)?.addEventListener("click", () => g.signIn().then(() => { toast("Signed in to Google", "ok"); this.paint(); }).catch(err => toast(err.message, "bad")));
    $("#cn-gout", el)?.addEventListener("click", () => { g.signOut(); this.paint(); });
    $("#cn-b", el).onsubmit = async e => { e.preventDefault(); const F = e.target.elements; try { await bsky.login(F.h.value.trim().replace(/^@/, ""), F.p.value); toast("Signed in to Bluesky", "ok"); this.paint(); } catch (err) { toast(err.message, "bad"); } };
    $("#cn-bout", el)?.addEventListener("click", () => { bsky.logout(); this.paint(); });
    $("#cn-r", el).onsubmit = e => { e.preventDefault(); const F = e.target.elements; ["country", "currency"].forEach(k => setSetting(k, F[k].value.trim().toUpperCase())); ["amazonDomain", "ebayDomain"].forEach(k => setSetting(k, F[k].value.trim().replace(/^https?:\/\/(www\.)?/, ""))); toast("Region saved", "ok"); };
    $("#cn-exp", el).onclick = () => { const data = Object.fromEntries(store.keys().filter(k => !k.startsWith("ai:")).map(k => [k, store.get(k)])); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" })); a.download = `vauxhall-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); toast("Backup saved (AI keys excluded)"); };
    $("#cn-imp", el).onchange = async e => { try { const d = JSON.parse(await e.target.files[0].text()); Object.entries(d).forEach(([k, v]) => store.set(k, v)); toast("Backup restored. Reloading…", "ok"); setTimeout(() => location.reload(), 800); } catch { toast("That file isn't a valid backup", "bad"); } };
    $("#cn-wipe", el).onclick = async () => { if (await confirmBox("Wipe all local data?", "Friends, messages, contacts, keys and settings will be deleted from this browser.", "Wipe")) { store.keys().forEach(k => store.del(k)); location.reload(); } };
  }
};
