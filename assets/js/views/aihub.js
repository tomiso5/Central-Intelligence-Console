import { $, $$, esc, store, toast, empty, hasRelay, me } from "../core.js";
import { I } from "./_icons.js";
import * as ai from "../ai.js";
import { providerSelect, mountChat, stream } from "../aichat.js";

const fire = () => dispatchEvent(new Event("vt-ai"));
export default {
  id: "ai", title: "AI connectors", group: "Support", icon: I.ai,
  render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>AI connectors</h1><p>Bring your own assistants. Keys are stored only in this browser and sent straight to the provider, or through your own relay if a provider blocks browser calls. Every AI feature in the terminal uses the default you pick here.</p></div></div>
    <div class="statusgrid" id="ai-cards"></div>
    <div class="grid g12" style="margin-top:12px">
      <div class="panel key c6" style="min-height:420px"><div class="ph"><h2>Chat</h2><div class="meta"><select class="i" id="ai-p" style="width:auto"></select></div></div><div class="chat" style="min-height:0;flex:1"><div class="chatlog" id="ai-log"></div>
        <form class="chatin" id="ai-f"><input class="i" id="ai-t" placeholder="Ask anything" autocomplete="off"><button class="btn primary">Send</button></form></div></div>
      <div class="panel c6"><div class="ph"><h2>Ask every connected AI</h2></div><form class="pb row" id="ai-cf"><input class="i" name="q" placeholder="Same question to all, side by side" style="flex:1"><button class="btn primary">Compare</button></form><div class="compare" id="ai-cmp"></div></div>
    </div>`;
    this.cards(el);
    const sel = providerSelect($("#ai-p", el));
    mountChat({ form: $("#ai-f", el), input: $("#ai-t", el), log: $("#ai-log", el), who: "Assistant", select: sel, rules: () => `You are a helpful assistant inside "Vauxhall Terminal", a spy-themed personal dashboard. The user's callsign is ${me().callsign}. Be concise.` });
    $("#ai-cf", el).onsubmit = e => { e.preventDefault(); const q = new FormData(e.target).get("q"); const ids = ai.readyProviders(); if (!ids.length) { $("#ai-cmp", el).innerHTML = `<div>${empty("Connect at least one AI above")}</div>`; return; }
      $("#ai-cmp", el).innerHTML = ids.map(id => `<div><div class="note" style="margin-bottom:6px"><b style="color:var(--text)">${esc(ai.PROVIDERS[id].name)}</b> · ${esc(ai.modelOf(id))}</div><div class="out" id="cmp-${id}"></div></div>`).join("");
      ids.forEach(id => stream($("#cmp-" + id, el), { provider: id, messages: [{ role: "user", content: q }], maxTokens: 700 })); };
  },
  cards(el) {
    const def = ai.defaultProvider();
    $("#ai-cards", el).innerHTML = Object.entries(ai.PROVIDERS).map(([id, p]) => { const c = ai.conf(id), ready = ai.isReady(id);
      if (p.kind === "web") return `<div class="panel"><div class="ph"><h2>${esc(p.name)}</h2><div class="meta">${esc(p.vendor)}</div></div><div class="pb provider"><p class="note" style="margin:0">${esc(p.note)}</p><div class="row"><button class="btn primary" data-web="${id}">Open ${esc(p.name)}</button></div></div></div>`;
      return `<div class="panel${ready ? " key" : ""}"><div class="ph"><h2>${esc(p.name)}</h2><div class="meta">${esc(p.vendor)} ${ready ? '<span class="tag live">Connected</span>' : ""}${def === id ? '<span class="tag snap">Default</span>' : ""}</div></div><form class="pb provider" data-p="${id}">
        ${id === "custom" ? `<label class="f">Base URL (OpenAI-compatible)<input class="i" name="base" value="${esc(c.base || "")}" placeholder="http://localhost:11434/v1"></label>` : ""}
        <label class="f">API key${p.keyUrl ? ` · <a href="${esc(p.keyUrl)}" target="_blank" rel="noopener">get one</a>` : ""}<input class="i" name="key" type="password" autocomplete="off" value="${esc(c.key || "")}" placeholder="${id === "custom" ? "optional" : "paste key"}"></label>
        <label class="f">Model<input class="i" name="model" list="ml-${id}" value="${esc(c.model || p.defaultModel || "")}" placeholder="Load or type a model id"><datalist id="ml-${id}">${(c.models || []).map(m => `<option value="${esc(m)}">`).join("")}</datalist></label>
        <label class="row note"><input type="checkbox" name="relay" ${c.viaRelay ? "checked" : ""} ${hasRelay() ? "" : "disabled"}> Route through my relay${hasRelay() ? "" : " (no relay configured)"}</label>
        <div class="row"><button class="btn primary">Save</button><button class="btn" type="button" data-models>Load models</button><button class="btn ghost" type="button" data-test>Test</button>${ready && def !== id ? `<button class="btn ghost" type="button" data-def>Make default</button>` : ""}${c.key ? `<button class="btn ghost" type="button" data-forget>Forget key</button>` : ""}${p.web ? `<a class="btn ghost" href="${esc(p.web)}" target="_blank" rel="noopener">Web app ↗</a>` : ""}</div>
        <div class="note" data-st></div></form></div>`; }).join("");
    $("#ai-cards", el).onsubmit = e => { e.preventDefault(); const f = e.target, id = f.dataset.p, F = f.elements;
      ai.setConf(id, { key: F.key.value.trim(), model: F.model.value.trim(), viaRelay: F.relay.checked, ...(F.base ? { base: F.base.value.trim() } : {}) });
      if (!store.get("ai:default") && ai.isReady(id)) store.set("ai:default", id); toast(`${ai.PROVIDERS[id].name} saved`, "ok"); fire(); this.cards(el); };
    $("#ai-cards", el).onclick = async e => { const f = e.target.closest("form[data-p]"); const w = e.target.closest("[data-web]"); if (w) return ai.openWeb(w.dataset.web);
      if (!f) return; const id = f.dataset.p, st = $("[data-st]", f), F = f.elements;
      const persist = () => ai.setConf(id, { key: F.key.value.trim(), model: F.model.value.trim(), viaRelay: F.relay.checked, ...(F.base ? { base: F.base.value.trim() } : {}) });
      if (e.target.closest("[data-models]")) { persist(); st.textContent = "Loading models…"; try { const m = await ai.listModels(id); ai.setConf(id, { models: m }); $("datalist", f).innerHTML = m.map(x => `<option value="${esc(x)}">`).join(""); st.textContent = `${m.length} models available. Pick one in the Model box.`; if (!F.model.value && m[0]) F.model.value = m[0]; } catch (err) { st.innerHTML = `<span class="dn">${esc(err.message)}</span>${/Failed to fetch|NetworkError/.test(err.message) ? " — the provider may block browser calls; tick “Route through my relay”." : ""}`; } }
      if (e.target.closest("[data-test]")) { persist(); st.textContent = "Testing…"; try { const t = await ai.chat({ provider: id, messages: [{ role: "user", content: "Reply with exactly: Link established." }], maxTokens: 20 }); st.innerHTML = `<span class="up">✓ ${esc(t.trim())}</span>`; fire(); } catch (err) { st.innerHTML = `<span class="dn">${esc(err.message)}</span>`; } }
      if (e.target.closest("[data-def]")) { store.set("ai:default", id); fire(); this.cards(el); }
      if (e.target.closest("[data-forget]")) { ai.setConf(id, { key: "" }); fire(); this.cards(el); toast("Key removed from this browser"); } };
  }
};
