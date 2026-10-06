// Shared AI chat widget bound to the personal AI connectors.
import { esc, store, me } from "./core.js";
import * as ai from "./ai.js";

export function providerSelect(sel) {
  const fill = () => { const ready = ai.readyProviders(); const cur = sel.value || ai.defaultProvider();
    sel.innerHTML = ready.length ? ready.map(id => `<option value="${id}" ${id === cur ? "selected" : ""}>${esc(ai.PROVIDERS[id].name)} · ${esc(ai.modelOf(id) || "default")}</option>`).join("") : `<option value="">No AI connected</option>`; };
  fill(); addEventListener("vt-ai", fill); sel.addEventListener("focus", fill); return sel;
}
export const noAI = `<div class="empty"><b>No AI connected</b>Add a key for Claude, ChatGPT, Gemini, Muse or another assistant under AI connectors. Keys stay in this browser.<div style="margin-top:10px"><button class="btn" data-go="ai">Connect an AI</button></div></div>`;

export async function stream(out, opts) {
  out.innerHTML = `<span class="thinking">Thinking…</span>`;
  try { const t = await ai.chat({ ...opts, onText: txt => { out.textContent = txt; } }); if (!t) out.innerHTML = `<span class="note">No answer returned.</span>`; return t; }
  catch (e) { if (e.name === "AbortError") { out.insertAdjacentHTML("beforeend", `\n<span class="note">Stopped.</span>`); return null; }
    out.innerHTML = e.code === "no_ai" ? noAI : `<div class="err">${esc(e.message)}</div>`; return null; }
}
export function mountChat({ form, input, log, who, rules, select }) {
  const turns = []; let busy = false;
  form.onsubmit = async e => { e.preventDefault(); const t = input.value.trim(); if (!t || busy) return; input.value = ""; busy = true;
    log.insertAdjacentHTML("beforeend", `<div class="msg me"><div class="h"><b>${esc(me().callsign)}</b></div><div class="b">${esc(t)}</div></div>`);
    const m = document.createElement("div"); m.className = "msg"; const p = select?.value || ai.defaultProvider();
    m.innerHTML = `<div class="h"><b>${esc(who)}</b><span>${p ? esc(ai.PROVIDERS[p].name) : ""}</span></div><div class="b out"></div>`; log.appendChild(m); log.scrollTop = log.scrollHeight;
    turns.push({ role: "user", content: t });
    const txt = await stream(m.querySelector(".b"), { provider: p, system: rules(), messages: turns.slice(-12), maxTokens: 900 });
    if (txt) turns.push({ role: "assistant", content: txt }); else turns.pop();
    busy = false; log.scrollTop = log.scrollHeight; };
}
