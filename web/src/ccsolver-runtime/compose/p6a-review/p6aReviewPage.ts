export type P6aReviewTargetMilestone = {
  readonly nativeTick: number;
  readonly sequence: number;
  readonly attributed: boolean;
};

export type P6aReviewMilestone = {
  readonly milestoneOrder: number;
  readonly label: string;
  readonly kind: string;
  readonly coordinate: { readonly x: number; readonly y: number; readonly z: number };
  readonly ms: P6aReviewTargetMilestone;
  readonly lynx: P6aReviewTargetMilestone;
};

export type P6aReviewSubgoal = {
  readonly subgoalOrder: number;
  readonly title: string;
  readonly description: string;
  readonly milestones: readonly P6aReviewMilestone[];
};

export type P6aReviewPageModel = {
  readonly subgoals: readonly P6aReviewSubgoal[];
  readonly milestoneCount: number;
  readonly matchedHardAnchors: number;
  readonly nativeTimingDifferences: number;
  readonly attributionGapCount: number;
  readonly alignmentStatus: "aligned" | "divergent";
  readonly strategyLabel: string;
  readonly strategyResolution: string;
  readonly msEventCount: number;
  readonly lynxEventCount: number;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function targetCell(
  label: "MS" | "Lynx",
  milestone: P6aReviewTargetMilestone,
): string {
  return `<div class="tick"><span>${label} tick</span><strong>${milestone.nativeTick}</strong><small>${milestone.attributed ? "command linked" : "attribution gap"}</small></div>`;
}

function milestoneRow(milestone: P6aReviewMilestone): string {
  const coordinate = `column ${milestone.coordinate.x}, row ${milestone.coordinate.y}`;
  return [
    '<li class="milestone">',
    `<div class="milestone-copy"><span class="order">${milestone.milestoneOrder + 1}</span><div><strong>${escapeHtml(milestone.label)}</strong><small>${escapeHtml(coordinate)}</small></div></div>`,
    `<div class="ticks">${targetCell("MS", milestone.ms)}${targetCell("Lynx", milestone.lynx)}</div>`,
    "</li>",
  ].join("");
}

function subgoalSection(subgoal: P6aReviewSubgoal): string {
  const first = subgoal.milestones[0]?.milestoneOrder ?? 0;
  const last = subgoal.milestones.at(-1)?.milestoneOrder ?? first;
  return [
    `<details class="subgoal"${subgoal.subgoalOrder === 0 ? " open" : ""}>`,
    "<summary>",
    `<span class="subgoal-number">${subgoal.subgoalOrder + 1}</span>`,
    `<span><strong>${escapeHtml(subgoal.title)}</strong><small>Milestones ${first + 1}–${last + 1}</small></span>`,
    `<span class="count">${subgoal.milestones.length}</span>`,
    "</summary>",
    `<p>${escapeHtml(subgoal.description)}</p>`,
    `<ol>${subgoal.milestones.map(milestoneRow).join("")}</ol>`,
    "</details>",
  ].join("");
}

const STYLE = `
:root{color-scheme:light;--ink:#14212b;--muted:#5a6973;--paper:#f7f5ef;--panel:#fff;--line:#d8ddd9;--blue:#116a8b;--blue-soft:#e8f5f8;--gold:#9b6414;--gold-soft:#fff5dd;--green:#17643c;--shadow:0 12px 34px rgba(17,35,45,.08)}
*{box-sizing:border-box}html{background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;line-height:1.5}body{margin:0}a{color:var(--blue);text-underline-offset:.16em}.shell{width:100%;margin:0 auto;padding:clamp(1rem,3vw,3rem)}.back{display:inline-flex;align-items:center;gap:.45rem;font-weight:700;text-decoration:none}.back:hover{text-decoration:underline}.hero{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(18rem,.8fr);gap:clamp(1.5rem,4vw,4rem);align-items:end;margin:clamp(2rem,6vw,5rem) 0 2rem;padding-bottom:2rem;border-bottom:1px solid var(--line)}.eyebrow{margin:0 0 .5rem;color:var(--blue);font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{max-width:18ch;margin:0;font-size:clamp(2.4rem,6vw,5.8rem);font-weight:760;letter-spacing:-.055em;line-height:.96}.lede{max-width:62ch;margin:1.25rem 0 0;color:var(--muted);font-size:clamp(1rem,1.6vw,1.28rem)}.proof-note{padding:1.25rem;border:1px solid #bcdce5;border-radius:1rem;background:var(--blue-soft)}.proof-note strong{display:block;margin-bottom:.35rem}.proof-note p{margin:0;color:#315560}.metrics{display:grid;grid-template-columns:repeat(5,minmax(9rem,1fr));gap:.75rem;margin:0 0 2.5rem}.metric{min-height:8rem;padding:1rem;border:1px solid var(--line);border-radius:.9rem;background:var(--panel);box-shadow:var(--shadow)}.metric span{display:block;color:var(--muted);font-size:.76rem;font-weight:750;letter-spacing:.06em;text-transform:uppercase}.metric strong{display:block;margin:.4rem 0 .25rem;font-size:clamp(1.45rem,3vw,2.25rem);line-height:1}.metric small{color:var(--muted)}.section-heading{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.section-heading h2{margin:0;font-size:clamp(1.45rem,2.4vw,2.2rem);letter-spacing:-.025em}.section-heading p{max-width:60ch;margin:0;color:var(--muted)}.subgoals{display:grid;gap:.8rem}.subgoal{border:1px solid var(--line);border-radius:1rem;background:var(--panel);box-shadow:var(--shadow);overflow:hidden}.subgoal summary{display:grid;grid-template-columns:auto 1fr auto;gap:1rem;align-items:center;padding:1.1rem 1.25rem;cursor:pointer;list-style:none}.subgoal summary::-webkit-details-marker{display:none}.subgoal summary:hover{background:#fbfcfa}.subgoal-number{display:grid;width:2rem;height:2rem;place-items:center;border-radius:50%;background:var(--ink);color:#fff;font-weight:800}.subgoal summary strong,.subgoal summary small{display:block}.subgoal summary small{color:var(--muted);font-size:.8rem}.count{min-width:2rem;padding:.2rem .5rem;border-radius:999px;background:var(--gold-soft);color:var(--gold);font-size:.82rem;font-weight:800;text-align:center}.subgoal>p{max-width:76ch;margin:0;padding:0 1.25rem 1rem;color:var(--muted)}ol{margin:0;padding:0;border-top:1px solid var(--line);list-style:none}.milestone{display:grid;grid-template-columns:minmax(15rem,1fr) minmax(18rem,.75fr);gap:1rem;align-items:center;padding:.85rem 1.25rem;border-top:1px solid #edf0ed}.milestone:first-child{border-top:0}.milestone:hover{background:#fcfcf9}.milestone-copy{display:flex;gap:.85rem;align-items:center}.milestone-copy .order{display:grid;flex:0 0 auto;width:2rem;height:2rem;place-items:center;border:1px solid var(--line);border-radius:.55rem;font-variant-numeric:tabular-nums;font-weight:800}.milestone-copy strong,.milestone-copy small{display:block}.milestone-copy small{color:var(--muted)}.ticks{display:grid;grid-template-columns:1fr 1fr;gap:.65rem}.tick{display:grid;grid-template-columns:1fr auto;gap:.1rem .5rem;padding:.55rem .7rem;border-radius:.65rem;background:#f0f3f2;font-variant-numeric:tabular-nums}.tick span{color:var(--muted);font-size:.76rem;font-weight:700;text-transform:uppercase}.tick strong{grid-row:1/3;grid-column:2;font-size:1.25rem}.tick small{color:var(--green);font-size:.72rem}.downloads{margin-top:2rem;padding:1rem 1.25rem;border:1px solid var(--line);border-radius:1rem;background:var(--panel)}.downloads summary{cursor:pointer;font-weight:800}.download-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:.75rem;margin-top:1rem}.download-grid a{padding:.8rem;border:1px solid var(--line);border-radius:.65rem;text-decoration:none}.download-grid a:hover{border-color:var(--blue);background:var(--blue-soft)}footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem;margin-top:3rem;padding-top:1.25rem;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
.subgoal summary{grid-template-columns:auto 1fr auto auto}.subgoal summary:focus-visible{outline:3px solid #5bb3cc;outline-offset:-3px}.subgoal summary:after{content:"+";display:grid;width:1.8rem;height:1.8rem;place-items:center;border:1px solid var(--line);border-radius:50%;font-size:1.15rem;font-weight:800}.subgoal[open] summary:after{content:"−"}
@media(max-width:920px){.hero{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.milestone{grid-template-columns:1fr}}
@media(max-width:560px){.shell{padding:1rem}.metrics{grid-template-columns:1fr 1fr}.metric{min-height:6.5rem}.ticks{grid-template-columns:1fr}.subgoal summary{padding:.9rem}.subgoal>p,.milestone{padding-left:.9rem;padding-right:.9rem}}
`;

export function renderP6aReviewPage(model: P6aReviewPageModel): string {
  const gapCopy = model.attributionGapCount === 0
    ? "Every primary milestone is linked to its route command."
    : `${model.attributionGapCount} primary target event${model.attributionGapCount === 1 ? " is" : "s are"} authoritative but not linked to a route command.`;
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    "<title>Key Pyramid causal alignment · CCSolver</title>",
    `<style>${STYLE}</style></head><body><main class="shell">`,
    '<a class="back" href="../">← Back to the whole-level dossier</a>',
    '<header class="hero"><div><p class="eyebrow">P2B causal journal · P6A semantic alignment</p>',
    "<h1>Key Pyramid causal alignment</h1>",
    `<p class="lede">The same 29 semantic milestones are traced through MS and Lynx. Open any of the 6 subgoals to inspect native target timing without wading through raw event IDs.</p></div>`,
    '<aside class="proof-note"><strong>What this proves</strong><p>Purpose-built native action hooks recorded the realized route. Hard anchors use stable semantic effects and placement authority—not coordinates alone. Different native ticks are preserved instead of normalized away.</p></aside></header>',
    '<section class="metrics" aria-label="Alignment summary">',
    `<div class="metric"><span>Result</span><strong>${escapeHtml(model.alignmentStatus)}</strong><small>cross-ruleset trace</small></div>`,
    `<div class="metric"><span>Milestones</span><strong>${model.milestoneCount}</strong><small>across 6 subgoals</small></div>`,
    `<div class="metric"><span>Hard anchors</span><strong>${model.matchedHardAnchors}</strong><small>semantically matched</small></div>`,
    `<div class="metric"><span>Timing differences</span><strong>${model.nativeTimingDifferences}</strong><small>native ticks retained</small></div>`,
    `<div class="metric"><span>Strategy</span><strong>${escapeHtml(model.strategyLabel)}</strong><small>${escapeHtml(model.strategyResolution)}</small></div>`,
    "</section>",
    '<section aria-labelledby="walk-heading"><div class="section-heading"><div><p class="eyebrow">Walk the causal proof</p><h2 id="walk-heading">Six route subgoals</h2></div>',
    `<p>${escapeHtml(gapCopy)} Each tick card visibly labels command linked or attribution gap.</p></div>`,
    `<div class="subgoals">${model.subgoals.map(subgoalSection).join("")}</div></section>`,
    '<details class="downloads"><summary>Download machine evidence</summary><div class="download-grid">',
    '<a href="alignment.json">Paired alignment JSON</a><a href="portfolio.json">Strategy portfolio JSON</a>',
    '<a href="ms/causal-journal.json">MS causal journal JSON</a><a href="lynx/causal-journal.json">Lynx causal journal JSON</a>',
    '<a href="manifest.json">Checked manifest JSON</a><a href="review.md">Compact review notes</a>',
    "</div></details>",
    `<footer><span>${model.msEventCount} retained MS events · ${model.lynxEventCount} retained Lynx events</span><span>Route construction remains manual-assisted with paired/full-input donor disclosure.</span></footer>`,
    "</main></body></html>\n",
  ].join("");
}
