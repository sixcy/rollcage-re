// Noncanonical diagnostic while the aggregate's reference inputs are frozen.
// Keep the original checker/report intact; record the precise in-memory delta.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';

const path = 'tools/verify-effect-emitter-instructions.mjs';
const report = 'analysis/effect-emitter-tls-diagnostic-20261022.json';
const original = await readFile(path, 'utf8');
const patches = [
  ['machine.reset(); const bytes = machine.bytes;', 'machine.reset(); machine.fs0 = 0x12345678; const bytes = machine.bytes;'],
  ["assert.equal(bytes.readUInt32LE(0), sourceMemory.readUInt32LE(0), 'restored exception chain');", "assert.equal(machine.fs0, 0x12345678, 'restored explicit TLS exception chain'); assert.equal(bytes.readUInt32LE(0), sourceMemory.readUInt32LE(0), 'ordinary address zero remains unchanged');"],
  ["'analysis/effect-emitter-instruction-check.json'", JSON.stringify(report)]
];
let source = original;
for (const [before, after] of patches) {
  assert.equal(source.split(before).length, 2, `diagnostic requires one exact replacement: ${before}`);
  source = source.replace(before, after);
}
const origin = new URL('../tools/', import.meta.url);
source = source.replace(/from '([^']+)'/g, (whole, specifier) => specifier.startsWith('.') ? `from ${JSON.stringify(new URL(specifier, origin).href)}` : whole);
await writeFile('analysis/effect-emitter-tls-diagnostic-delta-20261022.json', JSON.stringify({
  method: 'Separate diagnostic of a frozen checker using exactly the listed in-memory replacements and absolute import URLs. No canonical checker or reference input changes; report written to a new diagnostic path. Not a replacement for a corrected canonical sweep.',
  sourcePath: path, sourceSHA256: createHash('sha256').update(original).digest('hex'), patches
}, null, 2), {flag: 'wx'});
try {
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
