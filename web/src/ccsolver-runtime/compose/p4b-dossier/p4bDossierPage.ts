import type { VerifiedP5DossierInput, VerifiedP5Target } from "./checkedP5DossierInput";
import { exactBoundaryStack } from "./p4bDossierVisuals";

type JsonRecord = Record<string, any>;

export const P4B_DOSSIER_CSS = `:root{color-scheme:light dark;--paper:#f4f0e7;--card:#fffdf8;--ink:#15212b;--muted:#586873;--line:#c9c1b4;--accent:#14567d;--accent-soft:#e4f1f8;--evidence:#08715f;--warning:#8a4b08;--focus:#d1495b;--shadow:0 12px 32px rgba(21,33,43,.08)}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
button,input{font:inherit}
a{color:var(--accent);text-underline-offset:.16em}
a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
.skip-link{position:fixed;z-index:50;top:.5rem;left:.5rem;transform:translateY(-180%);padding:.55rem .8rem;background:var(--card);border:2px solid var(--focus);border-radius:.4rem}
.skip-link:focus{transform:none}
.shell{width:min(100% - 2rem,88rem);margin-inline:auto}
.site-header{padding:1.1rem 0 .9rem;border-bottom:1px solid var(--line);background:var(--card)}
.site-header__row{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}
.eyebrow{margin:0;font-size:.72rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--muted)}
h1,h2,h3,h4,h5{line-height:1.18;text-wrap:balance}
h1{font-size:clamp(1.7rem,4vw,2.7rem);margin:.2rem 0 .35rem}
h2{font-size:clamp(1.45rem,2.4vw,2rem);margin:.4rem 0}
h3{font-size:1.25rem;margin:.35rem 0}
h4{font-size:1.06rem;margin:.25rem 0}
.lede{max-width:74ch;margin:.25rem 0;color:var(--muted)}
.badge-row{display:flex;flex-wrap:wrap;gap:.45rem;margin:.65rem 0 0}
.badge{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;padding:.24rem .62rem;background:var(--paper);font-size:.78rem;font-weight:750;white-space:nowrap}
.badge--unreviewed{border-color:#ba6b18;color:#6e3a04;background:#fff4df}
.workspace-nav{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--paper) 94%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);padding:.65rem 0}
.workspace-nav__row{display:flex;align-items:center;gap:.75rem;justify-content:space-between;flex-wrap:wrap}
.tab-list{display:flex;gap:.35rem;padding:.25rem;background:color-mix(in srgb,var(--line) 32%,transparent);border-radius:.65rem}
.tab-list button{appearance:none;border:0;border-radius:.45rem;background:transparent;color:var(--muted);font-weight:800;padding:.48rem .9rem;cursor:pointer}
.tab-list button[aria-selected="true"]{background:var(--card);color:var(--ink);box-shadow:0 1px 4px rgba(21,33,43,.14)}
.controls{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .85rem}
.controls strong{font-size:.78rem;color:var(--muted)}
.controls label{display:inline-flex;align-items:center;gap:.3rem;font-size:.78rem;font-weight:700;white-space:nowrap}
.no-js-only{display:block}
.js .no-js-only{display:none}
.js-only{display:none}
.js .js-only{display:flex}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.ruleset-panel{padding:1rem 0 0}
.solution-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:.65rem}
.timing{display:flex;gap:.6rem;flex-wrap:wrap}
.timing div{border-left:3px solid var(--evidence);padding:.12rem .55rem;font-size:.78rem;color:var(--muted)}
.timing strong{display:block;font-size:1.05rem;color:var(--ink)}
.solution-hero,.segment-explorer{background:var(--card);border:1px solid var(--line);border-radius:.9rem;box-shadow:var(--shadow)}
.solution-hero{padding:.75rem;margin-bottom:1rem}
.solution-hero__heading{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.5rem}
.map-frame,.segment-map-frame{min-width:0;overflow:hidden;background:#10171d;border:1px solid var(--line);border-radius:.65rem}
.whole-map{margin:0}
.whole-map__svg,.segment-map__svg{display:block;width:100%;height:auto;max-height:min(68vh,52rem)}
.whole-map__svg text,.segment-map__svg text{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;font-stretch:normal!important}
.whole-map__svg .title,.whole-map__svg .subtitle,.whole-map__svg .overlay-legend-label,.whole-map__svg .basis-label{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
.map-links,.map-caveat,.interaction-hint{font-size:.8rem;color:var(--muted)}
.map-links{margin:.55rem 0 0}
.map-caveat{max-width:84ch;margin:.4rem 0 0}
.segment-explorer{padding:.75rem}
.segment-explorer__heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:.65rem}
.segment-navigation{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:.45rem;margin-bottom:.75rem}
.js .segment-navigation{display:grid}
.segment-step{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:.5rem;padding:.48rem .65rem;cursor:pointer;font-weight:800}
.segment-tabs{display:grid;grid-template-columns:repeat(6,minmax(2.2rem,1fr));gap:.3rem;min-width:0}
.segment-tabs button{min-width:0;border:1px solid var(--line);border-radius:.5rem;background:var(--paper);color:var(--muted);padding:.45rem .25rem;cursor:pointer;font-weight:850}
.segment-tabs button[aria-selected="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.segment-stage{min-width:0}
.segment-panel{min-width:0}
.segment-shell{border:0}
.segment-shell>summary{cursor:pointer;font-weight:800;padding:.65rem 0}
.js .segment-shell>summary{display:none}
.segment-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(16rem,.65fr);gap:.85rem;align-items:start}
.segment-map-frame{background:#10171d}
.segment-map__svg{max-height:min(58vh,42rem);object-fit:contain}
.route-readout{display:block;min-height:2.6rem;margin:.5rem 0 0;padding:.5rem .65rem;border-left:3px solid var(--evidence);background:var(--paper);font-size:.78rem;color:var(--muted)}
.segment-copy{min-width:0;padding:.25rem}
.subgoal-heading{display:flex;gap:.65rem;align-items:center}
.subgoal-number{display:grid;place-items:center;flex:0 0 auto;width:2rem;height:2rem;border-radius:50%;background:var(--accent);color:#fff;font-weight:850}
.segment-meta{display:flex;flex-wrap:wrap;gap:.4rem;margin:.55rem 0}
.segment-meta span{border:1px solid var(--line);border-radius:999px;padding:.18rem .48rem;font-size:.76rem;font-weight:750}
.info-control{position:relative;display:inline-flex;align-items:center;gap:.4rem}
.info-button{display:grid;place-items:center;width:1.75rem;height:1.75rem;border:1px solid var(--accent);border-radius:50%;background:var(--accent-soft);color:#0d4463;font-weight:900;cursor:help}
.tooltip{position:absolute;z-index:20;right:0;bottom:calc(100% + .5rem);width:min(22rem,calc(100vw - 2rem));padding:.7rem .8rem;border-radius:.55rem;background:#172633;color:#fff;font-size:.8rem;box-shadow:0 8px 28px rgba(0,0,0,.25);opacity:0;visibility:hidden;transform:translateY(.25rem);transition:opacity .12s ease,transform .12s ease}
.info-button:hover+.tooltip,.info-button:focus+.tooltip,.info-button[aria-expanded="true"]+.tooltip{opacity:1;visibility:visible;transform:none}
.evidence-drawer{margin-top:.65rem;border:1px solid var(--line);border-radius:.65rem;background:var(--paper)}
.evidence-drawer>summary{cursor:pointer;padding:.65rem .75rem;font-weight:800}
.evidence-drawer__body{padding:0 .75rem .75rem}
.panel-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}
.boundary-panel{min-width:0;border:1px solid var(--line);border-radius:.55rem;background:var(--card);padding:.65rem}
.boundary-panel dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.2rem .55rem;margin:.45rem 0 0;font-size:.78rem}
.boundary-panel dt{font-weight:800}
.boundary-panel dd{margin:0;overflow-wrap:anywhere}
.stack-literal{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.72rem}
.join-proof{border-top:1px dashed var(--line);margin-top:.65rem;padding-top:.65rem;font-size:.82rem}
.digest{font:.74rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
.events{font-size:.82rem}
.download-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:.65rem}
.download-card,.graph-card{min-width:0;background:var(--card);border:1px solid var(--line);border-radius:.65rem;padding:.75rem}
.deep-review{margin:1rem 0}
.deep-review>summary{font-size:1rem}
.notice{border-left:4px solid var(--warning);padding:.65rem .8rem;background:var(--card)}
.plan-layout{display:grid;grid-template-columns:minmax(17rem,.8fr) minmax(24rem,1.2fr);gap:.75rem}
.plan-layout>*{min-width:0}
.plan-graph{min-width:0;display:grid;gap:.5rem}
.plan-node{min-width:0;overflow-wrap:anywhere;border-left:4px solid #6f2dbd;background:var(--card);padding:.65rem .75rem;border-radius:.35rem;font-size:.82rem}
.prerequisite{color:var(--evidence);font-weight:700}
.chronology{color:var(--muted);font-style:italic}
table{width:100%;border-collapse:collapse;font-size:.8rem}
th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:.45rem}
.table-scroll{overflow:auto}
.provenance{border:1px solid var(--line);border-radius:.65rem;background:var(--card);padding:.75rem}
.review-checkpoints li{margin:.45rem 0}
.site-footer{margin-top:1.5rem;padding:1.2rem 0 2rem;border-top:1px solid var(--line);color:var(--muted);font-size:.8rem}
.overlay[hidden]{display:none!important}
@media(max-width:900px){.segment-layout{grid-template-columns:1fr}.segment-copy{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.25rem .75rem;align-items:start}.segment-copy>p,.segment-copy>.segment-meta,.segment-copy>.evidence-drawer{grid-column:1/-1}}
@media(max-width:760px){.shell{width:min(100% - 1rem,88rem)}.site-header__row,.solution-heading,.segment-explorer__heading{align-items:flex-start;flex-direction:column}.workspace-nav{position:static}.controls{width:100%;overflow:visible;flex-wrap:wrap;padding-bottom:0}.tab-list{width:100%}.tab-list button{flex:1}.solution-hero,.segment-explorer{border-radius:.65rem;padding:.5rem}.segment-navigation{grid-template-columns:1fr 1fr}.segment-tabs{grid-column:1/-1;grid-row:1}.segment-step{grid-row:2}.segment-step[data-segment-step="1"]{grid-column:2}.panel-pair,.plan-layout{grid-template-columns:1fr}.segment-copy{display:block}.tooltip{position:fixed;left:1rem;right:1rem;bottom:1rem;width:auto}.whole-map__svg{max-height:62vh}.segment-map__svg{max-height:54vh}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{animation:none!important;transition:none!important}}
@media(prefers-color-scheme:dark){:root{--paper:#101820;--card:#18242d;--ink:#eef3f5;--muted:#b2c0c7;--line:#3b4e59;--accent:#72bce8;--accent-soft:#17384c;--evidence:#6fd8c4;--warning:#f3b35b;--shadow:none}.badge--unreviewed{color:#ffd699;background:#372615}.info-button{color:#d9f1ff}.map-frame,.segment-map-frame{background:#080d11}}
`;

export const P4B_DOSSIER_JS = `document.documentElement.classList.add("js");
const activateTab=(tabs,active,focus)=>{for(const tab of tabs){const selected=tab===active;tab.setAttribute("aria-selected",String(selected));tab.tabIndex=selected?0:-1;const panel=document.getElementById(tab.getAttribute("aria-controls")||"");if(panel){panel.toggleAttribute("hidden",!selected);if(selected){const shell=panel.querySelector("details.segment-shell");if(shell)shell.setAttribute("open","")}}}if(focus)active.focus()};
const setupTablist=(list,selector)=>{const tabs=Array.from(list.querySelectorAll(selector));if(tabs.length===0)return;const selected=tabs.find(tab=>tab.getAttribute("aria-selected")==="true")||tabs[0];activateTab(tabs,selected,false);for(const tab of tabs){tab.addEventListener("click",()=>activateTab(tabs,tab,false));tab.addEventListener("keydown",event=>{const current=tabs.indexOf(tab);let next=current;if(event.key==="ArrowRight")next=(current+1)%tabs.length;else if(event.key==="ArrowLeft")next=(current-1+tabs.length)%tabs.length;else if(event.key==="Home")next=0;else if(event.key==="End")next=tabs.length-1;else return;event.preventDefault();activateTab(tabs,tabs[next],true)})}};
for(const list of document.querySelectorAll("[data-ruleset-tabs]"))setupTablist(list,"[data-ruleset-tab]");
for(const list of document.querySelectorAll("[data-segment-tabs]"))setupTablist(list,"[data-segment-tab]");
for(const button of document.querySelectorAll("[data-segment-step]")){button.addEventListener("click",()=>{const target=button.getAttribute("data-segment-target")||"";const list=document.querySelector('[data-segment-tabs="'+target+'"]');if(!list)return;const tabs=Array.from(list.querySelectorAll("[data-segment-tab]"));const current=Math.max(0,tabs.findIndex(tab=>tab.getAttribute("aria-selected")==="true"));const delta=Number(button.getAttribute("data-segment-step"));const next=(current+delta+tabs.length)%tabs.length;activateTab(tabs,tabs[next],true)})}
for(const input of document.querySelectorAll("[data-overlay-toggle]")){input.addEventListener("change",()=>{const kinds=(input.getAttribute("data-overlay-toggle")||"").split(",");for(const map of document.querySelectorAll(".whole-map")){for(const kind of kinds){for(const overlay of map.querySelectorAll(".overlay--"+kind)){overlay.toggleAttribute("hidden",!input.checked)}}}})}
for(const button of document.querySelectorAll("[data-tooltip-button]")){button.addEventListener("click",()=>button.setAttribute("aria-expanded",String(button.getAttribute("aria-expanded")!=="true")));button.addEventListener("keydown",event=>{if(event.key==="Escape"){button.setAttribute("aria-expanded","false");button.focus()}})}
for(const point of document.querySelectorAll("[data-route-detail]")){const reveal=()=>{const panel=point.closest("[data-segment-panel]");const readout=panel&&panel.querySelector("[data-route-readout]");if(readout)readout.textContent=point.getAttribute("data-route-detail")||""};point.addEventListener("pointerenter",reveal);point.addEventListener("focus",reveal);point.addEventListener("click",reveal)}
`;

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shortDigest(digest: string): string {
  return `${digest.slice(0, 18)}…${digest.slice(-8)}`;
}

function dataHref(path: string): string {
  const prefix = "ccsolver/fixtures/golden/p5/cclp1-001/";
  if (!path.startsWith(prefix)) throw new Error(`P4B cannot link non-P5 data path: ${path}`);
  return `../../../data/p5/${path.slice(prefix.length)}`;
}

function decorateEmbeddedSvg(svg: string, className: string, attributes: string): string {
  const openingEnd = svg.indexOf(">");
  if (openingEnd < 0 || !svg.startsWith("<svg ")) {
    throw new Error("P4B embedded artwork is not an SVG document");
  }
  const opening = svg.slice(0, openingEnd + 1);
  const classMatches = [...opening.matchAll(/\bclass="([^"]*)"/gu)];
  if (classMatches.length > 1) {
    throw new Error("P4B embedded artwork has duplicate class attributes");
  }
  const withClass = classMatches.length === 1
    ? opening.replace(/\bclass="([^"]*)"/u, `class="$1 ${className}"`)
    : opening.replace("<svg ", `<svg class="${className}" `);
  const decorated = withClass.replace("<svg ", `<svg ${attributes} `);
  return `${decorated}${svg.slice(openingEnd + 1)}`;
}

function boundaryDetail(
  target: VerifiedP5Target,
  boundaryOrder: number,
  panelAsset: string,
  role: "Starting state" | "Ending state",
): string {
  const { file, document } = target.boundaries[boundaryOrder]!;
  const targetLabel = target.target === "ms" ? "MS" : "Lynx";
  return `<section class="boundary-panel" aria-label="${escapeHtml(`${targetLabel} ${role.toLowerCase()} boundary ${boundaryOrder}`)}"><strong>${role} · boundary ${String(boundaryOrder).padStart(2, "0")}</strong><dl><dt>Native tick</dt><dd>${document.nativeTick}</dd><dt>Coordinate</dt><dd>(${document.coordinate.x}, ${document.coordinate.y}, ${document.coordinate.z})</dd><dt>Chips remain</dt><dd>${document.remainingChips}</dd><dt>Terminal</dt><dd>${escapeHtml(document.terminalKind)}</dd><dt>Fingerprint</dt><dd class="digest" title="${escapeHtml(document.exactFingerprint)}">${escapeHtml(shortDigest(document.exactFingerprint))}</dd><dt>Boundary bytes</dt><dd><a class="digest" href="${escapeHtml(dataHref(file.path))}" title="${escapeHtml(file.content.digest)}">${escapeHtml(shortDigest(file.content.digest))}</a></dd><dt>Scene digest</dt><dd class="digest" title="${escapeHtml(document.renderContent.digest)}">${escapeHtml(shortDigest(document.renderContent.digest))}</dd><dt>Exact cell stack</dt><dd class="stack-literal">${escapeHtml(exactBoundaryStack(target, boundaryOrder))}</dd></dl><p class="map-links"><a href="../../../assets/${escapeHtml(panelAsset)}">Open exact boundary artwork</a></p></section>`;
}

function subgoalCapsules(
  target: VerifiedP5Target,
  panelAssets: ReadonlyMap<string, string>,
  segmentSvgs: ReadonlyMap<string, string>,
  segmentAssets: ReadonlyMap<string, string>,
): string {
  return target.witness.subgoals.map((subgoal: JsonRecord, index: number) => {
    const startOrder = subgoal.starting.boundaryOrder;
    const endOrder = subgoal.ending.boundaryOrder;
    const startAsset = panelAssets.get(`${target.target}:${startOrder}`);
    const endAsset = panelAssets.get(`${target.target}:${endOrder}`);
    const segmentSvg = segmentSvgs.get(`${target.target}:${index}`);
    const segmentAsset = segmentAssets.get(`${target.target}:${index}`);
    if (
      startAsset === undefined
      || endAsset === undefined
      || segmentSvg === undefined
      || segmentAsset === undefined
    ) {
      throw new Error("P4B segment presentation asset missing");
    }
    const events = subgoal.eventOrders.map((eventOrder: number) => target.route.events[eventOrder]);
    const localLastMove = subgoal.lastStepOrder - subgoal.firstStepOrder + 1;
    const embeddedSvg = decorateEmbeddedSvg(
      segmentSvg,
      "segment-map__svg",
      `tabindex="0" aria-describedby="segment-help-${target.target}-${index + 1}"`,
    );
    const tooltip = `Segment ${index + 1}: ${subgoal.title}. ${subgoal.description} Local move labels reset from 0 through ${localLastMove}; hover or focus a numbered route tile for its exact global step.`;
    return `<section class="segment-panel" role="tabpanel" data-segment-panel="${target.target}:${index + 1}" id="segment-panel-${target.target}-${index + 1}" aria-labelledby="segment-tab-${target.target}-${index + 1}"><div class="subgoal-capsule"><details class="segment-shell"${index === 0 ? " open" : ""}><summary>${index + 1}. ${escapeHtml(subgoal.title)} · global steps ${subgoal.firstStepOrder}–${subgoal.lastStepOrder}</summary><div class="segment-layout"><div><div class="segment-map-frame">${embeddedSvg}</div><p class="interaction-hint">Route labels reset to local moves 0–${localLastMove}. Hover, focus, or tap a numbered tile for its global step and coordinate.</p><output class="route-readout" data-route-readout aria-live="polite">Point to or focus a numbered route tile to inspect its coordinate, full semantic stack, global visit, event, boundary tick, and evidence basis.</output><p class="map-links"><a href="../../../assets/${escapeHtml(segmentAsset)}">Open standalone segment artwork</a></p></div><div class="segment-copy"><div class="subgoal-heading"><span class="subgoal-number">${index + 1}</span><h4 id="segment-title-${target.target}-${index + 1}">${escapeHtml(subgoal.title)}</h4></div><div class="segment-meta"><span>Local moves 0–${localLastMove}</span><span>Global steps ${subgoal.firstStepOrder}–${subgoal.lastStepOrder}</span><span>Events ${subgoal.eventOrders[0]}–${subgoal.eventOrders.at(-1)}</span></div><p>${escapeHtml(subgoal.description)}</p><div class="info-control"><button type="button" class="info-button" data-tooltip-button aria-expanded="false" aria-label="About segment ${index + 1}" aria-describedby="segment-help-${target.target}-${index + 1}">i</button><span class="tooltip" role="tooltip" id="segment-help-${target.target}-${index + 1}">${escapeHtml(tooltip)}</span></div><details class="evidence-drawer"><summary>Exact segment evidence</summary><div class="evidence-drawer__body"><p class="events"><strong>Checked route events (plan model, not a causal runtime journal):</strong> ${events.map((event: JsonRecord) => escapeHtml(`#${event.eventOrder} ${event.kind} ${event.semanticType} at (${event.coordinate.x},${event.coordinate.y})`)).join("; ")}</p><div class="panel-pair">${boundaryDetail(target, startOrder, startAsset, "Starting state")}${boundaryDetail(target, endOrder, endAsset, "Ending state")}</div><div class="join-proof"><strong>Exact same-run join:</strong> boundary ${startOrder} <span aria-hidden="true">→</span> boundary ${endOrder}; global steps ${subgoal.firstStepOrder}–${subgoal.lastStepOrder}.<div class="digest">entry ${escapeHtml(subgoal.continuity.entryExactFingerprint)}<br>stop ${escapeHtml(subgoal.continuity.stopExactFingerprint)}</div></div></div></details></div></div></details></div></section>`;
  }).join("");
}

function targetSection(
  target: VerifiedP5Target,
  fullMapSvg: string,
  fullMapAsset: string,
  panelAssets: ReadonlyMap<string, string>,
  segmentSvgs: ReadonlyMap<string, string>,
  segmentAssets: ReadonlyMap<string, string>,
  twsDownload: string,
): string {
  const targetLabel = target.target === "ms" ? "MS" : "Lynx";
  const triggerTick = target.terminalTriggerTick;
  const settledTick = target.traceSettledTerminalTick;
  const embeddedSvg = decorateEmbeddedSvg(fullMapSvg, "whole-map__svg", 'tabindex="0"');
  const segmentTabs = target.witness.subgoals.map((subgoal: JsonRecord, index: number) => (
    `<button type="button" role="tab" data-segment-tab="${target.target}:${index + 1}" id="segment-tab-${target.target}-${index + 1}" aria-controls="segment-panel-${target.target}-${index + 1}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" title="${escapeHtml(`${index + 1}. ${subgoal.title} · global steps ${subgoal.firstStepOrder}–${subgoal.lastStepOrder}`)}"><span aria-hidden="true">${index + 1}</span><span class="sr-only">${escapeHtml(subgoal.title)}</span></button>`
  )).join("");
  return `<section class="ruleset-panel" role="tabpanel" data-ruleset-panel="${target.target}" id="target-${target.target}" aria-labelledby="ruleset-tab-${target.target}"><div class="solution-heading"><div><p class="eyebrow">Ruleset target</p><h2 id="target-${target.target}-title">${targetLabel} solution</h2></div><div class="timing"><div><span>${targetLabel} trigger/settled tick</span><strong>${triggerTick} / ${settledTick}</strong></div><div><span>Route / scenes</span><strong>162 / 7</strong></div></div></div><article class="solution-hero" data-overall-solution="${target.target}" aria-labelledby="overall-${target.target}-title"><div class="solution-hero__heading"><div><p class="eyebrow">Overall level solution</p><h3 id="overall-${target.target}-title">Complete 162-move route</h3></div><span class="badge">6 segment spans</span></div><div class="whole-map" id="whole-map-${target.target}"><div class="map-frame">${embeddedSvg}</div><p class="map-links"><a href="../../../assets/${escapeHtml(fullMapAsset)}">Open standalone full-map artwork</a> · <a href="${escapeHtml(dataHref(target.files.staticOverlay.path))}">Static overlay JSON</a> · <a href="${escapeHtml(dataHref(target.files.route.path))}">Route JSON</a></p></div><p class="map-caveat">The map uses the corresponding standard ${targetLabel} game artwork. The purple route is <strong>plan intent</strong>; exact observed evidence is limited to captured boundaries. Overview annotations stay compact—hover or focus map marks for full detail. No tile or causal relationship is inferred by this page.</p></article><section class="segment-explorer" aria-labelledby="segments-${target.target}-title"><div class="segment-explorer__heading"><div><p class="eyebrow">Walk the solution</p><h3 id="segments-${target.target}-title">Six continuous segments</h3></div><span class="badge">One segment at a time</span></div><div class="segment-navigation js-only"><button type="button" class="segment-step" data-segment-step="-1" data-segment-target="${target.target}" aria-label="Previous ${targetLabel} segment">← Previous</button><div class="segment-tabs" role="tablist" data-segment-tabs="${target.target}" aria-label="${targetLabel} solution segments">${segmentTabs}</div><button type="button" class="segment-step" data-segment-step="1" data-segment-target="${target.target}" aria-label="Next ${targetLabel} segment">Next →</button></div><div class="segment-stage">${subgoalCapsules(target, panelAssets, segmentSvgs, segmentAssets)}</div></section><details class="evidence-drawer deep-review"><summary>${targetLabel} plan authority and proof downloads</summary><div class="evidence-drawer__body"><p><strong>Candidate plan authority:</strong> <a href="${escapeHtml(dataHref(target.files.expandedPlan.path))}">expanded-plan root</a> → <a href="${escapeHtml(dataHref(target.files.plan.path))}">planning packet</a> → <a href="${escapeHtml(dataHref(target.files.route.path))}">selected route intent</a>. <strong>Solved-current outcome:</strong> established separately by the checked witness and replay certification below.</p><div class="download-grid"><div class="download-card"><strong>Complete TWS</strong><p><a download href="../../../downloads/${escapeHtml(twsDownload)}">Download exact ${targetLabel} TWS</a></p><p class="digest">${escapeHtml(target.files.tws.content.digest)} · ${target.files.tws.content.byteLength} bytes</p></div><div class="download-card"><strong>Replay certificate</strong><p><a href="${escapeHtml(dataHref(target.files.certificate.path))}">Certificate bundle</a></p><p class="digest">${escapeHtml(target.files.certificate.content.digest)}</p></div><div class="download-card"><strong>Native/TypeScript report</strong><p><a href="${escapeHtml(dataHref(target.files.certification.path))}">Certification report</a></p><p>Exact trace parity; isolated native save directory; exact input bytes read.</p></div></div></div></details></section>`;
}

type DisplayPlanEdge = {
  readonly from: number;
  readonly to: number | null;
  readonly kind: string;
  readonly resourceType: string | null;
};

function displayPlanEdges(target: VerifiedP5Target): readonly DisplayPlanEdge[] {
  if (!Array.isArray(target.plan.prerequisiteEdges)) {
    throw new Error(`${target.target} P4B plan prerequisite edges are missing`);
  }
  const edges = target.plan.prerequisiteEdges.map((edge: JsonRecord) => ({
    from: edge.fromRouteEventOrder,
    to: edge.toRouteEventOrder,
    kind: edge.kind,
    resourceType: edge.resourceType ?? null,
  }));
  if (edges.some((edge: DisplayPlanEdge) => (
    !Number.isInteger(edge.from)
    || edge.from < 0
    || edge.from > 28
    || (edge.to !== null && (!Number.isInteger(edge.to) || edge.to < 0 || edge.to > 28))
    || typeof edge.kind !== "string"
    || edge.kind.length === 0
  ))) {
    throw new Error(`${target.target} P4B plan contains an invalid typed dependency edge`);
  }
  const selectedRouteStateEdges = edges.filter((edge: DisplayPlanEdge) => (
    edge.kind === "selected-route-predecessor-state"
  ));
  const hasExactSelectedRouteChain = selectedRouteStateEdges.length === 29
    && Array.from({ length: 29 }, (_, from) => {
      const expectedTo = from === 0 ? null : from - 1;
      return selectedRouteStateEdges.filter((edge: DisplayPlanEdge) => (
        edge.from === from && edge.to === expectedTo
      )).length === 1;
    }).every(Boolean);
  if (!hasExactSelectedRouteChain) {
    throw new Error(
      `${target.target} P4B plan lacks the exact 29-edge selected-route predecessor-state chain`,
    );
  }
  const reachable = new Set<number>([28]);
  const pending = [28];
  while (pending.length > 0) {
    const from = pending.shift()!;
    for (const edge of edges.filter((candidate: DisplayPlanEdge) => candidate.from === from)) {
      if (edge.to !== null && !reachable.has(edge.to)) {
        reachable.add(edge.to);
        pending.push(edge.to);
      }
    }
  }
  if (reachable.size !== 29) {
    throw new Error(`${target.target} P4B displayed typed plan graph is not terminal-root connected`);
  }
  return edges;
}

function planDependencyText(edge: DisplayPlanEdge): string {
  if (edge.kind === "selected-route-predecessor-state") {
    return edge.to === null
      ? "Selected-route predecessor-state dependency: initial planning state"
      : `Selected-route predecessor-state dependency: event #${edge.to}`;
  }
  return `Typed resource dependency: event #${edge.to} (${edge.kind}${edge.resourceType === null ? "" : `, ${edge.resourceType}`})`;
}

function planGraph(target: VerifiedP5Target): string {
  const targetLabel = target.target === "ms" ? "MS" : "Lynx";
  const edges = displayPlanEdges(target);
  const nodes = target.plan.backwardTrace.map((entry: JsonRecord) => {
    const nodeEdges = edges.filter((edge) => edge.from === entry.routeEventOrder);
    const typedDependencies = nodeEdges.map((edge) => (
      `<li class="plan-dependency plan-dependency--${edge.kind === "selected-route-predecessor-state" ? "state" : "resource"}" data-plan-target="${target.target}" data-plan-edge-from="${edge.from}" data-plan-edge-to="${edge.to ?? "initial-state"}" data-plan-edge-kind="${escapeHtml(edge.kind)}">${escapeHtml(planDependencyText(edge))}</li>`
    )).join("");
    const prerequisites = entry.directPrerequisites.length === 0
      ? "No direct resource prerequisite declared."
      : entry.directPrerequisites.map((edge: JsonRecord) => (
        `event #${edge.routeEventOrder} (${edge.relationship}${edge.resourceType === null ? "" : `, ${edge.resourceType}`})`
      )).join("; ");
    const chronology = entry.chronologicalPreviousEventOrder === null
      ? "initial chronological event"
      : `chronological predecessor #${entry.chronologicalPreviousEventOrder} (noncausal ordering only)`;
    return `<div class="plan-node"><strong>#${entry.routeEventOrder} · ${escapeHtml(entry.routeEventKind)}</strong><br><span>${escapeHtml(entry.obligation)} at (${entry.coordinate.x}, ${entry.coordinate.y})</span><div class="plan-dependencies"><strong>Typed plan dependency edges</strong><ul>${typedDependencies}</ul></div><span class="prerequisite">Direct resource prerequisites: ${escapeHtml(prerequisites)}</span><br><span class="chronology">${escapeHtml(chronology)}</span></div>`;
  }).join("");
  const rows = target.plan.backwardTrace.map((entry: JsonRecord) => {
    const typedDependencies = edges.filter((edge) => edge.from === entry.routeEventOrder)
      .map((edge) => planDependencyText(edge)).join("; ");
    const directPrerequisites = entry.directPrerequisites
      .map((edge: JsonRecord) => `#${edge.routeEventOrder} ${edge.relationship}`).join("; ") || "—";
    return `<tr><td>${entry.traceOrder}</td><td>${entry.routeEventOrder}</td><td>${escapeHtml(entry.routeEventKind)}</td><td>${escapeHtml(entry.obligation)}</td><td>${escapeHtml(typedDependencies)}</td><td>${escapeHtml(directPrerequisites)}</td><td>${entry.chronologicalPreviousEventOrder ?? "—"}</td></tr>`;
  }).join("");
  return `<section aria-labelledby="plan-${target.target}-title"><h3 id="plan-${target.target}-title">${targetLabel} terminal-first trace</h3><p><strong>Coverage:</strong> 29 / 29 selected route events are reachable from the terminal root through displayed typed plan dependency edges. Selected-route predecessor-state dependencies and direct resource dependencies are shown distinctly; italic chronological predecessor metadata is noncausal and is never promoted into a plan edge.</p><div class="plan-layout"><div class="plan-graph" aria-label="${targetLabel} terminal-first plan graph">${nodes}</div><div class="graph-card"><h4>Accessible graph table</h4><div class="table-scroll"><table><thead><tr><th>Trace order</th><th>Route event</th><th>Kind</th><th>Obligation</th><th>Typed plan dependencies</th><th>Direct resource prerequisites</th><th>Chronological predecessor (noncausal)</th></tr></thead><tbody>${rows}</tbody></table></div></div></div></section>`;
}

export function renderP4bDossierIndex(input: { readonly cssAsset: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>CCSolver human review dossiers</title><link rel="stylesheet" href="assets/${escapeHtml(input.cssAsset)}"></head><body><main class="shell"><header class="site-header"><p class="eyebrow">CCSolver evidence review</p><h1>Human review dossiers</h1><p class="lede">Static, evidence-bound views generated from checked solver artifacts.</p></header><section><h2>CCLP1</h2><article class="target-card"><p class="eyebrow">Level 001</p><h3><a href="levels/cclp1/001-key-pyramid/">Key Pyramid</a></h3><p>Paired MS and Lynx whole-level proof dossier. Machine verification is complete; human review remains unreviewed.</p></article></section></main></body></html>`;
}

export function renderP4bKeyPyramidPage(input: {
  readonly source: VerifiedP5DossierInput;
  readonly cssAsset: string;
  readonly jsAsset: string;
  readonly fullMapSvgs: ReadonlyMap<string, string>;
  readonly fullMapAssets: ReadonlyMap<string, string>;
  readonly segmentSvgs: ReadonlyMap<string, string>;
  readonly segmentAssets: ReadonlyMap<string, string>;
  readonly panelAssets: ReadonlyMap<string, string>;
  readonly twsDownloads: ReadonlyMap<string, string>;
}): string {
  const ms = input.source.targets[0];
  const lynx = input.source.targets[1];
  const targetHtml = input.source.targets.map((target) => {
    const fullMapSvg = input.fullMapSvgs.get(target.target);
    const fullMapAsset = input.fullMapAssets.get(target.target);
    const twsDownload = input.twsDownloads.get(target.target);
    if (fullMapSvg === undefined || fullMapAsset === undefined || twsDownload === undefined) {
      throw new Error(`${target.target} P4B presentation asset missing`);
    }
    return targetSection(
      target,
      fullMapSvg,
      fullMapAsset,
      input.panelAssets,
      input.segmentSvgs,
      input.segmentAssets,
      twsDownload,
    );
  }).join("");
  const joinRows = input.source.targets.flatMap((target) => target.witness.subgoals.map((subgoal: JsonRecord) => `<tr><td>${target.target.toUpperCase()}</td><td>${escapeHtml(subgoal.title)}</td><td>${subgoal.starting.boundaryOrder}<br><span class="digest">${escapeHtml(shortDigest(subgoal.continuity.entryExactFingerprint))}</span></td><td>${subgoal.ending.boundaryOrder}<br><span class="digest">${escapeHtml(shortDigest(subgoal.continuity.stopExactFingerprint))}</span></td><td>${escapeHtml(subgoal.continuity.state)}</td></tr>`)).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark"><title>Key Pyramid · verified whole-level dossier</title><link rel="stylesheet" href="../../../assets/${escapeHtml(input.cssAsset)}"><script>document.documentElement.classList.add("js")</script><script defer src="../../../assets/${escapeHtml(input.jsAsset)}"></script></head><body><a class="skip-link" href="#dossier-workspace">Skip to solution</a><header class="site-header"><div class="shell site-header__row"><div><p class="eyebrow">CCSolver · CCLP1 level 001</p><h1>Key Pyramid · verified whole-level dossier</h1><p class="lede">One certified 162-move solution, presented first as a whole level and then as six inspectable segments.</p><div class="badge-row"><span class="badge badge--unreviewed">Human review: unreviewed</span><span class="badge">Machine outcome: solved-current</span><span class="badge">MS + Lynx</span></div></div><div><a href="../../../">Dossier index</a></div></div></header><div class="workspace-nav"><div class="shell workspace-nav__row"><div class="tab-list js-only" role="tablist" data-ruleset-tabs aria-label="Ruleset target"><button type="button" role="tab" data-ruleset-tab="ms" id="ruleset-tab-ms" aria-controls="target-ms" aria-selected="true" tabindex="0">MS</button><button type="button" role="tab" data-ruleset-tab="lynx" id="ruleset-tab-lynx" aria-controls="target-lynx" aria-selected="false" tabindex="-1">Lynx</button></div><nav class="no-js-only" aria-label="Ruleset targets"><a href="#target-ms">MS solution</a> · <a href="#target-lynx">Lynx solution</a></nav><div class="controls js-only" aria-label="Optional whole-map overlays"><strong>Whole-map overlays</strong><label title="Checked static topology membership"><input type="checkbox" checked data-overlay-toggle="region">Regions</label><label title="Checked source-fact pickups and gates"><input type="checkbox" checked data-overlay-toggle="resource-source,resource-gate">Resources</label><label title="Selected route intent; not per-step runtime observation"><input type="checkbox" checked data-overlay-toggle="plan-intent-route">Route</label><label title="Exact captured start and end anchors"><input type="checkbox" checked data-overlay-toggle="subgoal-span">Boundaries</label></div></div></div><noscript>This complete dossier does not require JavaScript.</noscript><main class="shell" id="dossier-workspace">${targetHtml}<details class="evidence-drawer deep-review"><summary>Human review guide · 2 targets, 12 segments, 24 exact boundary records</summary><div class="evidence-drawer__body"><ol class="review-checkpoints"><li>Compare each target’s initial full-map artwork with its compact region, source, gate, route-intent, and boundary overlays.</li><li>Walk all six adjacent start/end pairs per target; each ending boundary is byte-identical support for the next starting boundary.</li><li>Check exact cell stacks, remaining-chip counts, resource/door route events, zero-chip socket crossing, and the won exit boundary.</li><li>Confirm MS terminal trigger/settlement is ${ms.terminalTriggerTick}/${ms.traceSettledTerminalTick}; Lynx is ${lynx.terminalTriggerTick}/${lynx.traceSettledTerminalTick}.</li><li>Download each complete TWS and follow its digest to the checked replay certificate and native/TypeScript report.</li><li>Retain the full-input/manual-assisted donor disclosure when judging the result.</li></ol><div class="notice"><strong>This dossier is not donor-blind.</strong> Donor availability is paired, exposure is full-input, and construction is manual-assisted. Generated replay bytes were not copied from or read from donor replay bytes; that byte-provenance fact does not change the exposure label.</div></div></details><details class="evidence-drawer deep-review" id="plan-graph"><summary>Terminal-first plan graph · 29 / 29 selected route events</summary><div class="evidence-drawer__body"><p>Direct resource prerequisites and simple chronological predecessor links are displayed separately. Chronology is never promoted into a causal prerequisite.</p>${planGraph(ms)}${planGraph(lynx)}</div></details><details class="evidence-drawer deep-review" id="joins"><summary>Exact same-run joins</summary><div class="evidence-drawer__body"><div class="table-scroll"><table><thead><tr><th>Target</th><th>Subgoal</th><th>Entry boundary</th><th>Stop boundary</th><th>Continuity</th></tr></thead><tbody>${joinRows}</tbody></table></div></div></details><details class="evidence-drawer deep-review" id="provenance"><summary>Provenance and limits</summary><div class="evidence-drawer__body provenance"><p><strong>Checked boundary:</strong> all 32 files listed by the P5 manifest were length- and SHA-256-verified before this dossier was composed. P4B read no P1 or P3 file and ran no engine.</p><p><strong>Scene authority:</strong> each full map uses boundary 00’s exact full-map render. Each segment uses the checked route slice and its exact starting scene; exact boundary stacks remain literal behind disclosure.</p><p><strong>Evidence discipline:</strong> the full 162-step polyline is plan intent. Only captured start/end scenes carry observed-witness basis. Static regions are memberships, and overlays do not establish causality.</p><p><strong>Excluded scope:</strong> Key Pyramid declares no wiring, transport, or forced-surface overlays. Renderer support for those classes is tested by synthetic canaries elsewhere and is not claimed on this level.</p><p><a href="../../../data/p5/manifest.json">Exact P5 manifest</a> · <a href="../../../data/p5/review.md">P5 review handoff</a> · <a href="../../../data/p5/corpus-case.v1.json">Corpus case</a></p></div></details></main><footer class="site-footer"><div class="shell">Static-first CCSolver evidence dossier · Human review remains unreviewed · No tile or causal relationship is inferred by this page.</div></footer></body></html>`;
}
