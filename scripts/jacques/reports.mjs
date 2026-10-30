import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = join(ROOT, 'web/public/dev/solutions/jacques');
const DAT_SHA256 = 'c10acac13135586a4ce7b45f0427010229c51ac2fc5b6d0631a7036b86a90b6f';
const LEVELS = [186,288,376,379,402,431,527,628,643,660,668,672,675,723,732,756,791,909,910,914,915,920,925,931,932,937,939,945,949,952,955,970,972,974,978,981,982,984];
const labels = { solved: 'Verified replay', impossible: 'Impossibility argument', unresolved: 'Under investigation' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function validateReport(report, replay = {}) {
  assert.ok(Number.isInteger(report.level) && report.title && report.summary, 'Report requires level, title and summary');
  assert.ok(Object.hasOwn(labels, report.status), 'Unknown report status');
  if (report.status === 'impossible') assert.ok(Array.isArray(report.argument) && report.argument.length >= 2, 'Impossibility requires a multi-step argument');
  if (report.status === 'solved') {
    const { certificate, bytes, datSha256 } = replay;
    assert.ok(certificate && bytes, 'Solved report requires a replay certificate and bytes');
    assert.equal(certificate.level.number, report.level, 'Replay certificate level mismatch');
    assert.equal(certificate.datSha256, datSha256, 'Replay certificate DAT mismatch');
    assert.equal(certificate.twsSha256, createHash('sha256').update(bytes).digest('hex'), 'Replay hash mismatch');
    assert.ok(certificate.native.status === 'completed' && certificate.typescript.status === 'completed', 'Both engines must verify completion');
    assert.equal(certificate.native.finalTick, certificate.typescript.finalTick, 'Completion tick mismatch');
    assert.ok(certificate.exactTraceParity && certificate.exactInputBytesRead, 'Replay requires exact trace and byte verification');
  }
  return report;
}

async function filesBelow(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesBelow(join(path, entry.name)) : [join(path, entry.name)]))).flat();
}

const css = `:root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif;background:#101820;color:#e8eef4}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:36px 24px 64px}a{color:#9ccdfb;text-underline-offset:3px}h1{font-size:clamp(28px,4vw,44px);line-height:1.15;margin:16px 0}h2{font-size:23px;margin:32px 0 16px}p,li{line-height:1.65;max-width:85ch}li{margin-bottom:12px}.muted,small{color:#b4c1cc}.kicker{letter-spacing:.12em;text-transform:uppercase;font-size:12px;color:#a6b9ca}.badge{display:inline-block;padding:5px 10px;border-radius:5px;font-size:13px;background:#304253;white-space:nowrap}.solved{background:#194e3d;color:#b4f1d5}.impossible{background:#493c29;color:#f8dab1}.unresolved{background:#303c4a;color:#c8d7e5}.summary{font-size:20px}.stats,.actions{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.stat{background:#1c2935;border:1px solid #344555;padding:16px;flex:1;min-width:160px}.stat strong{font-size:30px;display:block}.action,button{background:#263d51;color:#e9f2fa;border:1px solid #56758e;border-radius:5px;padding:10px 14px;font:inherit;cursor:pointer}.action{text-decoration:none}.evidence{background:#192632;border-left:3px solid #729bbb;padding:16px 22px;margin:20px 0}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;border-bottom:1px solid #34424e;padding:14px 12px;vertical-align:top}th{color:#b9cbd9}td:first-child{font-weight:700}td.summary-cell{min-width:260px}.map-wrap{overflow:auto;background:#111820;border:1px solid #34424e}.map-wrap img{display:block;width:100%;min-width:620px}.map-wrap.zoom img{width:1064px;max-width:none}.map-controls{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}button[aria-pressed=true]{background:#496983}code{overflow-wrap:anywhere;font-size:12px}details{border:1px solid #34424e;padding:14px;margin:18px 0}summary{cursor:pointer}footer{border-top:1px solid #34424e;margin-top:40px;padding-top:20px;color:#b4c1cc;font-size:13px}@media(max-width:600px){main{padding:24px 14px}.stats{gap:8px}.stat{min-width:120px;padding:12px}td,th{padding:10px 8px}.map-wrap img{min-width:620px}}`;
const h = escapeHtml;
const badge = status => `<span class="badge ${status}">${labels[status]}</span>`;
const page = (title, body, script = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)} · Jacques MS</title><link rel="stylesheet" href="report.css"></head><body><main>${body.replace(/[ \t]+$/gm, '')}<footer>MS ruleset · Unmodified Jacques.dat · Coordinates are zero-based (x,y).<br>DAT SHA-256: <code>${DAT_SHA256}</code><br><a href="https://bitbusters.club/gliderbot/sets/cc1/Jacques.dat">Source DAT</a> · <a href="https://forum.bitbusters.club/thread-796.html">Author’s release thread</a> · <a href="https://github.com/joshua-bone/tworld/tree/master/scripts/jacques">Investigation tools</a></footer></main>${script}</body></html>\n`;
const playHref = (level, replay = false) => `../../../?pack=gb%3Acc1%2FJacques.dat&amp;ruleset=MS&amp;level=${level}${replay ? `&amp;replay=dev%2Fsolutions%2Fjacques%2Freplays%2F${level}.tws` : ''}`;

export async function buildReports() {
  await mkdir(join(OUTPUT, 'reports'), { recursive: true });
  await mkdir(join(OUTPUT, 'replays'), { recursive: true });
  const analysis = await filesBelow(join(ROOT, 'docs/solutions/jacques/analysis'));
  const sources = new Map();
  for (const path of analysis.filter(path => /\/\d+\.json$/.test(path))) {
    const report = JSON.parse(await readFile(path, 'utf8'));
    assert.ok(!sources.has(report.level), `Duplicate analysis for ${report.level}`);
    sources.set(report.level, { report, path });
  }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const reports = [];
  for (const level of LEVELS) {
    const map = JSON.parse(await readFile(join(OUTPUT, 'maps', `${level}.json`), 'utf8'));
    const source = sources.get(level);
    const raw = source?.report ?? {};
    const argument = raw.argument ?? raw.proofSteps ?? [];
    const report = {
      ...raw, level, title: raw.title ?? raw.name ?? map.metadata.name,
      status: raw.status ?? 'unresolved',
      summary: raw.summary ?? 'Investigation is continuing; no winning replay or complete impossibility argument is established yet.',
      argument: Array.isArray(argument) ? argument : [argument],
      chipsRequired: map.metadata.chipsRequired, timeLimitSeconds: map.metadata.timeLimitSeconds,
      datSha256: DAT_SHA256, engineCommit: commit,
    };
    let certificate;
    if (report.status === 'solved') {
      const replayPath = analysis.find(path => path.endsWith(`/${level}.tws`)) ?? join(OUTPUT, 'replays', `${level}.tws`);
      const bytes = await readFile(replayPath);
      certificate = JSON.parse(await readFile(`${replayPath}.json`, 'utf8'));
      validateReport(report, { certificate, bytes, datSha256: DAT_SHA256 });
      if (replayPath !== join(OUTPUT, 'replays', `${level}.tws`)) {
        await copyFile(replayPath, join(OUTPUT, 'replays', `${level}.tws`));
        await copyFile(`${replayPath}.json`, join(OUTPUT, 'replays', `${level}.tws.json`));
      }
    } else validateReport(report);
    reports.push(report);
    const evidence = (await readdir(join(OUTPUT, 'evidence'))).filter(name => name.startsWith(`${level}-`));
    const references = [...new Set(raw.sourceEvidence ?? raw.sources ?? raw.evidence?.sources ?? raw.evidence?.sourceReferences ?? [])];
    const sourceLinks = references.map(reference => {
      const match = /^([^ :]+)(?::(\d+))?/.exec(reference);
      return match ? `<li><a href="https://github.com/joshua-bone/tworld/blob/${commit}/${h(match[1])}${match[2] ? `#L${match[2]}` : ''}">${h(reference)}</a></li>` : `<li>${h(reference)}</li>`;
    }).join('');
    const content = `<nav><a href="./">← All 38 levels</a></nav><p class="kicker">Jacques · Original Tile World MS</p><h1>${level}. ${h(report.title)}</h1>${badge(report.status)}<p class="summary">${h(report.summary)}</p><p class="muted">${report.chipsRequired} chips required · ${report.timeLimitSeconds ? `${report.timeLimitSeconds} second time limit` : 'No time limit'}</p>
      <div class="actions">${certificate ? `<a class="action" href="${playHref(level, true)}">Watch verified replay in TWO</a><a class="action" href="replays/${level}.tws" download>Download MS replay</a>` : ''}<a class="action" href="${playHref(level)}">Open level in TWO</a></div>
      ${certificate ? `<div class="evidence"><strong>Verified in both engines.</strong> Native Tile World and the web MS engine both completed at tick ${certificate.native.finalTick.toLocaleString('en-US')} (${certificate.native.finalTick / 20} seconds), with identical full traces. <a href="replays/${level}.tws.json">Verification certificate</a>.</div>` : report.status === 'unresolved' ? '<div class="evidence">This is an incomplete investigation. An unsuccessful attempt or bounded search is not evidence that a level is impossible.</div>' : ''}
      ${report.argument.length ? `<h2>${report.status === 'solved' ? 'Winning strategy' : report.status === 'impossible' ? 'Why completion is impossible' : 'Findings so far'}</h2><ol>${report.argument.map(step => `<li>${h(step)}</li>`).join('')}</ol>` : ''}
      <h2>Inspect both layers</h2><p>The main map shows the initial runtime state. Switch to the buried layer to inspect hidden terrain and items. Hover coordinates are also available in the downloadable SVG.</p><div class="map-controls"><button type="button" data-plane="" aria-pressed="true">Main map</button><button type="button" data-plane="-bottom" aria-pressed="false">Buried layer</button><button type="button" id="zoom" aria-pressed="false">Full-size map</button><a href="maps/${level}.svg">Open SVG</a><a href="maps/${level}.json">Exact map data</a></div><div class="map-wrap" id="map-wrap"><img id="map" src="maps/${level}.svg" alt="Full 32 by 32 map of level ${level}, ${h(report.title)}"></div>
      ${raw.experiments?.length ? `<details><summary>Recorded checks and attempts</summary><ul>${raw.experiments.map(item => `<li><strong>${h(item.kind ?? 'Check')}</strong>: ${h(item.result ?? JSON.stringify(item))}</li>`).join('')}</ul></details>` : ''}
      ${raw.limitations?.length ? `<details><summary>Scope and limitations</summary><ul>${raw.limitations.map(item => `<li>${h(item)}</li>`).join('')}</ul></details>` : ''}
      <h2>Evidence</h2><ul><li><a href="reports/${level}.json">Structured report</a></li>${evidence.map(file => `<li><a href="evidence/${h(file)}">${h(file)}</a></li>`).join('')}${sourceLinks}</ul>`;
    const script = `<script>document.querySelectorAll('[data-plane]').forEach(button=>button.addEventListener('click',()=>{document.getElementById('map').src='maps/${level}'+button.dataset.plane+'.svg';document.querySelectorAll('[data-plane]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)))}));document.getElementById('zoom').addEventListener('click',event=>{const active=document.getElementById('map-wrap').classList.toggle('zoom');event.currentTarget.setAttribute('aria-pressed',String(active))});</script>`;
    await writeFile(join(OUTPUT, `${level}.html`), page(`${level}. ${report.title}`, content, script));
    await writeFile(join(OUTPUT, 'reports', `${level}.json`), JSON.stringify(report, null, 2) + '\n');
  }
  const counts = Object.fromEntries(Object.keys(labels).map(status => [status, reports.filter(report => report.status === status).length]));
  const body = `<p class="kicker">38 disputed levels · MS ruleset</p><h1>Jacques replay investigation</h1><p class="summary">Winning replays and explicit impossibility arguments for the levels reported as potentially unsolvable.</p><p>Each level is inspected in both map layers and tested with an exact-tick visual harness. A winning replay must complete the unchanged level in both the production web engine and native Tile World, with matching traces. An impossibility argument states the mechanism that excludes all legal solutions; a failed search alone does not qualify.</p><div class="stats">${Object.entries(counts).map(([status, count]) => `<div class="stat"><strong>${count}</strong>${labels[status]}</div>`).join('')}</div>${counts.unresolved ? '<p class="evidence">Work is ongoing. Entries marked “Under investigation” are not final answers.</p>' : ''}<div class="table-wrap"><table><thead><tr><th>Level</th><th>Finding</th><th>Evidence summary</th></tr></thead><tbody>${reports.map(report => `<tr><td><a href="${report.level}.html">${report.level}. ${h(report.title)}</a></td><td>${badge(report.status)}</td><td class="summary-cell">${h(report.summary)}</td></tr>`).join('')}</tbody></table></div><details><summary>Dataset and method</summary><p>The 986-level archive was compared with the author’s attachment; the level records match, while the attachment has thirteen additional empty placeholders. All results here refer to the exact archive hash below. No tiles or rules were changed.</p><p>Strategies and proofs were developed from full-map artwork, both tile layers, the MS implementation, and bounded experiments. Local timing searches are used where a specific collision or move order needs resolving. Replay verification uses the original C engine independently of the web implementation.</p><p>Engine source snapshot: <code>${commit}</code>. <a href="manifest.json">Machine-readable manifest</a>.</p></details>`;
  await writeFile(join(OUTPUT, 'index.html'), page('Investigation', body));
  await writeFile(join(OUTPUT, 'report.css'), css + '\n');
  await writeFile(join(OUTPUT, 'manifest.json'), JSON.stringify({ datSha256: DAT_SHA256, engineCommit: commit, counts, levels: reports.map(({ level, title, status, summary }) => ({ level, title, status, summary })) }, null, 2) + '\n');
  console.log(`Generated ${reports.length} reports: ${JSON.stringify(counts)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildReports();
