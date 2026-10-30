import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serializeSolutionFile } from '../../web/src/content/api/solution-file';
import { runMsReplayTrace } from '../../web/src/ruleset-ms/impl/engine';
import { collectTraceMismatches } from '../../web/src/replay-verifier/impl/engine/comparators/traceComparison';
import { loadLevel, createRun, tick, verifyNativeReplay, ROOT } from './harness';

const path = join(ROOT, 'web/public/dev/solutions/jacques/evidence/723-gate-timing.json');
const evidence = JSON.parse(await readFile(path, 'utf8'));
const loaded = await loadLevel(723);
const probes = [];
for (const phase of [0, 1, 2, 3]) {
  const run = createRun(loaded);
  const chipPos = () => run.session.state.internal.chipPos;
  for (const input of evidence.prefixInputs) tick(run, input);
  if (chipPos() !== 51) throw new Error('Expected gate approach at (19,1)');
  while (run.session.state.internal.chipHasMoved || (run.session.state.engine.timer.currentTime + 1) % 4 !== phase) tick(run, 0);
  tick(run, 'E');
  if (chipPos() !== 52) throw new Error('Gate push failed');
  const pushTick = run.session.state.engine.timer.currentTime;
  const blockSamples = new Map<number, unknown>();
  const sample = () => blockSamples.set(run.session.state.engine.timer.currentTime, run.session.state.internal.blocks.filter(block => block.pos >= 52 && block.pos <= 54).map(block => ({position:{x:block.pos % 32, y:Math.floor(block.pos / 32)}, direction: block.dir, sliding:block.sliding})));
  const advance = (input: number | 'N' | 'E' | 'S' | 'W') => { tick(run, input); sample(); };
  sample();
  const arrivals: Record<string, number> = {};
  for (const [dir, pos, label] of [['S', 84, 'south'], ['E', 85, 'east'], ['N', 53, 'northAttempt']] as const) {
    const before = run.inputs.length;
    while (chipPos() !== pos && run.session.state.engine.status === 'playing' && run.inputs.length - before < 20) advance(dir);
    arrivals[label] = run.session.state.engine.timer.currentTime;
    if (chipPos() !== pos) throw new Error(`Missed ${label}`);
  }
  for (let extra = 0; extra < 4; extra++) advance(0);
  const expandedSolution = { flags: 0, randomSlideDirection: 1, stepping: 0, randomSeed: 0, moves: run.session.recordedMoves };
  const bestTimeTicks = 6000;
  const bytes = serializeSolutionFile({ruleset:'MS', flags:0, extraHeader:new Uint8Array(), setName:'Jacques-MS.dac', entries:[{levelNumber:723, password:loaded.metadata.password, bestTimeTicks, solutionData:null, expandedSolution}]});
  const native = await verifyNativeReplay(loaded, bytes, run.inputs.length);
  const ts = runMsReplayTrace(loaded.request, loaded.level, expandedSolution, run.inputs.length);
  const mismatches: {path:string;actual:unknown;expected:unknown}[] = [];
  const normalize = (value: unknown) => JSON.parse(JSON.stringify(value));
  collectTraceMismatches(normalize(ts), normalize(native.trace), '$', mismatches, 10);
  if (mismatches.length) throw new Error(JSON.stringify(mismatches));
  const selected = native.trace.steps.filter(step => step.currentTime >= pushTick).map(step => ({tick:step.currentTime, chip:step.chip?.position, gateBlocks:blockSamples.get(step.currentTime), nativeMapHash:step.mapHash}));
  probes.push({phase, pushTick, arrivals, selected, exactTraceParity:true, nativeResult:native.trace.result, nativeStderr:native.stderr});
  console.log(JSON.stringify({phase, pushTick, arrivals, native:native.trace.result}));
}
await writeFile(path, JSON.stringify({...evidence, probes}, null, 2));
