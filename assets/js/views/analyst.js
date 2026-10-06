import { $, esc, tag, me } from "../core.js";
import { I } from "./_icons.js";
import { intel, hotspots } from "../data.js";
import { providerSelect, stream, mountChat } from "../aichat.js";

async function context() {
  const I2 = await intel(), H = await hotspots();
  const os = (window.VT_OSINT || []).filter(i => i.iw.length).slice(0, 40).map(i => ({ src: i.src, when: new Date(i.ts).toISOString(), corroboratedBy: i.cor, official: i.official, tags: i.iw, places: i.places, text: i.text.slice(0, 240) }));
  return JSON.stringify({ snapshotAsOf: I2.asOf, threat: I2.threat, flashpoints: H.map(h => ({ place: h.name, sev: h.sev, date: h.date, title: h.title, summary: h.summary })), cyber: I2.cyber.map(c => ({ sev: c.sev, date: c.date, title: c.title })), markets: I2.markets, liveOsintIndicators: os });
}
let ctl = null;
export default {
  id: "analyst", title: "Analyst desk", group: "Operations", icon: I.analyst,
  render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Analyst desk</h1><p>Your own AI reads everything this terminal holds, including live OSINT indicators, and writes to the UK probabilistic yardstick. Treat it as a first draft.</p></div>
      <div class="row"><select class="i" id="an-p" style="width:auto"></select><button class="btn primary" id="an-go">Write morning brief</button><button class="btn" id="an-stop" disabled>Stop</button></div></div>
    <div class="grid g12">
      <div class="panel key c7"><div class="ph"><h2>Morning intelligence brief</h2><div class="meta" id="an-m"></div></div><div class="pb scroll" style="max-height:calc(100vh - 260px)"><div class="out" id="an-out"><span class="note">Generate a brief from the snapshot, live OSINT indicators, cyber advisories and markets. Start OSINT collection first for a fresher picture.</span></div></div></div>
      <div class="panel c5" style="min-height:440px"><div class="ph"><h2>Ask the analyst</h2></div><div class="chat" style="min-height:0;flex:1"><div class="chatlog" id="an-log"></div>
        <form class="chatin" id="an-f"><input class="i" id="an-t" placeholder="e.g. What does Hormuz mean for UK fuel prices?" autocomplete="off"><button class="btn primary">Ask</button></form></div></div>
    </div>`;
    const sel = providerSelect($("#an-p", el));
    $("#an-go", el).onclick = async () => { ctl = new AbortController(); $("#an-go", el).disabled = true; $("#an-stop", el).disabled = false;
      const t = await stream($("#an-out", el), { provider: sel.value, signal: ctl.signal, maxTokens: 1800, system: "You are a senior all-source intelligence analyst. Use only the supplied data; never invent events. Plain text, no markdown symbols.",
        messages: [{ role: "user", content: `Today is ${new Date().toDateString()}. Write the MORNING INTELLIGENCE BRIEF for officer "${me().callsign}".
Structure:
BOTTOM LINE UP FRONT (3 sentences)
KEY JUDGEMENTS — 5 numbered, each with a UK Probability Yardstick term (remote chance, highly unlikely, unlikely, realistic possibility, likely, highly likely, almost certain) and a one-line rationale
REGIONAL ROUND-UP — Europe/Russia-Ukraine; Middle East & Gulf; Africa; Indo-Pacific
OSINT INDICATORS — what unverified/corroborated social reporting suggests, clearly caveated
CYBER — three most urgent items and defender actions
ECONOMIC SECURITY
WATCH LIST — 5 indicators for the next 72 hours
Under 650 words. Note stale items by their dates.
DATA: ${await context()}` }] });
      if (t) $("#an-m", el).innerHTML = tag("snap", "Drafted " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      $("#an-go", el).disabled = false; $("#an-stop", el).disabled = true; };
    $("#an-stop", el).onclick = () => ctl?.abort();
    let cached = ""; context().then(c => cached = c);
    mountChat({ form: $("#an-f", el), input: $("#an-t", el), log: $("#an-log", el), who: "Analyst", select: sel,
      rules: () => `You are an intelligence analyst talking to officer "${me().callsign}". Crisp plain prose, under 200 words, UK spelling. Ground current-event claims only in this dated data and say when something falls outside it: ${cached}` });
    setInterval(() => context().then(c => cached = c), 120000);
  }
};
