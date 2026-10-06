import { $, esc, tag, dshort, ago, empty } from "../core.js";
import { I } from "./_icons.js";
import { intel, snapLabel, kev, wire } from "../data.js";
export default {
  id: "cyber", title: "Cyber & SIGINT", group: "Operations", icon: I.cyber,
  async render(el) {
    el.innerHTML = `
    <div class="vhead"><div><h1>Cyber &amp; SIGINT</h1><p>Exploited vulnerabilities, incidents and the open-source security wire.</p></div><div class="row"><a class="btn" href="https://report.ncsc.gov.uk/" target="_blank" rel="noopener">Report an incident (NCSC)</a></div></div>
    <div class="grid g12">
      <div class="panel key c7"><div class="ph"><h2>Analyst-curated advisories</h2><div class="meta"><span class="tag snap" id="cy-t"></span></div></div><div class="pb flush scroll" style="max-height:560px"><ul class="list" id="cy-l"></ul></div></div>
      <div class="c5 grid" style="align-content:start">
        <div class="panel"><div class="ph"><h2>CISA known exploited, latest</h2><div class="meta" id="cy-km"></div></div><div class="pb flush scroll" style="max-height:300px" id="cy-k"></div></div>
        <div class="panel"><div class="ph"><h2>Security wire</h2><div class="meta" id="cy-wm"></div></div><div class="pb flush scroll" style="max-height:240px" id="cy-w"></div></div>
      </div></div>`;
    const I2 = await intel(); $("#cy-t", el).textContent = snapLabel(I2);
    $("#cy-l", el).innerHTML = I2.cyber.map(c => `<li><span class="sev ${c.sev}" style="margin-top:6px"></span><div><div class="t">${esc(c.title)}</div><div class="s">${esc(c.summary)} <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.src)}</a></div></div><span class="d">${dshort(c.date)}</span></li>`).join("");
    kev().then(k => { $("#cy-k", el).innerHTML = `<ul class="list">${k.list.slice(0, 20).map(x => `<li><span class="sev ${x.knownRansomwareCampaignUse === "Known" ? "critical" : "high"}" style="margin-top:6px"></span><div><div class="t"><a href="https://nvd.nist.gov/vuln/detail/${esc(x.cveID)}" target="_blank" rel="noopener">${esc(x.cveID)}</a> · ${esc(x.vendorProject)} ${esc(x.product)}</div><div class="s">${esc(x.vulnerabilityName)}${x.knownRansomwareCampaignUse === "Known" ? " · used by ransomware" : ""} · patch by ${esc(x.dueDate)}</div></div><span class="d">${dshort(x.dateAdded)}</span></li>`).join("")}</ul>`; $("#cy-km", el).innerHTML = tag("live", k.count + " total"); })
      .catch(() => $("#cy-k", el).innerHTML = empty("CISA catalogue unreachable"));
    wire().then(h => { $("#cy-w", el).innerHTML = `<ul class="list">${h.slice(0, 15).map(x => `<li><div class="t" style="font-weight:400"><a href="${esc(x.url || "https://news.ycombinator.com/item?id=" + x.objectID)}" target="_blank" rel="noopener">${esc(x.title)}</a></div><span class="d">${ago(new Date(x.created_at).getTime())}</span></li>`).join("")}</ul>`; $("#cy-wm", el).innerHTML = tag("live", "Hacker News"); })
      .catch(() => $("#cy-w", el).innerHTML = empty("Security wire unreachable"));
  }
};
