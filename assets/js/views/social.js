import { $, $$, esc, store, tag, ago, empty, toast, relay, hasRelay, smartJSON, getJSON, decodeEntities, loadScript, segmented, modal } from "../core.js";
import { I } from "./_icons.js";
import * as bsky from "../bsky.js";

const strip = h => decodeEntities(String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")).trim();
const card = i => `<div class="item"><div class="src-ic">${i.ic}</div><div style="min-width:0"><div class="who"><b>${esc(i.name || i.author)}</b><span>${esc(i.name ? i.author : "")}</span><span>· ${ago(i.ts)}</span></div>
  <div class="txt">${esc(i.text)}</div>${i.media ? `<img class="media" loading="lazy" src="${esc(i.media)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
  <div class="row note" style="margin-top:4px">${i.stats || ""}<a href="${esc(i.url)}" target="_blank" rel="noopener">Open</a>${i.extra || ""}</div></div></div>`;

const TABS = {
  async bluesky(host) {
    const s = bsky.session();
    host.innerHTML = `<div class="row" style="padding:10px 12px;border-bottom:1px solid var(--line)">${s ? `<span class="note">Signed in as @${esc(s.handle)}</span><button class="btn" data-bs="tl">Home timeline</button>` : `<span class="note">Sign in under Connections for your home timeline and posting.</span>`}<form id="bs-f" class="row" style="margin-left:auto"><input class="i" name="q" placeholder="Search Bluesky" style="width:220px"><button class="btn">Search</button></form></div><div class="feed" id="bs-l"></div>`;
    const L = $("#bs-l", host); const show = async p => { L.innerHTML = `<div class="empty thinking">Loading…</div>`; try { const r = await p; L.innerHTML = r.length ? r.map(x => card({ ...x, ic: "BS", stats: `♥ ${x.likes || 0} · ⟲ ${x.reposts || 0} ` })).join("") : empty("Nothing found"); } catch (e) { L.innerHTML = `<div class="err">${esc(e.message)}</div>`; } };
    $("#bs-f", host).onsubmit = e => { e.preventDefault(); show(bsky.search(new FormData(e.target).get("q"))); };
    host.querySelector('[data-bs="tl"]')?.addEventListener("click", () => show(bsky.timeline()));
    show(s ? bsky.timeline() : bsky.search("news", 30).catch(() => { throw new Error("Bluesky's public search now requires sign-in. Add an app password under Connections."); }));
  },
  async reddit(host) {
    const subs = store.get("social:subs", ["worldnews", "geopolitics", "CredibleDefense", "technology", "Netherlands"]);
    host.innerHTML = `<div class="row" style="padding:10px 12px;border-bottom:1px solid var(--line)"><div class="row" id="rd-subs">${subs.map((s, i) => `<button class="chip" data-sub="${esc(s)}" aria-pressed="${i === 0}">r/${esc(s)} <span class="x" data-rm="${esc(s)}">✕</span></button>`).join("")}</div><form id="rd-add" class="row" style="margin-left:auto"><input class="i" name="s" placeholder="Add subreddit" style="width:160px"><button class="btn">Add</button></form><div class="seg" id="rd-sort"><button data-s="hot" aria-pressed="true">Hot</button><button data-s="new">New</button><button data-s="top">Top</button></div></div><div class="feed" id="rd-l"></div>`;
    let sub = subs[0], sort = "hot"; const L = $("#rd-l", host);
    const load = async () => { L.innerHTML = `<div class="empty thinking">Loading r/${esc(sub)}…</div>`;
      try { const j = await smartJSON(`https://www.reddit.com/r/${sub}/${sort}.json?limit=30&raw_json=1${sort === "top" ? "&t=day" : ""}`);
        L.innerHTML = j.data.children.map(({ data: d }) => card({ ic: "RD", author: "u/" + d.author, name: d.title, text: d.selftext ? d.selftext.slice(0, 500) : (d.url && !d.url.includes(d.permalink) ? d.url : ""), ts: d.created_utc * 1000, url: "https://www.reddit.com" + d.permalink, media: d.preview?.images?.[0]?.resolutions?.slice(-1)[0]?.url, stats: `▲ ${d.score} · 💬 ${d.num_comments} `, extra: `<button class="btn ghost" style="padding:1px 8px" data-comments="${d.id}">Comments</button>` })).join("");
      } catch (e) { L.innerHTML = `<div class="err">Reddit didn't respond (${esc(e.message)}). Reddit often blocks browser requests; configure your relay to route through it.</div>`; } };
    $("#rd-subs", host).onclick = e => { const rm = e.target.closest("[data-rm]"); if (rm) { e.stopPropagation(); store.set("social:subs", subs.filter(s => s !== rm.dataset.rm)); return TABS.reddit(host); } const b = e.target.closest("[data-sub]"); if (b) { $$("#rd-subs .chip", host).forEach(x => x.setAttribute("aria-pressed", x === b)); sub = b.dataset.sub; load(); } };
    $("#rd-add", host).onsubmit = e => { e.preventDefault(); const s = new FormData(e.target).get("s").replace(/^r\//, "").trim(); if (s) { store.set("social:subs", [...new Set([...subs, s])]); TABS.reddit(host); } };
    segmented($("#rd-sort", host), d => { sort = d.s; load(); });
    L.onclick = async e => { const b = e.target.closest("[data-comments]"); if (!b) return; const d = modal("Comments", `<div class="thinking">Loading…</div>`, { wide: true });
      try { const j = await smartJSON(`https://www.reddit.com/comments/${b.dataset.comments}.json?raw_json=1&limit=40&depth=2`); const p = j[0].data.children[0].data;
        const walk = (c, lvl = 0) => c.filter(x => x.kind === "t1").map(({ data: x }) => `<div style="margin-left:${lvl * 16}px;padding:8px 0;border-bottom:1px solid var(--line)"><div class="note">u/${esc(x.author)} · ▲ ${x.score} · ${ago(x.created_utc * 1000)}</div><div class="out">${esc(x.body)}</div></div>${x.replies?.data ? walk(x.replies.data.children, lvl + 1) : ""}`).join("");
        d.querySelector(".pb").innerHTML = `<h3 style="font:500 18px var(--serif);margin:0 0 8px">${esc(p.title)}</h3>${p.selftext ? `<div class="out" style="margin-bottom:12px">${esc(p.selftext)}</div>` : ""}${walk(j[1].data.children)}`; }
      catch (err) { d.querySelector(".pb").innerHTML = `<div class="err">${esc(err.message)}</div>`; } };
    load();
  },
  async x(host) {
    const f = hasRelay() ? (await relay("/health").catch(() => ({}))).features || {} : {};
    host.innerHTML = `<div style="padding:10px 12px;border-bottom:1px solid var(--line)" class="row">${f.x ? `<form id="x-f" class="row" style="flex:1"><input class="i" name="q" placeholder="Search X (API v2 syntax)" style="flex:1" value="${esc(store.get("social:xq", "breaking news -is:retweet lang:en"))}"><button class="btn">Search</button></form>` : `<span class="note" style="flex:1">X's API is paid and can't be called from a browser. Add an X bearer token to your relay for search. Embedding and posting below work without it.</span>`}</div>
      <div class="pb grid" style="grid-template-columns:1fr 1fr;gap:12px"><form id="x-emb" class="frm"><label class="f">Embed a post (paste x.com link)<input class="i" name="u" placeholder="https://x.com/user/status/…"></label><button class="btn">Embed</button></form>
      <form id="x-post" class="frm"><label class="f">Post to X<textarea class="i" name="t" style="min-height:70px" maxlength="280"></textarea></label><button class="btn primary">Open composer</button></form></div><div class="feed" id="x-l"></div><div class="pb" id="x-e"></div>`;
    $("#x-post", host).onsubmit = e => { e.preventDefault(); window.open("https://x.com/intent/post?text=" + encodeURIComponent(new FormData(e.target).get("t")), "_blank", "noopener"); };
    $("#x-emb", host).onsubmit = async e => { e.preventDefault(); const u = String(new FormData(e.target).get("u")).replace("x.com", "twitter.com"); const b = document.createElement("blockquote"); b.className = "twitter-tweet"; b.dataset.theme = "dark"; b.innerHTML = `<a href="${esc(u)}"></a>`; $("#x-e", host).prepend(b); await loadScript("https://platform.twitter.com/widgets.js"); window.twttr?.widgets?.load($("#x-e", host)); };
    $("#x-f", host)?.addEventListener("submit", async e => { e.preventDefault(); const q = new FormData(e.target).get("q"); store.set("social:xq", q); const L = $("#x-l", host); L.innerHTML = `<div class="empty thinking">Searching X…</div>`;
      try { const j = await relay("/x/search", { q }); const users = Object.fromEntries((j.includes?.users || []).map(u => [u.id, u]));
        L.innerHTML = (j.data || []).map(t => { const u = users[t.author_id] || {}; return card({ ic: "X", author: "@" + u.username, name: u.name, text: t.text, ts: new Date(t.created_at).getTime(), url: `https://x.com/${u.username}/status/${t.id}`, stats: t.public_metrics ? `♥ ${t.public_metrics.like_count} · ⟲ ${t.public_metrics.retweet_count} ` : "" }); }).join("") || empty("No posts found");
      } catch (err) { L.innerHTML = `<div class="err">${esc(err.message)}</div>`; } });
  },
  async mastodon(host) {
    const inst = store.get("social:masto", "mastodon.social");
    host.innerHTML = `<div class="row" style="padding:10px 12px;border-bottom:1px solid var(--line)"><form id="ma-f" class="row"><input class="i" name="i" value="${esc(inst)}" style="width:170px"><input class="i" name="t" placeholder="#hashtag (blank = trending)" style="width:190px"><button class="btn">Load</button></form></div><div class="feed" id="ma-l"></div>`;
    const load = async (i, t) => { const L = $("#ma-l", host); L.innerHTML = `<div class="empty thinking">Loading…</div>`;
      try { const j = await getJSON(t ? `https://${i}/api/v1/timelines/tag/${encodeURIComponent(t.replace(/^#/, ""))}?limit=30` : `https://${i}/api/v1/trends/statuses?limit=30`);
        L.innerHTML = j.map(s => card({ ic: "MA", author: "@" + s.account.acct, name: s.account.display_name, text: strip(s.content), ts: new Date(s.created_at).getTime(), url: s.url, media: s.media_attachments?.[0]?.preview_url, stats: `♥ ${s.favourites_count} · ⟲ ${s.reblogs_count} ` })).join("") || empty("Nothing here"); }
      catch (e) { L.innerHTML = `<div class="err">${esc(e.message)}</div>`; } };
    $("#ma-f", host).onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); store.set("social:masto", f.get("i")); load(f.get("i"), f.get("t")); };
    load(inst, "");
  },
  async whatsapp(host) {
    host.innerHTML = `<div class="pb grid" style="grid-template-columns:1fr 1fr;gap:16px">
      <form id="wa-f" class="frm"><h3 style="margin:0;font:500 18px var(--serif)">Message on WhatsApp</h3><label class="f">Phone number with country code<input class="i" name="n" placeholder="+31 6 12345678" required></label><label class="f">Message<textarea class="i" name="t"></textarea></label><button class="btn primary">Open chat</button>
        <p class="note">WhatsApp offers no API for reading personal chats, so conversations open in WhatsApp itself. For chats that stay in the terminal, use Field messages.</p></form>
      <div class="frm"><h3 style="margin:0;font:500 18px var(--serif)">Quick links</h3><a class="btn" href="https://web.whatsapp.com/" target="_blank" rel="noopener">Open WhatsApp Web</a><a class="btn" href="https://www.whatsapp.com/channels" target="_blank" rel="noopener">Browse WhatsApp Channels</a><button class="btn" data-go="comms">Field messages (in-portal)</button></div></div>`;
    $("#wa-f", host).onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); window.open(`https://wa.me/${String(f.get("n")).replace(/[^\d]/g, "")}?text=${encodeURIComponent(f.get("t"))}`, "_blank", "noopener"); };
  },
  async instagram(host) {
    const saved = store.get("social:ig", []);
    host.innerHTML = `<div class="pb"><form id="ig-f" class="row"><input class="i" name="u" placeholder="Paste an Instagram post or reel link" style="flex:1"><button class="btn primary">Add to board</button><a class="btn" href="https://www.instagram.com/" target="_blank" rel="noopener">Open Instagram</a></form>
      <p class="note">Instagram doesn't allow third-party apps to show your feed. Pin public posts here and they embed in the terminal.</p></div><div class="pb grid" id="ig-l" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px"></div>`;
    const paint = async () => { const l = store.get("social:ig", []); $("#ig-l", host).innerHTML = l.length ? l.map(u => `<div><blockquote class="instagram-media" data-instgrm-permalink="${esc(u)}" data-instgrm-version="14" style="background:#fff;min-width:300px;width:100%"><a href="${esc(u)}">${esc(u)}</a></blockquote><button class="btn ghost" data-rm="${esc(u)}">Remove</button></div>`).join("") : empty("No posts pinned");
      await loadScript("https://www.instagram.com/embed.js").catch(() => {}); window.instgrm?.Embeds?.process(); };
    $("#ig-f", host).onsubmit = e => { e.preventDefault(); const u = String(new FormData(e.target).get("u")).trim().split("?")[0]; if (!/instagram\.com\/(p|reel)\//.test(u)) return toast("That isn't an Instagram post link", "bad"); store.set("social:ig", [u, ...saved.filter(x => x !== u)].slice(0, 30)); paint(); };
    $("#ig-l", host).onclick = e => { const b = e.target.closest("[data-rm]"); if (b) { store.set("social:ig", store.get("social:ig", []).filter(x => x !== b.dataset.rm)); paint(); } };
    paint();
  }
};

export default {
  id: "social", title: "Social", group: "Communications", icon: I.social,
  render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Social</h1><p>Read Bluesky, Reddit, Mastodon and X in one place, pin Instagram posts, and post everywhere from one composer.</p></div></div>
    <div class="grid g12">
      <div class="panel key c8"><div class="tabs" id="so-tabs" style="margin:0;padding:0 8px">${[["bluesky", "Bluesky"], ["reddit", "Reddit"], ["x", "X"], ["mastodon", "Mastodon"], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"]].map(([k, l], i) => `<button data-t="${k}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>
        <div class="scroll" style="max-height:calc(100vh - 250px);min-height:420px" id="so-body"></div></div>
      <div class="panel c4"><div class="ph"><h2>Post everywhere</h2></div><form class="pb frm" id="so-post"><textarea class="i" name="t" placeholder="Write once…" style="min-height:140px" maxlength="2000"></textarea><div class="note" id="so-len">0 characters</div>
        <div class="row"><button class="btn primary" type="button" data-p="bsky">Bluesky</button><button class="btn" type="button" data-p="x">X</button><button class="btn" type="button" data-p="wa">WhatsApp</button><button class="btn" type="button" data-p="tg">Telegram</button><button class="btn" type="button" data-p="li">LinkedIn</button><button class="btn" type="button" data-p="rd">Reddit</button><button class="btn" type="button" data-p="fr">Field messages</button></div>
        <p class="note">Bluesky posts directly once you're signed in. The others open their own composer pre-filled, so you confirm there.</p></form></div>
    </div>`;
    const body = $("#so-body", el);
    segmented($("#so-tabs", el), d => { body.innerHTML = ""; TABS[d.t](body); });
    TABS.bluesky(body);
    const f = $("#so-post", el), t = f.elements.t;
    t.oninput = () => $("#so-len", el).textContent = `${t.value.length} characters${t.value.length > 280 ? " · too long for X" : ""}${t.value.length > 300 ? " · too long for Bluesky" : ""}`;
    f.onclick = async e => { const b = e.target.closest("[data-p]"); if (!b) return; const v = t.value.trim(); if (!v) return toast("Write something first", "bad"); const u = encodeURIComponent(v);
      const open = url => window.open(url, "_blank", "noopener");
      switch (b.dataset.p) {
        case "bsky": try { await bsky.createPost(v); toast("Posted to Bluesky", "ok"); } catch (err) { if (/sign in/i.test(err.message)) open("https://bsky.app/intent/compose?text=" + u); else toast(err.message, "bad"); } break;
        case "x": open("https://x.com/intent/post?text=" + u); break;
        case "wa": open("https://wa.me/?text=" + u); break;
        case "tg": open("https://t.me/share/url?url=&text=" + u); break;
        case "li": open("https://www.linkedin.com/feed/?shareActive=true&text=" + u); break;
        case "rd": open("https://www.reddit.com/submit?type=TEXT&title=" + encodeURIComponent(v.slice(0, 280))); break;
        case "fr": window.VT.go("comms", { share: v }); break;
      } };
  }
};
