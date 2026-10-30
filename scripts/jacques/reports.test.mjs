import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { validateReport, escapeHtml } from './reports.mjs';

const base = { level: 937, title: 'Running BomberMan', summary: 'A finding', argument: ['First fact.', 'Therefore the result.'] };
test('a solved label requires an exact-byte, dual-engine completion certificate', () => {
  const report = { ...base, status: 'solved' };
  assert.throws(() => validateReport(report), /certificate/);
  const bytes = Buffer.from('a replay');
  const certificate = { level: { number: 937 }, datSha256: 'dat', twsSha256: createHash('sha256').update(bytes).digest('hex'), native: { status: 'completed', finalTick: 20 }, typescript: { status: 'completed', finalTick: 20 }, exactTraceParity: true, exactInputBytesRead: true };
  assert.throws(() => validateReport(report, { certificate, bytes, datSha256: 'dat' }), /input command audit/);
  certificate.inputAudit = { kind: 'original-ms-command-alphabet', keyboardMoves: 1, mouseMoves: 0 };
  assert.doesNotThrow(() => validateReport(report, { certificate, bytes, datSha256: 'dat' }));
  assert.throws(() => validateReport(report, { certificate, bytes: Buffer.from('different'), datSha256: 'dat' }), /hash/);
  assert.throws(() => validateReport(report, { certificate: { ...certificate, native: { status: 'failed' } }, bytes, datSha256: 'dat' }), /completion/);
});
test('an impossibility report needs a multi-step argument; unresolved stays unresolved', () => {
  assert.throws(() => validateReport({ ...base, status: 'impossible', argument: [] }), /argument/);
  assert.doesNotThrow(() => validateReport({ ...base, status: 'unresolved', argument: [] }));
  assert.throws(() => validateReport({ ...base, status: 'probably impossible' }), /status/);
});
test('level titles and evidence are escaped as text', () => {
  assert.equal(escapeHtml('<script>"x" & y</script>'), '&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;');
});
