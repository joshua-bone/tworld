import type { VerifiedP5DossierInput, VerifiedP5Target } from "./checkedP5DossierInput";
import { exactBoundaryStack } from "./p4bDossierVisuals";

type JsonRecord = Record<string, any>;

export const P4B_DOSSIER_CSS = `:root{color-scheme:light dark;--paper:#f7f4ec;--card:#fffdf8;--ink:#17202a;--muted:#52616b;--line:#c8c2b7;--accent:#174f78;--evidence:#006d5b;--warning:#8a4b08;--shadow:0 10px 30px rgba(23,32,42,.08)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--accent);text-underline-offset:.16em}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #d1495b;outline-offset:3px}.shell{width:min(100% - 2rem,94rem);margin-inline:auto}.site-header{padding:2.5rem 0 1.5rem;border-bottom:1px solid var(--line)}.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}h1,h2,h3,h4{line-height:1.15;text-wrap:balance}h1{max-width:18ch;font-size:clamp(2.2rem,6vw,5rem);margin:.35rem 0}h2{font-size:clamp(1.65rem,3vw,2.6rem);margin-top:3.5rem}h3{font-size:1.35rem}.lede{max-width:72ch;font-size:1.12rem}.badge-row{display:flex;flex-wrap:wrap;gap:.6rem;margin:1.2rem 0}.badge{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;padding:.32rem .72rem;background:var(--card);font-size:.84rem;font-weight:750}.badge--unreviewed{border-color:#ba6b18;color:#6e3a04;background:#fff4df}.notice{max-width:78ch;border-left:5px solid var(--warning);background:var(--card);padding:1rem 1.2rem;box-shadow:var(--shadow)}.summary-grid,.target-grid,.download-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));gap:1rem}.summary-card,.target-card,.download-card,.subgoal-capsule,.graph-card{background:var(--card);border:1px solid var(--line);border-radius:.8rem;padding:1rem;box-shadow:var(--shadow)}.metric{font-size:2rem;font-weight:850}.metric-label{color:var(--muted)}.controls{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:.8rem 1.25rem;border-block:1px solid var(--line);background:color-mix(in srgb,var(--paper) 94%,transparent);backdrop-filter:blur(10px);padding:.8rem 1rem;margin:2rem 0}.controls label{display:inline-flex;align-items:center;gap:.4rem;font-size:.9rem;font-weight:700}.map-frame{overflow:auto;max-height:56rem;background:#fff;border:1px solid var(--line);border-radius:.7rem;padding:.5rem}.whole-map{margin-block:1.4rem}.whole-map__svg{display:block;width:100%;height:auto;max-width:none;transform-origin:top left}.map-caveat{font-size:.92rem;color:var(--muted);max-width:78ch}.targets-nav{display:flex;flex-wrap:wrap;gap:.75rem}.targets-nav a{font-weight:750}.timing{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.timing div{border-left:4px solid var(--evidence);padding:.4rem .8rem}.timing strong{display:block;font-size:1.35rem}.subgoals{display:grid;gap:1.25rem}.subgoal-capsule{padding:1.25rem}.subgoal-heading{display:flex;gap:.8rem;align-items:baseline}.subgoal-number{display:grid;place-items:center;min-width:2.2rem;height:2.2rem;border-radius:999px;background:var(--accent);color:white;font-weight:850}.panel-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.boundary-panel{margin:0;border:1px solid var(--line);border-radius:.6rem;overflow:hidden;background:#fff}.boundary-panel img{display:block;width:100%;height:auto}.boundary-panel figcaption{padding:.8rem;color:#17202a;background:#fffdf8}.boundary-panel dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.25rem .7rem;margin:.5rem 0;font-size:.82rem}.boundary-panel dt{font-weight:800}.boundary-panel dd{margin:0;overflow-wrap:anywhere}.stack-literal{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.76rem}.join-proof{border-top:1px dashed var(--line);margin-top:1rem;padding-top:1rem}.digest{font: .78rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.events{font-size:.9rem}.plan-layout{display:grid;grid-template-columns:minmax(17rem,.8fr) minmax(24rem,1.2fr);gap:1rem}.plan-layout>*{min-width:0}.plan-graph{min-width:0;display:grid;gap:.6rem}.plan-node{min-width:0;overflow-wrap:anywhere;position:relative;border-left:5px solid #6f2dbd;background:var(--card);padding:.75rem 1rem;border-radius:.35rem}.plan-node+.plan-node:before{content:"terminal-first trace";position:absolute;top:-.72rem;left:1rem;background:var(--paper);padding:0 .3rem;font-size:.64rem;color:var(--muted)}.prerequisite{color:var(--evidence);font-weight:700}.chronology{color:var(--muted);font-style:italic}table{width:100%;border-collapse:collapse;font-size:.86rem}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:.55rem}.table-scroll{overflow:auto}.provenance{border:1px solid var(--line);border-radius:.7rem;background:var(--card);padding:1rem}.review-checkpoints li{margin:.6rem 0}.site-footer{margin-top:4rem;padding:2rem 0 4rem;border-top:1px solid var(--line);color:var(--muted)}.js-only{display:none}.js .js-only{display:flex}.overlay[hidden]{display:none!important}@media(max-width:760px){.panel-pair,.plan-layout,.timing{grid-template-columns:1fr}.controls{position:static}.shell{width:min(100% - 1rem,94rem)}h1{font-size:2.3rem}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{animation:none!important;transition:none!important}}@media(prefers-color-scheme:dark){:root{--paper:#111820;--card:#18232c;--ink:#eef3f5;--muted:#b1bec5;--line:#3b4c56;--accent:#8ac7ef;--evidence:#6fd8c4;--warning:#f3b35b;--shadow:none}.badge--unreviewed{color:#ffd699;background:#372615}.map-frame{background:#f7f4ec}.boundary-panel figcaption{color:#17202a}.controls{background:color-mix(in srgb,var(--paper) 94%,transparent)}}`;

export const P4B_DOSSIER_JS = `document.documentElement.classList.add("js");for(const input of document.querySelectorAll("[data-overlay-toggle]")){input.addEventListener("change",()=>{const kinds=(input.getAttribute("data-overlay-toggle")||"").split(",");for(const map of document.querySelectorAll(".whole-map")){for(const kind of kinds){for(const overlay of map.querySelectorAll(".overlay--"+kind)){overlay.toggleAttribute("hidden",!input.checked)}}}})}for(const input of document.querySelectorAll("[data-map-zoom]")){input.addEventListener("input",()=>{const value=Number(input.value);const target=document.getElementById(input.getAttribute("data-map-zoom")||"");if(target instanceof HTMLElement&&Number.isFinite(value)){target.style.width=value+"%"}})}`;

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

function boundaryDetail(
  target: VerifiedP5Target,
  boundaryOrder: number,
  panelAsset: string,
  role: "Starting state" | "Ending state",
): string {
  const { file, document } = target.boundaries[boundaryOrder]!;
  const targetLabel = target.target === "ms" ? "MS" : "Lynx";
  return `<figure class="boundary-panel"><img src="../../../assets/${escapeHtml(panelAsset)}" loading="lazy" alt="${escapeHtml(`${targetLabel} ${role.toLowerCase()} boundary ${boundaryOrder}, exact five-by-five-or-edge-clipped semantic crop at coordinate (${document.coordinate.x},${document.coordinate.y},${document.coordinate.z})`)}"><figcaption><strong>${role} · boundary ${String(boundaryOrder).padStart(2, "0")}</strong><dl><dt>Native tick</dt><dd>${document.nativeTick}</dd><dt>Coordinate</dt><dd>(${document.coordinate.x}, ${document.coordinate.y}, ${document.coordinate.z})</dd><dt>Chips remain</dt><dd>${document.remainingChips}</dd><dt>Terminal</dt><dd>${escapeHtml(document.terminalKind)}</dd><dt>Fingerprint</dt><dd class="digest" title="${escapeHtml(document.exactFingerprint)}">${escapeHtml(shortDigest(document.exactFingerprint))}</dd><dt>Boundary bytes</dt><dd><a class="digest" href="${escapeHtml(dataHref(file.path))}" title="${escapeHtml(file.content.digest)}">${escapeHtml(shortDigest(file.content.digest))}</a></dd><dt>Scene digest</dt><dd class="digest" title="${escapeHtml(document.renderContent.digest)}">${escapeHtml(shortDigest(document.renderContent.digest))}</dd><dt>Exact cell stack</dt><dd class="stack-literal">${escapeHtml(exactBoundaryStack(target, boundaryOrder))}</dd></dl></figcaption></figure>`;
}

function subgoalCapsules(
  target: VerifiedP5Target,
  panelAssets: ReadonlyMap<string, string>,
): string {
  return target.witness.subgoals.map((subgoal: JsonRecord, index: number) => {
    const startOrder = subgoal.starting.boundaryOrder;
    const endOrder = subgoal.ending.boundaryOrder;
    const startAsset = panelAssets.get(`${target.target}:${startOrder}`);
    const endAsset = panelAssets.get(`${target.target}:${endOrder}`);
    if (startAsset === undefined || endAsset === undefined) throw new Error("P4B boundary panel asset missing");
    const events = subgoal.eventOrders.map((eventOrder: number) => target.route.events[eventOrder]);
    return `<article class="subgoal-capsule" id="${escapeHtml(`${target.target}-subgoal-${index + 1}`)}"><div class="subgoal-heading"><span class="subgoal-number">${index + 1}</span><h4>${escapeHtml(subgoal.title)}</h4></div><p>${escapeHtml(subgoal.description)}</p><p class="events"><strong>Checked route events (plan model, not a causal runtime journal):</strong> ${events.map((event: JsonRecord) => escapeHtml(`#${event.eventOrder} ${event.kind} ${event.semanticType} at (${event.coordinate.x},${event.coordinate.y})`)).join("; ")}</p><div class="panel-pair">${boundaryDetail(target, startOrder, startAsset, "Starting state")}${boundaryDetail(target, endOrder, endAsset, "Ending state")}</div><div class="join-proof"><strong>Exact same-run join:</strong> boundary ${startOrder} <span aria-hidden="true">→</span> boundary ${endOrder}; step orders ${subgoal.firstStepOrder}–${subgoal.lastStepOrder}.<div class="digest">entry ${escapeHtml(subgoal.continuity.entryExactFingerprint)}<br>stop ${escapeHtml(subgoal.continuity.stopExactFingerprint)}</div></div></article>`;
  }).join("");
}

function targetSection(
  target: VerifiedP5Target,
  fullMapSvg: string,
  fullMapAsset: string,
  panelAssets: ReadonlyMap<string, string>,
  twsDownload: string,
): string {
  const targetLabel = target.target === "ms" ? "MS" : "Lynx";
  const triggerTick = target.terminalTriggerTick;
  const settledTick = target.traceSettledTerminalTick;
  const embeddedSvg = fullMapSvg.replace("<svg ", `<svg class="whole-map__svg" `);
  return `<section id="target-${target.target}" aria-labelledby="target-${target.target}-title"><p class="eyebrow">Ruleset target</p><h2 id="target-${target.target}-title">${targetLabel}</h2><div class="timing"><div><span>${targetLabel} trigger/settled tick</span><strong>${triggerTick} / ${settledTick}</strong></div><div><span>Certified route / captured scenes</span><strong>162 steps / 7</strong></div></div><p><strong>Candidate plan authority:</strong> <a href="${escapeHtml(dataHref(target.files.expandedPlan.path))}">expanded-plan root</a> → <a href="${escapeHtml(dataHref(target.files.plan.path))}">planning packet</a> → <a href="${escapeHtml(dataHref(target.files.route.path))}">selected route intent</a>. <strong>Solved-current outcome:</strong> established separately by the checked witness and replay certification below.</p><p class="map-caveat">The purple 162-step route is <strong>plan intent</strong>. Observed-witness evidence is limited to exact captured boundary endpoints. Region shading is checked static topology, not a claim that every runtime traversal is open. No tile or causal relationship is inferred by this page.</p><div class="whole-map" id="whole-map-${target.target}"><div class="map-frame">${embeddedSvg}</div><p><a href="../../../assets/${escapeHtml(fullMapAsset)}">Open standalone full-map SVG</a> · <a href="${escapeHtml(dataHref(target.files.staticOverlay.path))}">Static overlay JSON</a> · <a href="${escapeHtml(dataHref(target.files.route.path))}">Route JSON</a></p></div><h3>Six continuous subgoal capsules</h3><div class="subgoals">${subgoalCapsules(target, panelAssets)}</div><h3>Exact proof downloads</h3><div class="download-grid"><div class="download-card"><strong>Complete TWS</strong><p><a download href="../../../downloads/${escapeHtml(twsDownload)}">Download exact ${targetLabel} TWS</a></p><p class="digest">${escapeHtml(target.files.tws.content.digest)} · ${target.files.tws.content.byteLength} bytes</p></div><div class="download-card"><strong>Replay certificate</strong><p><a href="${escapeHtml(dataHref(target.files.certificate.path))}">Certificate bundle</a></p><p class="digest">${escapeHtml(target.files.certificate.content.digest)}</p></div><div class="download-card"><strong>Native/TypeScript report</strong><p><a href="${escapeHtml(dataHref(target.files.certification.path))}">Certification report</a></p><p>Exact trace parity; isolated native save directory; exact input bytes read.</p></div></div></section>`;
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
    return targetSection(target, fullMapSvg, fullMapAsset, input.panelAssets, twsDownload);
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark"><title>Key Pyramid · verified whole-level dossier</title><link rel="stylesheet" href="../../../assets/${escapeHtml(input.cssAsset)}"><script>document.documentElement.classList.add("js")</script><script defer src="../../../assets/${escapeHtml(input.jsAsset)}"></script></head><body><header class="site-header"><div class="shell"><p class="eyebrow">CCSolver · CCLP1 level 001</p><h1>Key Pyramid · verified whole-level dossier</h1><p class="lede">One uninterrupted 162-step solution is certified for each ruleset. This page is the bounded human-review surface for the checked proof—not a gameplay page.</p><div class="badge-row"><span class="badge badge--unreviewed">Human review: unreviewed</span><span class="badge">Machine outcome: solved-current</span><span class="badge">MS + Lynx</span></div><div class="notice"><strong>This dossier is not donor-blind.</strong> Donor availability is paired, exposure is full-input, and construction is manual-assisted. Generated replay bytes were not copied from or read from donor replay bytes; that byte-provenance fact does not change the exposure label.</div><p><a href="../../../">Back to dossier index</a></p></div></header><main class="shell"><section aria-labelledby="checkpoint-title"><h2 id="checkpoint-title">What can be human-checked here</h2><div class="summary-grid"><div class="summary-card"><div class="metric">2</div><div class="metric-label">literal 32×32 whole-map views</div></div><div class="summary-card"><div class="metric">12</div><div class="metric-label">target-specific subgoal capsules</div></div><div class="summary-card"><div class="metric">24</div><div class="metric-label">exact start/end panel instances</div></div><div class="summary-card"><div class="metric">14</div><div class="metric-label">unique checked boundary scenes</div></div></div><ol class="review-checkpoints"><li>Compare each target’s initial full-map scene with its evidence-labeled static region, source, gate, route-intent, and boundary overlays.</li><li>Walk all six adjacent start/end pairs per target; each ending boundary is byte-identical support for the next starting boundary.</li><li>Check exact cell stacks, remaining-chip counts, resource/door route events, zero-chip socket crossing, and the won exit boundary.</li><li>Confirm MS terminal trigger/settlement is ${ms.terminalTriggerTick}/${ms.traceSettledTerminalTick}; Lynx is ${lynx.terminalTriggerTick}/${lynx.traceSettledTerminalTick}.</li><li>Download each complete TWS and follow its digest to the checked replay certificate and native/TypeScript report.</li><li>Retain the full-input/manual-assisted donor disclosure when judging the result.</li></ol></section><div class="controls js-only" aria-label="Optional map display controls"><strong>Map overlays</strong><label><input type="checkbox" checked data-overlay-toggle="region">Regions</label><label><input type="checkbox" checked data-overlay-toggle="resource-source,resource-gate">Resources &amp; gates</label><label><input type="checkbox" checked data-overlay-toggle="plan-intent-route">Plan route</label><label><input type="checkbox" checked data-overlay-toggle="subgoal-span">Boundary markers</label><label>MS zoom <input type="range" min="75" max="180" value="100" data-map-zoom="whole-map-ms"></label><label>Lynx zoom <input type="range" min="75" max="180" value="100" data-map-zoom="whole-map-lynx"></label></div><noscript>This complete dossier does not require JavaScript.</noscript><nav class="targets-nav" aria-label="Ruleset targets"><a href="#target-ms">Jump to MS</a><a href="#target-lynx">Jump to Lynx</a><a href="#plan-graph">Jump to plan graph</a><a href="#provenance">Jump to provenance</a></nav>${targetHtml}<section id="plan-graph" aria-labelledby="plan-title"><p class="eyebrow">Derived from checked plan bytes</p><h2 id="plan-title">Terminal-first plan graph</h2><p>Direct resource prerequisites and simple chronological predecessor links are displayed separately. Chronology is never promoted into a causal prerequisite.</p>${planGraph(ms)}${planGraph(lynx)}</section><section id="joins" aria-labelledby="joins-title"><h2 id="joins-title">Exact same-run joins</h2><div class="table-scroll"><table><thead><tr><th>Target</th><th>Subgoal</th><th>Entry boundary</th><th>Stop boundary</th><th>Continuity</th></tr></thead><tbody>${input.source.targets.flatMap((target) => target.witness.subgoals.map((subgoal: JsonRecord) => `<tr><td>${target.target.toUpperCase()}</td><td>${escapeHtml(subgoal.title)}</td><td>${subgoal.starting.boundaryOrder}<br><span class="digest">${escapeHtml(shortDigest(subgoal.continuity.entryExactFingerprint))}</span></td><td>${subgoal.ending.boundaryOrder}<br><span class="digest">${escapeHtml(shortDigest(subgoal.continuity.stopExactFingerprint))}</span></td><td>${escapeHtml(subgoal.continuity.state)}</td></tr>`)).join("")}</tbody></table></div></section><section id="provenance" aria-labelledby="provenance-title"><h2 id="provenance-title">Provenance and limits</h2><div class="provenance"><p><strong>Checked boundary:</strong> all 32 files listed by the P5 manifest were length- and SHA-256-verified before this dossier was composed. P4B read no P1 or P3 file and ran no engine.</p><p><strong>Scene authority:</strong> each full map uses boundary 00’s exact full-map render. Each local panel uses the exact checked render at that boundary. Semantic stacks remain literal.</p><p><strong>Evidence discipline:</strong> the full 162-step polyline is plan intent. Only captured start/end scenes carry observed-witness basis. Static regions are memberships, and overlays do not establish causality.</p><p><strong>Excluded scope:</strong> Key Pyramid declares no wiring, transport, or forced-surface overlays. Renderer support for those classes is tested by synthetic canaries elsewhere and is not claimed on this level.</p><p><a href="../../../data/p5/manifest.json">Exact P5 manifest</a> · <a href="../../../data/p5/review.md">P5 review handoff</a> · <a href="../../../data/p5/corpus-case.v1.json">Corpus case</a></p></div></section></main><footer class="site-footer"><div class="shell">Static-first CCSolver evidence dossier · Human review remains unreviewed · No tile or causal relationship is inferred by this page.</div></footer></body></html>`;
}
