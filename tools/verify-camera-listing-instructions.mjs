import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';

const manifestPath = 'analysis/camera-mode-listing.json', bytesPath = 'analysis/native-simulation/results/3518-full-camera-code-bytes.json';
const program = await loadRetainedListing(manifestPath, bytesPath), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(program.entry, 0x4180a0); assert.equal(manifest.jumpTableEvidence.entries.length, 17);
const calls = [...new Set(program.instructions.filter(i => i.op === 'CALL').map(i => i.args.join(',')))];
const report = {method: 'Complete original4180a0 Ghidra Listing flow traversal, including all17 entries from original41a124 jump table. Every instruction independently compared to separate complete original byte span3518 under exact Redux SHA; nonoverlap, branch targets, computed table identity, case and fallthrough boundaries checked by retained-listing loader. This establishes retained code, not translated source or runtime behavior. Original procedure export omits most computed cases. No binary annotation or original process execution.', sha256: REDUX_SHA256, entry: program.entry, manifestPath, bytesPath, instructions: program.instructions.length, modes: manifest.jumpTableEvidence.entries, calls, evidence: program.evidence, matched: true};
await writeFile('analysis/camera-listing-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
