// Independent fixture diagnosis; frozen canonical source/checker stays intact.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
const path = 'tools/verify-vehicle-sound-controls-instructions.mjs';
const original = await readFile(path, 'utf8');
const patches = [
  ['machine.reset(); const bytes = machine.bytes;', 'machine.reset(); machine.fs0 = 0x12345678; const bytes = machine.bytes;'],
  ['steps += machine.run();', "steps += machine.run(); assert.equal(machine.fs0, 0x12345678, `fixture${fixture} explicit TLS chain restored`);"],
  ["'analysis/vehicle-sound-controls-instruction-check.json'", "'analysis/vehicle-sound-controls-tls-diagnostic-20261022.json'"]
];
let source = original;
for (const [before, after] of patches) {assert.equal(source.split(before).length, 2); source = source.replace(before, after);}
source = source.replace(/from '([^']+)'/g, (whole, specifier) => specifier.startsWith('.') ? `from ${JSON.stringify(new URL(specifier, new URL('../tools/', import.meta.url)).href)}` : whole);
await writeFile('analysis/vehicle-sound-controls-tls-diagnostic-delta-20261022.json', JSON.stringify({method: 'Separate in-memory diagnostic with precisely listed changes, preserving canonical frozen inputs and their report. Corrected aggregate remains required.', sourcePath: path, sourceSHA256: createHash('sha256').update(original).digest('hex'), patches}, null, 2), {flag: 'wx'});
try {await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);}
catch (error) {console.error(error.message); process.exitCode = 1;}
