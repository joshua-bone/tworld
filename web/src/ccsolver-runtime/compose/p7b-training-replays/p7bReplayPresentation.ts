import type {
  P7bLevelReplayPresentation,
  P7bPackLevelPresentation,
  P7bPackPresentation,
  P7bReplayVariantPresentation,
  P7bSemanticSegmentPresentation,
} from "@game-core/api/p7bReplayPresentation";
import {
  assertP7bLevelReplayPresentation,
  findP7bReplayCombination,
  p7bReplayCombinationKey,
} from "@game-core/api/p7bReplayPresentationValidation";

export type {
  P7bAvailableReplayCombination,
  P7bExecutionTargetId,
  P7bExecutionTargetPresentation,
  P7bLevelReplayPresentation,
  P7bPackLevelPresentation,
  P7bPackLevelStatus,
  P7bPackPresentation,
  P7bReplayCombination,
  P7bReplayDecisionProfile,
  P7bReplaySegmentSpan,
  P7bReplaySelection,
  P7bReplayVariantId,
  P7bReplayVariantPresentation,
  P7bSemanticSegmentPresentation,
  P7bUnavailableReplayCombination,
} from "@game-core/api/p7bReplayPresentation";

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function assertSafeHref(href: string, label: string): void {
  if (href.trim() === "" || /^(?:data|javascript|vbscript):/iu.test(href.trim())) {
    throw new Error(`${label} must be a non-executable relative or HTTP URL`);
  }
}

function assertInteger(value: number, label: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer at least ${minimum}`);
  }
}

function orderedSegments(
  variant: P7bReplayVariantPresentation,
): readonly P7bSemanticSegmentPresentation[] {
  return [...variant.segments].sort((left, right) => left.ordinal - right.ordinal);
}

function combinationTable(model: P7bLevelReplayPresentation): string {
  const combinations = new Map(model.combinations.map((combination) => [p7bReplayCombinationKey(combination), combination]));
  const rows = model.variants.flatMap((variant) => model.executionTargets.map((target) => {
    const key = p7bReplayCombinationKey({ executionTarget: target.id, variant: variant.id });
    const combination = combinations.get(key)!;
    if (combination.availability === "unavailable") {
      const status = combination.certificationStatus === "not-attempted"
        ? "Not attempted"
        : combination.certificationStatus === "failed"
          ? "Failed certification"
          : "Unavailable";
      return `<tr data-replay-combination="${escapeHtml(key)}" data-availability="unavailable" data-certification-status="${escapeHtml(combination.certificationStatus)}"><th scope="row">${escapeHtml(variant.label)}</th><td>${escapeHtml(target.label)}</td><td><strong>${status}</strong><br>${escapeHtml(combination.reason)}</td></tr>`;
    }
    const spans = combination.segmentSpans
      .map((span) => {
        const native = `${escapeHtml(span.segmentId)} native ticks ${span.startNativeTick}–${span.endNativeTick}`;
        return span.startDecisionOrdinal === undefined
          ? native
          : `${native}; portable decisions ${span.startDecisionOrdinal}–${span.endDecisionOrdinal}`;
      })
      .join("; ");
    const clockBasis = combination.decisionProfile.clockBasis === "portable-decision"
      ? "Portable decisions"
      : "Native input decisions";
    const certificate = combination.certificationHref === undefined
      ? ""
      : ` · <a href="${escapeHtml(combination.certificationHref)}">certificate</a>`;
    return `<tr data-replay-combination="${escapeHtml(key)}" data-availability="available" data-replay-href="${escapeHtml(combination.replayHref)}"><th scope="row">${escapeHtml(variant.label)}</th><td>${escapeHtml(target.label)}</td><td><strong>Available</strong> · ${escapeHtml(combination.provenanceLabel)}${certificate}<br><small>${escapeHtml(combination.decisionProfile.profileId)} · ${clockBasis} · ${combination.decisionProfile.cadenceHz} Hz · Native execution · ${combination.nativeTickRateHz} Hz<br>Authored decisions: ${combination.authoredDecisionCount} · Executed decisions: ${combination.executedDecisionCount}<br>${spans}</small></td></tr>`;
  }));
  return `<div class="table-scroll"><table><caption>Replay availability and independent native timing</caption><thead><tr><th>Variant</th><th>Execution engine</th><th>Status and provenance</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function replayVariantControls(model: P7bLevelReplayPresentation): string {
  return model.variants.map((variant) => {
    const checked = variant.id === model.initialSelection.variant ? " checked" : "";
    return `<label><input type="radio" name="replay-variant" value="${escapeHtml(variant.id)}"${checked}> <span><strong>${escapeHtml(variant.label)}</strong><small>${escapeHtml(variant.description)}</small></span></label>`;
  }).join("");
}

function executionTargetControls(model: P7bLevelReplayPresentation): string {
  return model.executionTargets.map((target) => {
    const selected = target.id === model.initialSelection.executionTarget ? " selected" : "";
    return `<option value="${escapeHtml(target.id)}"${selected}>${escapeHtml(target.label)}</option>`;
  }).join("");
}

function segmentControls(variant: P7bReplayVariantPresentation): string {
  return orderedSegments(variant).map((segment, index) => {
    const selected = index === 0 ? ' aria-current="step"' : "";
    return `<button type="button" data-segment-id="${escapeHtml(segment.id)}"${selected}><span>${segment.ordinal}</span>${escapeHtml(segment.title)}</button>`;
  }).join("");
}

const PAGE_STYLES = `
:root{color-scheme:light dark;--paper:#f4f0e7;--card:#fffdf8;--ink:#15212b;--muted:#586873;--line:#c9c1b4;--accent:#14567d;--focus:#d1495b}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{width:calc(100% - clamp(1rem,3vw,3rem));max-width:none;margin-inline:auto}a{color:var(--accent)}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--focus);outline-offset:3px}.skip-link{position:absolute;transform:translateY(-200%)}.skip-link:focus{transform:none}.eyebrow{font-size:.75rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}header{border-bottom:1px solid var(--line);padding:1rem 0}h1,h2{line-height:1.15}.player{display:grid;grid-template-columns:minmax(16rem,22rem) minmax(0,1fr);gap:1rem;margin:1rem 0}.player-controls,.player-stage,.matrix{background:var(--card);border:1px solid var(--line);border-radius:.8rem;padding:.8rem}.player-controls fieldset{border:0;padding:0;margin:0 0 1rem}.player-controls legend{font-weight:850;margin-bottom:.45rem}.player-controls fieldset label{display:flex;gap:.45rem;margin:.35rem 0}.player-controls small,.segment-list small,.keyboard-hint,.clock-readout{display:block;color:var(--muted)}.control-row{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;margin:.65rem 0}.control-row button,.control-row select{font:inherit}.player-canvas{display:grid;place-items:center;min-height:min(62vh,38rem);overflow:auto;background:#10171d;border-radius:.6rem;color:#eef3f5}.player-canvas .legacy-canvas-shell{max-width:100%}.player-canvas canvas{display:block;width:min(100%,48rem);height:auto;image-rendering:pixelated}.segment-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.4rem}.segment-list button{text-align:left;padding:.55rem;border:1px solid var(--line);border-radius:.5rem;background:var(--paper);color:var(--ink)}.segment-list button[aria-current="step"]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}.segment-list button span{display:inline-grid;place-items:center;width:1.5rem;height:1.5rem;margin-right:.35rem;border-radius:50%;background:var(--accent);color:#fff}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid var(--line);padding:.5rem;text-align:left;vertical-align:top}.status{min-height:1.5rem}.pack-progress{display:flex;gap:1rem;flex-wrap:wrap}.status--complete{color:#08715f}.status--blocked{color:#8a4b08}@media(max-width:800px){.player{grid-template-columns:1fr}.player-canvas{min-height:24rem}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}
`;

export function renderP7bLevelReplayPage(model: P7bLevelReplayPresentation): string {
  assertP7bLevelReplayPresentation(model);
  const levelLabel = String(model.levelNumber).padStart(3, "0");
  const initialVariant = model.variants.find(({ id }) => id === model.initialSelection.variant)!;
  const firstSegment = orderedSegments(initialVariant)[0]!;
  const segmentGroups = model.variants.map((variant) => (
    `<section data-segment-variant="${escapeHtml(variant.id)}"><h3>${escapeHtml(variant.label)} segments</h3><nav class="segment-list" aria-label="${escapeHtml(variant.label)} semantic replay segments">${segmentControls(variant)}</nav></section>`
  )).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(model.title)} · ${escapeHtml(model.packId.toUpperCase())} replay viewer</title><style>${PAGE_STYLES}</style><script type="module" defer src="${escapeHtml(model.playerModuleHref)}"></script></head><body><a class="skip-link" href="#replay-player">Skip to replay player</a><header><div class="shell"><p class="eyebrow">P7B training replay corpus · ${escapeHtml(model.packId.toUpperCase())} level ${levelLabel}</p><h1>${escapeHtml(model.title)}</h1><p>Inspect each replay variant through its own semantic segments. Replay variant and execution engine are independent choices.</p></div></header><main class="shell"><section class="player" id="replay-player" data-p7b-replay-player data-level-manifest-href="${escapeHtml(model.levelManifestHref)}" data-autoplay="false"><aside class="player-controls"><fieldset data-replay-variant-axis><legend>Replay variant</legend>${replayVariantControls(model)}</fieldset><div><label for="execution-target">Execution engine</label><select id="execution-target" data-execution-target-axis>${executionTargetControls(model)}</select></div><div class="control-row" aria-label="Replay transport"><button type="button" data-player-action="play" aria-label="Play replay segment">Play</button><button type="button" data-player-action="pause" aria-label="Pause replay segment">Pause</button><button type="button" data-player-action="restart" aria-label="Restart replay segment">Restart</button><button type="button" data-player-action="step" aria-label="Advance one native tick">Step</button></div><div><label for="replay-position">Replay position</label><input id="replay-position" type="range" min="0" max="1" value="0" step="1" data-replay-position disabled></div><div><label for="replay-speed">Playback speed</label><select id="replay-speed" data-replay-speed><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></div><p class="status" data-player-status role="status" aria-live="polite">Replay assets load only after you press Play, Step, or Restart.</p></aside><section class="player-stage" aria-labelledby="player-stage-title"><h2 id="player-stage-title">${escapeHtml(firstSegment.title)}</h2><div class="player-canvas" data-replay-canvas role="img" aria-label="Replay board at the selected native tick"><noscript>Interactive replay playback requires JavaScript. The complete availability and provenance table remains below.</noscript></div><div data-variant-segment-groups>${segmentGroups}</div><div class="control-row"><button type="button" data-player-action="previous-segment" aria-label="Previous replay segment">Previous segment</button><button type="button" data-player-action="next-segment" aria-label="Next replay segment">Next segment</button></div></section></section><section class="matrix"><h2>Availability, provenance, and clocks</h2><p>Unavailable combinations stay visible. Each variant owns its semantic segment list; native tick spans remain specific to each execution engine.</p>${combinationTable(model)}<p><a href="${escapeHtml(model.sourceHref)}">View checked level source record</a></p></section></main></body></html>`;
}

function validatePackPresentation(model: P7bPackPresentation): readonly P7bPackLevelPresentation[] {
  assertInteger(model.expectedLevelCount, "P7B expected level count", 1);
  if (model.levels.length !== model.expectedLevelCount) {
    throw new Error(`P7B pack index requires exactly ${model.expectedLevelCount} level rows`);
  }
  const ordered = [...model.levels].sort((left, right) => left.levelNumber - right.levelNumber);
  for (const [index, level] of ordered.entries()) {
    if (level.levelNumber !== index + 1) {
      throw new Error(`P7B pack index must contain level ${index + 1} exactly once`);
    }
    assertSafeHref(level.href, `P7B pack level ${level.levelNumber} href`);
    assertInteger(level.processedTargetCount, `P7B level ${level.levelNumber} processed target count`, 0);
    assertInteger(level.totalTargetCount, `P7B level ${level.levelNumber} total target count`, 1);
    if (level.processedTargetCount > level.totalTargetCount) {
      throw new Error(`P7B level ${level.levelNumber} processed target count exceeds its denominator`);
    }
  }
  return ordered;
}

export function renderP7bPackIndex(model: P7bPackPresentation): string {
  const ordered = validatePackPresentation(model);
  const completeLevels = ordered.filter(({ status }) => status === "complete").length;
  const processedTargets = ordered.reduce((total, level) => total + level.processedTargetCount, 0);
  const totalTargets = ordered.reduce((total, level) => total + level.totalTargetCount, 0);
  const rows = ordered.map((level) => {
    const number = String(level.levelNumber).padStart(3, "0");
    return `<tr data-pack-level="${number}"><td>${number}</td><th scope="row"><a href="${escapeHtml(level.href)}">${escapeHtml(level.title)}</a></th><td class="status--${escapeHtml(level.status)}">${escapeHtml(level.status)}</td><td>${level.processedTargetCount} / ${level.totalTargetCount}</td></tr>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(model.title)}</title><style>${PAGE_STYLES}</style></head><body><header><div class="shell"><p class="eyebrow">P7B training replay corpus</p><h1>${escapeHtml(model.title)}</h1><div class="pack-progress"><strong>${completeLevels} / ${model.expectedLevelCount} levels complete</strong><strong>${processedTargets} / ${totalTargets} target records processed</strong></div></div></header><main class="shell"><div class="table-scroll"><table><caption>All ${model.expectedLevelCount} levels; missing and blocked work remains visible</caption><thead><tr><th>Level</th><th>Title</th><th>Status</th><th>Processed targets</th></tr></thead><tbody>${rows}</tbody></table></div></main></body></html>`;
}

export { findP7bReplayCombination } from "@game-core/api/p7bReplayPresentationValidation";
