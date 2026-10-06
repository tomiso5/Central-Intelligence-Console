// Personal AI connectors. Keys are kept in this browser only (localStorage) and sent
// directly to the provider, or through your own relay if you enable "via relay".
import { store, relayBase, setting, hasRelay } from "./core.js";

export const PROVIDERS = {
  anthropic: { name: "Claude", vendor: "Anthropic", kind: "anthropic", base: "https://api.anthropic.com/v1", web: "https://claude.ai/new", keyUrl: "https://console.anthropic.com/settings/keys", defaultModel: "claude-sonnet-5-5" },
  openai: { name: "ChatGPT", vendor: "OpenAI", kind: "openai", base: "https://api.openai.com/v1", web: "https://chatgpt.com/", keyUrl: "https://platform.openai.com/api-keys", defaultModel: "" },
  gemini: { name: "Gemini", vendor: "Google", kind: "gemini", base: "https://generativelanguage.googleapis.com/v1beta", web: "https://gemini.google.com/app", keyUrl: "https://aistudio.google.com/app/apikey", defaultModel: "" },
  meta: { name: "Muse Spark", vendor: "Meta", kind: "openai", base: "https://api.meta.ai/v1", web: "https://www.meta.ai/", keyUrl: "https://dev.meta.ai/", defaultModel: "muse-spark-1.1" },
  mistral: { name: "Le Chat", vendor: "Mistral", kind: "openai", base: "https://api.mistral.ai/v1", web: "https://chat.mistral.ai/", keyUrl: "https://console.mistral.ai/api-keys", defaultModel: "" },
  xai: { name: "Grok", vendor: "xAI", kind: "openai", base: "https://api.x.ai/v1", web: "https://grok.com/", keyUrl: "https://console.x.ai/", defaultModel: "" },
  openrouter: { name: "OpenRouter", vendor: "Any model", kind: "openai", base: "https://openrouter.ai/api/v1", web: "https://openrouter.ai/chat", keyUrl: "https://openrouter.ai/keys", defaultModel: "" },
  custom: { name: "Custom endpoint", vendor: "Azure OpenAI, Ollama, LM Studio…", kind: "openai", base: "", web: "", keyUrl: "", defaultModel: "" },
  copilot: { name: "Copilot", vendor: "Microsoft", kind: "web", web: "https://copilot.microsoft.com/", note: "Microsoft doesn't offer a public API for consumer Copilot. Your prompt is copied and Copilot opens in a new tab. For Azure OpenAI, use Custom endpoint." }
};

export const conf = id => store.get("ai:" + id, {});
export const setConf = (id, v) => store.set("ai:" + id, { ...conf(id), ...v });
export const isReady = id => { const p = PROVIDERS[id]; const c = conf(id); return p && p.kind !== "web" && !!(c.key || (id === "custom" && c.base)); };
export const readyProviders = () => Object.keys(PROVIDERS).filter(isReady);
export const defaultProvider = () => { const d = store.get("ai:default"); return d && isReady(d) ? d : readyProviders()[0] || null; };
export const modelOf = id => conf(id).model || PROVIDERS[id].defaultModel;

function endpoint(id, path) {
  const p = PROVIDERS[id], c = conf(id);
  if (c.viaRelay && hasRelay()) return `${relayBase()}/ai/${id}?path=${encodeURIComponent(path)}${id === "custom" ? "&base=" + encodeURIComponent(c.base) : ""}`;
  return (id === "custom" ? c.base.replace(/\/$/, "") : p.base) + path;
}
function headers(id) {
  const p = PROVIDERS[id], c = conf(id), h = { "content-type": "application/json" };
  if (p.kind === "anthropic") { h["x-api-key"] = c.key; h["anthropic-version"] = "2023-06-01"; h["anthropic-dangerous-direct-browser-access"] = "true"; }
  else if (p.kind === "gemini") { h["x-goog-api-key"] = c.key; }
  else if (c.key) h["authorization"] = "Bearer " + c.key;
  if (id === "openrouter") { h["HTTP-Referer"] = location.origin; h["X-Title"] = "Vauxhall Terminal"; }
  if (c.viaRelay && setting("relayToken")) h["x-relay-token"] = setting("relayToken");
  return h;
}

export async function listModels(id) {
  const p = PROVIDERS[id];
  const r = await fetch(endpoint(id, p.kind === "gemini" ? "/models?pageSize=200" : "/models"), { headers: headers(id) });
  if (!r.ok) throw new Error(await errText(r));
  const j = await r.json();
  if (p.kind === "gemini") return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent")).map(m => m.name.replace(/^models\//, ""));
  return (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean).sort();
}

async function errText(r) {
  let t = ""; try { const j = await r.json(); t = j.error?.message || j.error?.type || j.message || JSON.stringify(j).slice(0, 200); } catch { t = r.statusText; }
  if (r.status === 401 || r.status === 403) return `The key was rejected (${r.status}). ${t}`;
  if (r.status === 429) return `Rate limited or out of credit (429). ${t}`;
  return `${r.status}: ${t}`;
}

async function* sse(resp) {
  const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = "";
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = chunk.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("\n");
      if (data && data !== "[DONE]") { try { yield JSON.parse(data); } catch {} }
    }
  }
}

/** Stream a chat. messages: [{role:'user'|'assistant', content:string}] */
export async function chat({ provider, system = "", messages, onText = () => {}, signal, maxTokens = 2048 }) {
  const id = provider || defaultProvider();
  if (!id) { const e = new Error("No AI connected. Add a key under AI connectors."); e.code = "no_ai"; throw e; }
  const p = PROVIDERS[id], model = modelOf(id);
  if (!model && p.kind !== "anthropic") { const e = new Error(`Pick a model for ${p.name} under AI connectors.`); e.code = "no_model"; throw e; }
  let url, body;
  if (p.kind === "anthropic") { url = endpoint(id, "/messages"); body = { model, max_tokens: maxTokens, stream: true, system: system || undefined, messages }; }
  else if (p.kind === "gemini") {
    url = endpoint(id, `/models/${model}:streamGenerateContent?alt=sse`);
    body = { contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })), ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), generationConfig: { maxOutputTokens: maxTokens } };
  } else { url = endpoint(id, "/chat/completions"); body = { model, stream: true, messages: [...(system ? [{ role: "system", content: system }] : []), ...messages] }; }
  const r = await fetch(url, { method: "POST", headers: headers(id), body: JSON.stringify(body), signal });
  if (!r.ok) throw new Error(await errText(r));
  let text = "";
  for await (const ev of sse(r)) {
    let d = "";
    if (p.kind === "anthropic") { if (ev.type === "content_block_delta") d = ev.delta?.text || ""; if (ev.type === "error") throw new Error(ev.error?.message); }
    else if (p.kind === "gemini") d = (ev.candidates?.[0]?.content?.parts || []).map(x => x.text || "").join("");
    else d = ev.choices?.[0]?.delta?.content || "";
    if (d) { text += d; onText(text, d); }
  }
  return text;
}

/** Hand a prompt to a web-only assistant (Copilot etc.): copy it and open the app. */
export async function openWeb(id, prompt = "") {
  const p = PROVIDERS[id];
  try { if (prompt) await navigator.clipboard.writeText(prompt); } catch {}
  window.open(p.web, "_blank", "noopener");
}
