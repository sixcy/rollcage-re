// Isolate old TLS fixture initialization without changing frozen suite inputs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';

const path = 'tools/verify-periodic-body-spawn-instructions.mjs';
const original = await readFile(path, 'utf8');
const patches = [
  ['machine.reset(); memory.copy(machine.bytes);', 'machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);'],
  ['function compare(memory, label) {', "function compare(memory, label) { assert.equal(machine.fs0, 0x12345678, `${label} explicit TLS chain restored`);"]
];
let source = original;
for (const [before, after] of patches) {
  assert.equal(source.split(before).length, 2);
  source = source.replace(before, after);
}
source = source.replace(/from '([^']+)'/g, (whole, specifier) => specifier.startsWith('.') ? `from ${JSON.stringify(new URL(specifier, new URL('../tools/', import.meta.url)).href)}` : whole);
await writeFile('analysis/periodic-body-tls-diagnostic-delta-20261022.json', JSON.stringify({
  method: 'Separate in-memory diagnostic of explicit TLS fixture setup and restoration in standalone and actual450e50-connected periodic-body checks. Frozen canonical inputs and reports remain unchanged; not a replacement for a corrected aggregate.',
  sourcePath: path, sourceSHA256: createHash('sha256').update(original).digest('hex'), patches
}, null, 2), {flag: 'wx'});
try {
  const {verifyPeriodicBodySpawn} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  await verifyPeriodicBodySpawn({output: 'analysis/periodic-body-tls-diagnostic-20261022.json'});
  await verifyPeriodicBodySpawn({withRaceUpdate: true, output: 'analysis/race-periodic-body-tls-diagnostic-20261022.json'});
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
