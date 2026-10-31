import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GameTrace } from '../../web/src/game-core/api/types';
import { normalizeTraceSnapshot } from '../../web/src/oracle-fixtures/impl/mappers/characterizationMapper';
import { collectTraceMismatches, type TraceMismatch } from '../../web/src/replay-verifier/impl/engine/comparators/traceComparison';
import { DAT_SHA256, ROOT, verifyDatBytes, type LoadedLevel } from './harness';

/** Compare large native replay traces one snapshot at a time, without execFile's output cap. */
export async function verifyNativeStream(loaded: LoadedLevel, bytes: Uint8Array, maxTicks: number, expected: GameTrace) {
  if (!Number.isInteger(maxTicks) || maxTicks < 1 || maxTicks > 200000) throw new Error('Native maxTicks must be 1..200000');
  const source = await readFile(loaded.datPath);
  verifyDatBytes(source);
  const temp = await mkdtemp(join(tmpdir(), 'jacques-native-stream-'));
  const timeoutMs = 60000;
  let phase = 'initial';
  let buffer = '';
  let index = 0;
  let result: GameTrace['result'] | undefined;
  let stderr = '';
  let stdoutBytes = 0;
  const digest = createHash('sha256');
  const compare = (actual: unknown, wanted: unknown, path: string) => {
    const differences: TraceMismatch[] = [];
    const normalize = (value: unknown) => JSON.parse(JSON.stringify(value));
    collectTraceMismatches(normalize(actual), normalize(wanted), path, differences, 10);
    if (differences.length) throw new Error(`Native parity mismatch ${JSON.stringify(differences)}`);
  };

  // JSON objects may span stdout chunks. Braces inside quoted strings do not count.
  function objectEnd() {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let j = 0; j < buffer.length; j++) {
      const character = buffer[j];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === '{' || character === '[') depth++;
      else if (character === '}' || character === ']') {
        depth--;
        if (depth === 0) return j + 1;
      }
    }
    return -1;
  }

  function consume() {
    for (;;) {
      if (phase === 'initial' || phase === 'seekSteps' || phase === 'result') {
        const key = phase === 'initial' ? '"initialState":' : phase === 'seekSteps' ? '"steps":[' : '"result":';
        const at = buffer.indexOf(key);
        if (at < 0) return;
        buffer = buffer.slice(at + key.length);
        phase = phase === 'initial' ? 'initialObject' : phase === 'seekSteps' ? 'steps' : 'resultObject';
      }
      if (phase === 'steps') {
        buffer = buffer.replace(/^[\s,]+/, '');
        if (!buffer.length) return;
        if (buffer[0] === ']') {
          buffer = buffer.slice(1);
          phase = 'result';
          continue;
        }
        if (buffer[0] !== '{') throw new Error('Unexpected native step JSON');
      }
      if (phase !== 'initialObject' && phase !== 'steps' && phase !== 'resultObject') return;
      const end = objectEnd();
      if (end < 0) return;
      const item = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end);
      if (phase === 'initialObject') {
        compare(normalizeTraceSnapshot(item), expected.initialState, 'initialState');
        phase = 'seekSteps';
      } else if (phase === 'steps') {
        if (index >= expected.steps.length) throw new Error('Native extra step');
        compare(normalizeTraceSnapshot(item), expected.steps[index], `steps[${index}]`);
        index++;
      } else {
        compare(item, expected.result, 'result');
        result = item;
        phase = 'done';
        return;
      }
    }
  }

  try {
    for (const directory of ['save', 'sets', 'data']) await mkdir(join(temp, directory));
    await writeFile(join(temp, 'data', 'Jacques.dat'), source);
    await writeFile(join(temp, 'sets', 'Jacques-MS.dac'), 'file=Jacques.dat\nruleset=ms\n');
    const replayPath = join(temp, 'save', 'Jacques-MS.dac.tws');
    await writeFile(replayPath, bytes);
    const args = ['--root', ROOT, '--series-dir', join(temp, 'sets'), '--data-dir', join(temp, 'data'), '--save-dir', join(temp, 'save'), 'replay-trace', 'Jacques-MS.dac', String(loaded.metadata.number), String(maxTicks)];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(join(ROOT, 'build-verify/legacy_c/tworld-oracle'), args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let failure: Error | undefined;
      const timer = setTimeout(() => {
        failure = new Error(`Native streaming verification exceeded ${timeoutMs} ms`);
        child.kill('SIGKILL');
      }, timeoutMs);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (failure) return;
        stdoutBytes += Buffer.byteLength(chunk);
        digest.update(chunk);
        buffer += chunk;
        try { consume(); }
        catch (error) {
          failure = error as Error;
          child.kill('SIGKILL');
        }
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
        if (stderr.length > 1024 * 1024) {
          failure = new Error('Unexpected oversized native stderr');
          child.kill('SIGKILL');
        }
      });
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error(`Native exited ${code}/${signal}: ${stderr.slice(0, 1000)}`));
        else resolve();
      });
    });
    if (phase !== 'done' || index !== expected.steps.length || !result) throw new Error(`Incomplete native trace: ${phase}, ${index}/${expected.steps.length} steps`);
    if (stderr !== '') throw new Error(`Unexpected native stderr: ${stderr.slice(0, 1000)}`);
    if (!Buffer.from(await readFile(replayPath)).equals(Buffer.from(bytes))) throw new Error('Staged replay bytes changed');
    return {
      native: result, checkedTicks: index, exactTraceParity: true, exactInputBytesRead: true,
      datSha256: DAT_SHA256, twsSha256: createHash('sha256').update(bytes).digest('hex'),
      nativeStdoutSha256: digest.digest('hex'), nativeStdoutBytes: stdoutBytes, nativeStderr: stderr, timeoutMs,
    };
  } finally { await rm(temp, { recursive: true, force: true }); }
}
