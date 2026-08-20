export type P6bP7aCanaryPageEntry = {
  readonly title: string;
  readonly relationship: string;
  readonly confidence: "high" | "medium" | "low";
  readonly source: "synthetic" | "corpus";
  readonly reviewStatus: "unreviewed" | "reviewed";
  readonly unresolvedGaps: readonly string[];
};

export type P6bP7aTacticPageEntry = {
  readonly order: number;
  readonly kind: "Reach" | "Collect" | "Unlock" | "WaitUntil";
  readonly title: string;
  readonly decisionCount: number;
  readonly nativeTicks: number;
  readonly result: "succeeded";
};

export type P6bP7aTargetPageEntry = {
  readonly target: "ms" | "lynx";
  readonly label: "MS" | "Lynx";
  readonly mapSvg: string;
  readonly tactics: readonly P6bP7aTacticPageEntry[];
  readonly totalDecisions: number;
  readonly totalNativeTicks: number;
  readonly terminalNativeTick: number;
  readonly replayCertified: true;
  readonly checkpointRestoreVerified: true;
  readonly failureRepair: {
    readonly injectedAtDecision: number;
    readonly injectedDirection: string;
    readonly failure: string;
    readonly retainedPrefixDecisions: number;
    readonly replacedSuffixDecisions: number;
    readonly repairedSuffixDecisions: number;
    readonly result: "won";
  };
  readonly exhaustion: {
    readonly code: string;
    readonly attemptedBranches: number;
    readonly advanceCalls: number;
    readonly repeatedExactly: true;
    readonly firstUnmet: string;
  };
};

export type P6bP7aReviewPageModel = {
  readonly title: string;
  readonly fixtureTitle: string;
  readonly fixtureRows: readonly string[];
  readonly canaries: readonly P6bP7aCanaryPageEntry[];
  readonly targets: readonly [P6bP7aTargetPageEntry, P6bP7aTargetPageEntry];
};

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function humanWords(value: string): string {
  return value.replaceAll("-", " ");
}

function humanRelationship(value: string): string {
  return value === "alternative-branches-proven-rejoin"
    ? "Alternative branches with a proven semantic gameplay rejoin"
    : humanWords(value);
}

function planCards(tactics: readonly P6bP7aTacticPageEntry[]): string {
  return tactics.map((tactic) => `
    <li class="plan-card">
      <span class="plan-order">${tactic.order + 1}</span>
      <div>
        <span class="eyebrow">${escapeHtml(tactic.kind)}</span>
        <strong>${escapeHtml(tactic.title)}</strong>
        <small>${tactic.decisionCount} decision${tactic.decisionCount === 1 ? "" : "s"} · ${tactic.nativeTicks} native tick${tactic.nativeTicks === 1 ? "" : "s"}</small>
      </div>
    </li>`).join("");
}

function targetPanel(target: P6bP7aTargetPageEntry): string {
  const repair = target.failureRepair;
  return `
  <section class="target-panel" id="target-${target.target}" role="tabpanel" aria-labelledby="tab-${target.target}">
    <div class="target-summary">
      <div>
        <p class="eyebrow">${target.label} realization</p>
        <h2>One semantic recipe, engine-native timing</h2>
        <p>The controller chose each direction from the current engine observation. It did not receive a full input stream.</p>
      </div>
      <dl class="metrics">
        <div><dt>Decisions</dt><dd>${target.totalDecisions}</dd></div>
        <div><dt>Native ticks</dt><dd>${target.totalNativeTicks}</dd></div>
        <div><dt>Fresh replay</dt><dd>Passed</dd></div>
        <div><dt>Restore</dt><dd>Exact</dd></div>
      </dl>
    </div>

    <figure class="level-map">
      ${target.mapSvg}
      <figcaption>Authentic ${target.label} game artwork. Numbered marks show the sequence of tiles visited; waits and non-moving requests are omitted.</figcaption>
    </figure>

    <ol class="plan-flow" aria-label="Executed semantic tactics">
${planCards(target.tactics)}
    </ol>

    <details class="deep-dive">
      <summary>See the injected failure and repaired suffix</summary>
      <div class="repair-grid">
        <article>
          <p class="eyebrow">Injected decision ${repair.injectedAtDecision + 1}</p>
          <h3>${escapeHtml(humanWords(repair.injectedDirection))}</h3>
          <p>${escapeHtml(repair.failure)}</p>
        </article>
        <article>
          <p class="eyebrow">Replanned join</p>
          <h3>${repair.result === "won" ? "Recovered and won" : "Repair failed"}</h3>
          <p>${repair.retainedPrefixDecisions} prefix decisions stayed untouched. ${repair.replacedSuffixDecisions} old suffix decisions were replaced by ${repair.repairedSuffixDecisions} newly evaluated decisions.</p>
        </article>
      </div>
    </details>

    <details class="deep-dive">
      <summary>See the bounded exhaustion proof</summary>
      <div class="repair-grid">
        <article>
          <p class="eyebrow">Bound reached</p>
          <h3>${escapeHtml(humanWords(target.exhaustion.code))}</h3>
          <p>${escapeHtml(target.exhaustion.firstUnmet)}</p>
        </article>
        <article>
          <p class="eyebrow">Determinism</p>
          <h3>Repeated exactly</h3>
          <p>The same bounded attempt produced the same diagnostic twice: ${target.exhaustion.attemptedBranches} branches and ${target.exhaustion.advanceCalls} engine advances.</p>
        </article>
      </div>
    </details>

    <details class="deep-dive">
      <summary>Exact proof and machine-readable downloads</summary>
      <p>The selected requests were applied again from canonical initialization in a fresh replay-owned run. The same terminal outcome was independently observed at native tick ${target.terminalNativeTick}. Checkpoint restore was also verified before suffix repair.</p>
      <ul>
        <li><a href="${target.target}/tactic-realization.json">Download ${target.label} tactic realization</a></li>
        <li><a href="${target.target}/replay-certificate.json">Download ${target.label} replay certificate</a></li>
      </ul>
    </details>
  </section>`;
}

function canaryCards(canaries: readonly P6bP7aCanaryPageEntry[]): string {
  return canaries.map((canary) => `
    <article class="canary-card">
      <span class="confidence confidence--${canary.confidence}">${escapeHtml(canary.confidence)} confidence</span>
      <h3>${escapeHtml(canary.title)}</h3>
      <p>${escapeHtml(humanRelationship(canary.relationship))}</p>
      <small>${canary.source === "corpus" ? "Real corpus source" : "Bounded synthetic fixture"} · ${escapeHtml(humanWords(canary.reviewStatus))}</small>
      ${canary.unresolvedGaps.length === 0 ? "" : `<details><summary>Unresolved gaps</summary><ul>${canary.unresolvedGaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul></details>`}
    </article>`).join("");
}

export function renderP6bP7aReviewPage(model: P6bP7aReviewPageModel): string {
  if (
    model.targets.length !== 2
    || model.targets[0].target !== "ms"
    || model.targets[1].target !== "lynx"
    || model.canaries.length < 4
  ) {
    throw new Error("P6B/P7A review page requires ordered MS/Lynx evidence and all portfolio shapes");
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(model.title)}</title>
  <style>
    :root{color-scheme:light;--ink:#17202a;--muted:#5a6570;--paper:#f7f3e9;--card:#fffdf7;--line:#d8d0c0;--violet:#5636a5;--mint:#dff4e8;--amber:#ffe8a3}
    *{box-sizing:border-box}
    html{background:var(--paper);color:var(--ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:17px;line-height:1.5}
    body{margin:0;padding:clamp(1rem,2.5vw,2.5rem)}
    .shell{width:100%;max-width:none;margin:0}
    h1,h2,h3,p{margin-top:0} h1{font-size:clamp(2.1rem,5vw,5.4rem);line-height:.98;letter-spacing:-.045em;max-width:16ch;margin-bottom:1rem} h2{font-size:clamp(1.45rem,2.4vw,2.5rem);line-height:1.08} h3{font-size:1.05rem;margin-bottom:.35rem}
    a{color:var(--violet);font-weight:700}
    .eyebrow{display:block;margin:0 0 .35rem;text-transform:uppercase;letter-spacing:.12em;font-size:.75rem;font-weight:800;color:var(--violet)}
    .hero{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(18rem,.6fr);gap:clamp(1.5rem,4vw,5rem);align-items:end;border-bottom:2px solid var(--ink);padding-bottom:clamp(1.5rem,3vw,3rem)}
    .hero p{max-width:62ch;font-size:clamp(1rem,1.35vw,1.25rem);color:var(--muted)}
    .scope{background:var(--ink);color:white;border-radius:1rem;padding:1.1rem 1.25rem}.scope strong{display:block;font-size:1.1rem}.scope small{color:#cbd3dc}
    .tabs{display:flex;gap:.5rem;margin:1.5rem 0 1rem;border-bottom:1px solid var(--line)}
    .tabs button{appearance:none;border:0;border-bottom:4px solid transparent;background:transparent;color:var(--muted);font:inherit;font-weight:800;padding:.75rem 1.25rem;cursor:pointer}.tabs button[aria-selected="true"]{border-color:var(--violet);color:var(--ink)}.tabs button:focus-visible{outline:3px solid #2d7ff9;outline-offset:2px}
    .target-panel{min-width:0}.target-summary{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(24rem,.75fr);gap:2rem;align-items:start}.target-summary>div>p:last-child{color:var(--muted);max-width:68ch}
    .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.6rem;margin:0}.metrics div{background:var(--card);border:1px solid var(--line);border-radius:.8rem;padding:.75rem}.metrics dt{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.metrics dd{margin:0;font-size:1.25rem;font-weight:850}
    .level-map{margin:1.5rem 0;background:#111820;border-radius:1rem;padding:clamp(.65rem,1.5vw,1.2rem);overflow:hidden}.level-map svg{display:block;width:100%;min-width:0;height:auto}.level-map figcaption{color:#e7ecf2;margin-top:.65rem;font-size:.88rem}
    .plan-flow{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:.75rem;padding:0;margin:1.25rem 0}.plan-card{display:grid;grid-template-columns:2.2rem minmax(0,1fr);gap:.65rem;background:var(--card);border:1px solid var(--line);border-radius:.9rem;padding:.9rem}.plan-card strong,.plan-card small{display:block}.plan-card small{color:var(--muted);margin-top:.35rem}.plan-order{display:grid;place-items:center;width:2rem;height:2rem;border-radius:50%;background:var(--violet);color:white;font-weight:850}
    .deep-dive{border-top:1px solid var(--line);padding:.9rem 0}.deep-dive summary{cursor:pointer;font-weight:800}.deep-dive>p,.deep-dive>ul,.repair-grid{margin:1rem 0 0}.repair-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.repair-grid article{background:var(--card);border:1px solid var(--line);border-radius:.8rem;padding:1rem}
    .portfolio{border-top:2px solid var(--ink);margin-top:2.5rem;padding-top:2rem}.portfolio-header{display:flex;justify-content:space-between;gap:2rem;align-items:end}.portfolio-header p{max-width:70ch;color:var(--muted)}.canary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:.75rem}.canary-card{background:var(--card);border:1px solid var(--line);border-radius:.9rem;padding:1rem}.canary-card small{color:var(--muted)}.confidence{display:inline-block;border-radius:999px;padding:.2rem .55rem;margin-bottom:.7rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.confidence--high{background:var(--mint)}.confidence--medium{background:var(--amber)}.confidence--low{background:#f4dfe3}
    footer{border-top:1px solid var(--line);margin-top:2rem;padding-top:1rem;color:var(--muted);font-size:.9rem}
    [hidden]{display:none!important}
    @media(max-width:820px){.hero,.target-summary{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.repair-grid{grid-template-columns:1fr}.portfolio-header{display:block}}
  </style>
</head>
<body>
<main class="shell">
  <header class="hero">
    <div>
      <p class="eyebrow">P6B portfolio canaries · P7A tactic realization</p>
      <h1>${escapeHtml(model.title)}</h1>
      <p>A bounded solver constructed a route from semantic intent, evaluated choices through exact engine checkpoints, recovered from a deliberately bad decision, and certified the selected requests in a fresh run.</p>
    </div>
    <aside class="scope"><strong>${escapeHtml(model.fixtureTitle)}</strong><small>${escapeHtml(model.fixtureRows.join(" / "))} · standard CC1 tiles only · donor input unavailable</small></aside>
  </header>

  <nav class="tabs" role="tablist" aria-label="Ruleset realization">
    <button id="tab-ms" role="tab" aria-controls="target-ms" aria-selected="true" tabindex="0">MS</button>
    <button id="tab-lynx" role="tab" aria-controls="target-lynx" aria-selected="false" tabindex="-1">Lynx</button>
  </nav>
${targetPanel(model.targets[0])}
${targetPanel(model.targets[1])}

  <section class="portfolio">
    <div class="portfolio-header">
      <div><p class="eyebrow">Bounded classification canaries</p><h2>When “same plan” is—and is not—honest</h2></div>
      <p>These cases test four distinct relationships. Every classification remains a proposal, even after review; evidence gaps stay visible instead of being promoted into proof.</p>
    </div>
    <div class="canary-grid">${canaryCards(model.canaries)}</div>
    <details class="deep-dive"><summary>Download the exact portfolio-canary artifact</summary><p><a href="portfolio-canaries.json">Download portfolio-canaries.json</a>. Machine identities and content digests remain in the artifact, not in the primary human surface.</p></details>
  </section>
  <footer>This unlisted development dossier is not linked from the main Tile World page. Synthetic execution evidence and real-corpus classification evidence are labeled separately.</footer>
</main>
<script>
(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const activate = (tab, focus = true) => {
    for (const candidate of tabs) {
      const selected = candidate === tab;
      candidate.setAttribute('aria-selected', String(selected));
      candidate.tabIndex = selected ? 0 : -1;
      document.getElementById(candidate.getAttribute('aria-controls')).hidden = !selected;
    }
    if (focus) tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      activate(tabs[(index + offset + tabs.length) % tabs.length]);
    });
  });
  activate(tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || tabs[0], false);
})();
</script>
</body>
</html>\n`;
}
