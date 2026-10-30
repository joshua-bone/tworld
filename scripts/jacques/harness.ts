import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDatFile, extractGroupedDatLevels } from '../../web/src/content/api/seriesDat';
import { serializeSolutionFile, parseSolutionFile } from '../../web/src/content/api/solution-file';
import { msElementFamilyRegistration } from '../../web/src/ruleset-ms/impl/elementRegistration';
import { createMsInteractiveSession, advanceMsInteractiveSession, runMsReplayTrace, type MsInteractiveSessionState } from '../../web/src/ruleset-ms/impl/engine';
import { projectMsInteractiveFrame } from '../../web/src/ruleset-ms/impl/interactiveProjection';
import { engineStateToSnapshot } from '../../web/src/game-core/impl/snapshot';
import { MS_TILE, msCreatureTile } from '../../web/src/ruleset-ms/api/tiles';
import { getLegacySpriteCoords, LEGACY_TILE_SIZE } from '../../web/src/player-web/impl/legacySprites';
import { createP4bLegacyArtworkSheet } from '../../web/src/ccsolver-runtime/compose/p4b-dossier/p4bLegacyArtwork';
import { collectTraceMismatches } from '../../web/src/replay-verifier/impl/engine/comparators/traceComparison';
import { mapInputTraceFixtureToGameTrace } from '../../web/src/oracle-fixtures/impl/mappers/characterizationMapper';

export const DAT_SHA256 = 'c10acac13135586a4ce7b45f0427010229c51ac2fc5b6d0631a7036b86a90b6f';
export const DEFAULT_DAT = '/Users/joshuabone/Downloads/Jacques.dat';
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DIRECTIONS = { N: 1, W: 2, S: 4, E: 8, '.': 0 } as const;
const execute = promisify(execFile);
export function verifyDatBytes(bytes: Uint8Array): void {
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== DAT_SHA256) throw new Error(`Jacques DAT SHA-256 mismatch: ${actual}`);
}
export async function loadLevel(selector: number | string, datPath = DEFAULT_DAT) {
  const bytes = await readFile(datPath);
  verifyDatBytes(bytes);
  const metadataList = parseDatFile(bytes, { ruleset: 'MS' }).levels;
  const matches = metadataList.filter((entry) => typeof selector === 'number' ? entry.number === selector : entry.name === selector);
  if (matches.length !== 1) throw new Error(`Expected one level matching ${selector}; found ${matches.length}`);
  const metadata = matches[0]!;
  const raw = extractGroupedDatLevels(bytes).levels[metadata.index]!;
  const level = msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel(raw);
  return { metadata, level, datPath, datSha256: DAT_SHA256, request: { seriesFile: 'Jacques-MS.dac', levelNumber: metadata.number, ruleset: 'MS' as const, randomSeed: 0 } };
}
export type LoadedLevel = Awaited<ReturnType<typeof loadLevel>>;
export type Run = { loaded: LoadedLevel; session: MsInteractiveSessionState; inputs: number[]; stepping: number; randomSeed: number };
export function createRun(loaded: LoadedLevel, options: { stepping?: number; randomSeed?: number } = {}): Run {
  const stepping = options.stepping ?? 0;
  const randomSeed = options.randomSeed ?? 0;
  if (!Number.isInteger(stepping) || stepping < 0 || stepping > 7) throw new Error('MS stepping must be 0..7');
  if (!Number.isInteger(randomSeed) || randomSeed < 0 || randomSeed > 0xffffffff) throw new Error('Random seed must be uint32');
  const session = createMsInteractiveSession({ ...loaded.request, randomSeed }, loaded.level);
  // Non-null initialization options select replay mode in the low-level API.
  // Keep cursor=-1 so manual inputs are recorded, then set the MS timing phase.
  session.state.engine.replay.stepping = stepping;
  return { loaded, session, inputs: [], stepping, randomSeed };
}
export function tick(run: Run, input: number | keyof typeof DIRECTIONS = 0, count = 1): Run {
  if (!Number.isSafeInteger(count) || count < 0 || count > 100000) throw new Error('Tick count must be bounded to 0..100000');
  const code = typeof input === 'number' ? input : DIRECTIONS[input];
  if (!Number.isSafeInteger(code) || code < 0) throw new Error('Input must be a nonnegative integer code or N/W/S/E/.');
  for (let index = 0; index < count && run.session.state.engine.status === 'playing'; index++) {
    run.session = advanceMsInteractiveSession(run.session, code);
    run.inputs.push(code);
  }
  return run;
}
/** Hold a direction for exactly four native ticks (one ordinary MS tile move). */
export function move(run: Run, direction: keyof typeof DIRECTIONS, count = 1): Run {
  return tick(run, direction, count * 4);
}
export function snapshot(run: Run) {
  return engineStateToSnapshot(run.session.state.engine, run.inputs.length ? 'tick' : 'initial', run.session.lastInput);
}
export function dump(run: Run) {
  return { datSha256: DAT_SHA256, metadata: run.loaded.metadata, snapshot: snapshot(run), internal: { chipStatus: run.session.state.internal.chipStatus, completed: run.session.state.internal.completed, floorMovement: run.session.state.internal.floorMovement, chipWait: run.session.state.internal.chipWait, creatures: run.session.state.internal.creatures, blocks: run.session.state.internal.blocks }, cells: run.session.state.engine.map.cells, traps: run.loaded.level.traps, cloners: run.loaded.level.cloners, inputs: run.inputs, recordedMoves: run.session.recordedMoves };
}
export function buildWinningReplay(run: Run) {
  if (run.session.state.engine.status !== 'completed' || !run.session.state.internal.completed) throw new Error('Run must be completed; reaching an exit coordinate is insufficient');
  if (run.session.recordedMoves.some(move => (move.modifierMask ?? 0) !== 0)) throw new Error('Ordinary MS TWS cannot preserve modifier actions');
  const bestTimeTicks = run.session.state.engine.timer.currentTime;
  const expandedSolution = { flags: 0, randomSlideDirection: 1, stepping: run.stepping, randomSeed: run.randomSeed, moves: run.session.recordedMoves.map(({when, dir}) => ({when, dir})) };
  const bytes = serializeSolutionFile({ ruleset: 'MS', flags: 0, extraHeader: new Uint8Array(), setName: 'Jacques-MS.dac', entries: [{ levelNumber: run.loaded.metadata.number, password: run.loaded.metadata.password, bestTimeTicks, solutionData: null, expandedSolution }] });
  const parsed = parseSolutionFile(bytes);
  if (!Buffer.from(serializeSolutionFile(parsed)).equals(Buffer.from(bytes))) throw new Error('TWS roundtrip changed bytes');
  const replay = { ...parsed.entries[0]!.expandedSolution!, bestTimeTicks };
  const trace = runMsReplayTrace(run.loaded.request, run.loaded.level, replay, bestTimeTicks + 100);
  if (trace.result.status !== 'completed') throw new Error(`Encoded replay failed TypeScript replay: ${trace.result.status}`);
  return { bytes, replay, trace };
}
export async function verifyNativeReplay(loaded: LoadedLevel, twsBytes: Uint8Array, maxTicks: number) {
  if (!Number.isInteger(maxTicks) || maxTicks < 1 || maxTicks > 200000) throw new Error('Native maxTicks must be 1..200000');
  const source = await readFile(loaded.datPath);
  verifyDatBytes(source);
  const temp = await mkdtemp(join(tmpdir(), 'jacques-native-'));
  try {
    await mkdir(join(temp, 'save'));
    await mkdir(join(temp, 'sets'));
    await mkdir(join(temp, 'data'));
    await writeFile(join(temp, 'data', 'Jacques.dat'), source);
    await writeFile(join(temp, 'sets', 'Jacques-MS.dac'), 'file=Jacques.dat\nruleset=ms\n');
    await writeFile(join(temp, 'save', 'Jacques-MS.dac.tws'), twsBytes);
    const args = ['--root', ROOT, '--series-dir', join(temp, 'sets'), '--data-dir', join(temp, 'data'), '--save-dir', join(temp, 'save'), 'replay-trace', 'Jacques-MS.dac', String(loaded.metadata.number), String(maxTicks)];
    const output = await execute(join(ROOT, 'build-verify/legacy_c/tworld-oracle'), args, { timeout: 30000, maxBuffer: 128 * 1024 * 1024, encoding: 'utf8' });
    const trace = mapInputTraceFixtureToGameTrace(JSON.parse(output.stdout));
    return { trace, stderr: output.stderr, datSha256: DAT_SHA256, twsSha256: createHash('sha256').update(twsBytes).digest('hex'), maxTicks, timeoutMs: 30000, exactInputBytesRead: Buffer.from(await readFile(join(temp, 'save', 'Jacques-MS.dac.tws'))).equals(Buffer.from(twsBytes)) };
  } finally { await rm(temp, { recursive: true, force: true }); }
}
export async function saveWinningReplay(run: Run, outputPath: string) {
  const built = buildWinningReplay(run);
  const native = await verifyNativeReplay(run.loaded, built.bytes, built.trace.result.finalTick + 100);
  if (native.trace.result.status !== 'completed') throw new Error(`Native replay failed: ${native.trace.result.status}`);
  if (!native.exactInputBytesRead) throw new Error('Native staged TWS changed');
  const differences: { path: string; actual: unknown; expected: unknown }[] = [];
  const normalize = (value: unknown) => JSON.parse(JSON.stringify(value));
  collectTraceMismatches(normalize(built.trace.initialState), normalize(native.trace.initialState), '$.initialState', differences, 10);
  collectTraceMismatches(normalize(built.trace.steps), normalize(native.trace.steps), '$.steps', differences, 10);
  collectTraceMismatches(built.trace.result, native.trace.result, '$.result', differences, 10);
  if (differences.length) throw new Error(`Native/TypeScript replay mismatch: ${JSON.stringify(differences)}`);
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, built.bytes);
  const certificate = { datSha256: DAT_SHA256, level: run.loaded.metadata, twsSha256: native.twsSha256, typescript: built.trace.result, native: native.trace.result, nativeStderr: native.stderr, exactInputBytesRead: true, exactTraceParity: true };
  await writeFile(`${outputPath}.json`, JSON.stringify(certificate, null, 2));
  return certificate;
}
let atlas: ReturnType<typeof createP4bLegacyArtworkSheet> | undefined;
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
/** Full-map artwork from the production legacy sprite coordinates, showing both map planes. */
export async function renderSvg(run: Run, options: { plane?: 'both' | 'top' | 'bottom'; title?: string } = {}) {
  atlas ??= createP4bLegacyArtworkSheet({ target: 'ms', sourcePath: 'res/tiles.bmp', bytes: await readFile(join(ROOT, 'res/tiles.bmp')) });
  const frame = projectMsInteractiveFrame(run.session, run.inputs.length ? 'tick' : 'initial');
  const plane = options.plane ?? 'both';
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1064 1084"><defs><image id="atlas" width="336" height="768" href="data:image/png;base64,${Buffer.from(atlas.pngBytes).toString('base64')}"/></defs><rect width="1064" height="1084" fill="#111820"/><text x="20" y="22" fill="white" font-family="sans-serif" font-size="15">${escape(options.title ?? `${run.loaded.metadata.number}. ${run.loaded.metadata.name} · tick ${snapshot(run).currentTime} · ${plane}`)}</text>`];
  const sprite = (id: number, pos: number) => {
    const coord = getLegacySpriteCoords(id);
    if (!coord) return;
    parts.push(`<svg x="${20 + pos % 32 * 32}" y="${40 + Math.floor(pos / 32) * 32}" width="32" height="32" viewBox="${coord.x * LEGACY_TILE_SIZE} ${coord.y * LEGACY_TILE_SIZE} 48 48" style="image-rendering:pixelated"><use href="#atlas"/></svg>`);
  };
  for (const cell of frame.cells) {
    sprite(MS_TILE.Empty, cell.position.pos);
    if (plane !== 'top') sprite(cell.bottom.id, cell.position.pos);
    if (plane !== 'bottom') sprite(cell.top.id, cell.position.pos);
    parts.push(`<rect x="${20 + cell.position.x * 32}" y="${40 + cell.position.y * 32}" width="32" height="32" fill="none" stroke="#ffffff20"><title>(${cell.position.x},${cell.position.y}): top ${cell.top.id}; bottom ${cell.bottom.id}</title></rect>`);
  }
  if (plane !== 'bottom') {
    for (const actor of frame.render?.actors ?? []) if (!actor.hidden) sprite(msCreatureTile(actor.id, actor.dir), actor.pos);
    const chip = frame.render?.chip;
    if (chip && !chip.hidden) sprite(msCreatureTile(MS_TILE.Chip, chip.dir), chip.pos);
  }
  for (let index = 0; index < 32; index++) parts.push(`<text x="${36 + index * 32}" y="1078" fill="white" text-anchor="middle" font-size="10">${index}</text><text x="8" y="${60 + index * 32}" fill="white" text-anchor="middle" font-size="10">${index}</text>`);
  return parts.join('') + '</svg>';
}
