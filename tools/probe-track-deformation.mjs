import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {parseScene} from '../src/scene.mjs';
import {initializeBodyRetirementEffectTables} from '../src/body-retirement-effects.mjs';
import {initializeTrackDeformation, updateTrackDeformation} from '../src/track-deformation.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';

const output = process.argv[2] ?? 'analysis/track-deformation-installed.json', installation = process.argv[3] ?? 'C:\\Program Files (x86)\\Psygnosis\\Rollcage';
const own = await readInstructionEvidence(['1329-track-animation-constructor-assembly.json', '1321-race-track-animation-assembly.json', '1324-track-animation-nearby-assembly.json', '665-retirement-4286e0-assembly.json', '669-retirement-4746f0-assembly.json'], {directory: 'analysis/native-simulation/results'});
const math = await readInstructionEvidence(['378-contact-normalize-assembly.json']);
const machine = new BoundedX86([...own.instructions, ...math.instructions]), resources = [], hash = bytes => createHash('sha256').update(bytes).digest('hex');
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const base = 0x100000, pack = 0x80000, heap = 0x81000, stack = 0x9000;
let steps = 0, animatedSegments = 0, frames = 0;
const archive = await RollcageArchive.open(installation);
try {
  for (const entry of archive.entries) {
    const {data} = await archive.readResource(entry.index); if (data.toString('ascii', 0, 4) !== 'GFXM') continue;
    const before = hash(data), scene = parseScene(data), memory = Buffer.alloc(0xa00000), allocations = [], nativeAllocations = [];
    assert(base + data.length < 0x7f0000, `resource${entry.index} fits declared mapping`); data.copy(memory, base);
    const sectors = base + data.readUInt32LE(0x14), palette = base + data.readUInt32LE(0x4c);
    for (const segment of scene.segments) {put(memory, sectors + segment.index * 4, base + segment.offset); put(memory, base + segment.offset + 32, base + segment.verticesOffset);}
    put(memory, 0x90b98c, pack); put(memory, pack, sectors); put(memory, pack + 16, scene.segments.length); put(memory, 0x909240, sectors); put(memory, 0x909270, palette);
    memory[0x91ce90] = 2; initializeBodyRetirementEffectTables(memory); memory.writeFloatLE(1, 0x5dc774); memory.writeFloatLE(4096, 0x5dca88);
    const flagged = scene.segments.filter(segment => data[segment.offset + 6] & 63);
    for (const segment of flagged) assert((data[segment.offset + 6] & 63) <= segment.columns + 1, `valid authored wave width${entry.index}/${segment.index}`);
    const runtime = {memory, scratchBase: stack, roundingMode: 'nearest-even', handlers: {allocate: size => {allocations.push(size); assert(size <= 0xf000); return heap;}}};
    machine.reset(); memory.copy(machine.bytes); put(machine.bytes, 0x56e258, 0x720000);
    machine.externalCalls.set(0x720000, m => {nativeAllocations.push(m.bytes.readUInt32LE(m.r.ESP)); m.r.EAX = heap;});
    machine.externalCalls.set(0x568a50, m => {const address = m.bytes.readUInt32LE(m.r.ESP), value = m.bytes.readInt32LE(m.r.ESP + 4), size = m.bytes.readUInt32LE(m.r.ESP + 8); m.bytes.fill(value & 255, address, address + size); m.r.EAX = address;});
    const compare = stage => {
      assert.deepEqual(nativeAllocations, allocations);
      for (const [address, length] of [[base, data.length], [heap, flagged.length * 28], [0x80df00, 8], [0x80f210, 4], [0x80f420, 256], [0x91d45c, 8]]) assert.deepEqual(machine.bytes.subarray(address, address + length), memory.subarray(address, address + length), `${entry.index}/${stage}/0x${address.toString(16)}`);
    };
    initializeTrackDeformation(runtime); machine.entry = 0x494c80; machine.r.ESP = stack; put(machine.bytes, stack, -1); steps += machine.run(5_000_000); compare('constructor');
    assert.equal(memory.readUInt32LE(0x80df00), flagged.length);
    for (let tick = 0; tick < 8; tick++) {updateTrackDeformation(runtime); machine.entry = 0x494f60; machine.r.ESP = stack; put(machine.bytes, stack, -1); steps += machine.run(5_000_000); compare(`tick${tick}`); frames++;}
    assert.equal(hash(data), before);
    animatedSegments += flagged.length;
    resources.push({resource: entry.index, sha256: before, sectors: scene.segments.length, animatedSegments: flagged.length, allocation: allocations[0] ?? 0, mutatedMappedBytes: memory.subarray(base, base + data.length).reduce((sum, value, index) => sum + (value !== data[index] ? 1 : 0), 0)});
  }
} finally {await archive.close();}
const summary = {resources: resources.length, resourcesWithAnimatedTerrain: resources.filter(row => row.animatedSegments).length, animatedSegments, frames, instructionSteps: steps};
await writeFile(output, JSON.stringify({method: 'Read-only installed Redux GFXM data, existing scene reader validates original segment/vertex bounds. Copies bytes into declared writable mapping, relocates only segment-table and primary-vertex pointers, publishes runtime segment/count/color roots from native44c2b0 loader fields. Actual494c80 constructor→eight494f60 updates compare all mapped resource/runtime row/phase/palette/dirty/reduction bytes against retained instructions. Force91ce90 bit2 deliberately enables animation, without claiming real camera/participant eligibility or complete47ea40/44c2b0 loading. malloc/memset explicit services. Original archive buffers and installed files remain unchanged; no original process/rendering.', evidence: [...own.evidence, ...math.evidence].map(item => item.evidence_id), summary, resources}, null, 2), {flag: 'wx'});
console.log(JSON.stringify({output, ...summary}));
