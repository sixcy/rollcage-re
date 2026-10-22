// Authentic authored bytes; surrounding runtime loader remains outside scope.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../../src/archive.mjs';
import {getGame} from '../../src/track-games.mjs';
import {loadRetainedNativeProgram} from '../lib/retained-native-program.mjs';
import {BoundedX86} from '../lib/bounded-x86.mjs';
import {relocateRaceTrackPointers} from './track-relocation.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions);
const B = 0x100000, S = 0x9000, results = [], reached = new Set(); let steps = 0;
machine.onInstruction = address => {if (address === 0x44c71e) throw Error('INSTALLED_TRACK_RELOCATION_END'); reached.add(address); steps++;};
const archive = await RollcageArchive.open(getGame('rollcage').installation);
try {
  for (const entry of archive.entries) {
    const {data} = await archive.readResource(entry.index);
    if (data.toString('ascii', 0, 4) !== 'GFXM') continue;
    assert(B + data.length < 0x5d0000, `resource${entry.index} must fit without overlapping retained constants`);
    const digest = hash(data), memory = Buffer.alloc(0xa00000);
    program.initializeMemory(memory); data.copy(memory, B);
    memory.writeUInt32LE(B, 0x90b970); memory.writeUInt32LE(B, 0x90b990);
    assert.equal(memory.readFloatLE(0x5dc888), 2); assert.equal(memory.readFloatLE(0x5dca40), 255);
    machine.reset(); memory.copy(machine.bytes);
    const relocated = relocateRaceTrackPointers(B, B, {memory, scratchBase: S});
    machine.entry = 0x44c46a; machine.r.ESI = B; machine.r.EDI = B; machine.r.ESP = S - 76;
    assert.throws(() => machine.run(2_000_000), error => error.message === 'At 0x44c71e: INSTALLED_TRACK_RELOCATION_END', `resource${entry.index} exact original section end`);
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
    if (!native.equals(source)) {const i = native.findIndex((v, j) => v !== source[j]); assert.fail(`resource${entry.index} byte0x${(i + 0x10000).toString(16)} native${native[i]} source${source[i]}`);}
    for (const offset of [0x48, 0x3c, 0x28, 0x44, 0x30, 0x38, 0x24]) assert.equal(machine.bytes.readInt32LE(S - 76 + offset), memory.readInt32LE(S - 76 + offset));
    assert.equal(machine.r.EDI >>> 0, relocated.base >>> 0); assert.equal(machine.r.EBP | 0, relocated.modelAuxiliary | 0);
    assert.equal(hash(data), digest, 'authored input buffer unchanged');
    results.push({resource: entry.index, sha256: digest, bytes: data.length, routeGroups: data[0x79], models: data.readUInt16LE(0x2c), sectors: data.readInt32LE(0x10), colorEntries: data.readUInt16LE(0x66)});
  }
} finally {await archive.close();}
assert.equal(results.length, 84, 'complete installed Redux GFXM corpus');
const sourcePath = 'tools/next-phase/track-relocation.mjs';
const report = {method: 'All84 installed Redux GFXM resources are read through the existing archive reader and copied unchanged into a synthetic relocated heap. Exact original44c2b0 section44c46a..44c71d matches the staged source for every mapped byte>=10000h, seven original parent locals and retained base registers. Read-only archive access; input buffers hashed before/after. No original-process runtime evidence or complete runtime loader/startup claim: allocation, preceding/following loader policy, texture/material/body constructors and asset consumers remain open.', targetSHA256: program.sha256, source: {path: sourcePath, sha256: hash(await readFile(sourcePath))}, resources: results.length, reachedInstructions: reached.size, instructionSteps: steps, matched: true, results};
await writeFile('analysis/track-relocation-installed-staged-check-20261022.json', JSON.stringify(report, null, 2), {flag: 'wx'});
console.log(JSON.stringify({resources: results.length, reachedInstructions: reached.size, instructionSteps: steps, matched: true}));
