import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeDynamicLightStorage, initializeAuthoredDynamicLights, initializeDynamicLightAttenuation} from '../src/dynamic-light-state.mjs';

export const lightConstructionAddresses = {pack: 0x40000, otherPack: 0x41000, sectors: 0x42000, segments: 0x43000, authored: 0x50000, palettes: 0x60000, scripts: 0x61000, auxiliary: 0x62000, spawns: 0x64000, arena: 0x70000, attenuation: 0x90000, bands: 0xa0000, stack: 0x9000};
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address), word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);

export function createDynamicLightConstructionFixture(fixture) {
  const memory = Buffer.alloc(0xa00000), a = lightConstructionAddresses, sectorCount = fixture % 5, authoredCount = sectorCount ? Math.floor(fixture / 5) % 6 : 0;
  memory.fill(0x55, 0x80f140, 0x810930); memory.fill(0x71, a.arena, a.arena + 0x2000); memory.fill(0xa5, a.stack - 0x1000, a.stack + 64); memory.fill(0x4e, a.attenuation, a.attenuation + 4096); memory.fill(0xcc, a.bands, a.bands + 0x4000);
  put(memory, 0x6e6ca8, fixture % 2 ? a.attenuation : 0); put(memory, 0x90b98c, a.pack); put(memory, a.pack, a.sectors); put(memory, a.pack + 16, sectorCount); put(memory, a.otherPack + 16, 99);
  for (let index = 0; index < sectorCount; index++) {put(memory, a.sectors + index * 4, a.segments + index * 0x100); put(memory, a.segments + index * 0x100 + 12, [0, 1, 15, 16, 17, 31, 32, 63, 127][(fixture + index) % 9]);}
  put(memory, 0x909268, authoredCount); put(memory, 0x90926c, a.authored); put(memory, 0x9092ac, a.palettes); put(memory, 0x9092b4, a.scripts); put(memory, 0x90b990, a.auxiliary); put(memory, a.auxiliary + 0xa8, a.spawns);
  put(memory, 0x902eec, a.arena); put(memory, 0x70dcf4, fixture % 4); put(memory, 0x6e6b44, [-1, 0, 510, 511, 512, 513][fixture % 6]);
  for (let spawn = 0; spawn < 256; spawn++) {word(memory, a.spawns + spawn * 8, spawn * 257); word(memory, a.spawns + spawn * 8 + 2, -spawn * 79); word(memory, a.spawns + spawn * 8 + 4, spawn * 37);}
  for (let index = 0; index < 4; index++) {word(memory, a.palettes + index * 2, 256 + index * 8); word(memory, a.scripts + index * 2, 128 + index * 16); word(memory, a.scripts + 128 + index * 16, 5);}
  if (fixture % 7 === 0) word(memory, a.palettes + 6, 240); //Unsigned wrapped palette length is retained.
  for (let index = 0; index < authoredCount; index++) {
    const record = a.authored + index * 32;
    memory[record] = (fixture + index * 17) & 255; memory[record + 1] = (fixture * 7 + index * 19) & 255; memory[record + 2] = (fixture * 11 + index) & 255;
    word(memory, record + 6, [0, 1, -1, -32768, 32767][index]); word(memory, record + 8, fixture * 173); word(memory, record + 10, -fixture * 71);
    memory[record + 12] = (fixture + index) & 255; memory[record + 13] = (fixture + index) % 3; memory[record + 14] = (fixture + index) % 3; memory[record + 15] = [0, 1, 7, 127, 255][index];
    for (let range = 0; range < 4; range++) put(memory, record + 16 + range * 4, range > index % 4 ? 0 : ((index + range + 1) << 20) | (index << 8));
    //Sector0 with first0/end1 is nonzero and always in the first band.
  }
  return {memory, fixture, sectorCount, authoredCount, scratchBase: a.stack};
}

export function createDynamicLightHeap(context, log) {
  const {memory, fixture} = context, a = lightConstructionAddresses;
  return size => {
    log.push(size >>> 0);
    if (size !== 4096 && fixture % 7 === 0) {put(memory, 0x90b98c, a.otherPack); if (context.sectorCount > 1) put(memory, a.pack + 16, context.sectorCount - 1);}
    return fixture % 23 === 0 ? 0 : size === 4096 ? a.attenuation : a.bands;
  };
}

export async function verifyDynamicLightConstruction({fixtures = 1600, output = 'analysis/dynamic-light-construction-instruction-check.json'} = {}) {
  const own = await readInstructionEvidence(['1252-light-sector-construction-assembly.json', '1256-light-sector-storage-release-assembly.json', '1248-light-pool-reset-assembly.json', '1173-dynamic-stage-spatial-insert-assembly.json'], {directory: 'analysis/native-simulation/results'}), machine = new BoundedX86(own.instructions), a = lightConstructionAddresses;
  let steps = 0, allocations = 0, bytesRequested = 0, generatedBodies = 0; const visits = new Map(), watched = new Set([0x48ef30, 0x48eeb0, 0x44e220, 0x44d5b0]);
  machine.onInstruction = address => {if (watched.has(address)) visits.set(address, (visits.get(address) ?? 0) + 1);};
  machine.externalCalls.set(0x568a50, m => {const destination = m.bytes.readUInt32LE(m.r.ESP), value = m.bytes.readUInt32LE(m.r.ESP + 4), length = m.bytes.readUInt32LE(m.r.ESP + 8); m.bytes.fill(value & 255, destination, destination + length); m.r.EAX = destination;});
  const ranges = [[0, 4096], [0x6e6ca8, 4], [0x6e6b44, 4], [0x70dcf4, 4], [0x70e1fc, 520 * 4], [0x80f140, 0x17f0], [a.arena, 0x2000], [a.attenuation, 4096], [a.bands, 0x4000], [0x90b98c, 4], [a.pack, 0x20]];
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const source = createDynamicLightConstructionFixture(fixture), sourceLog = [], nativeLog = [], sourceHeap = createDynamicLightHeap(source, sourceLog);
    machine.reset(); source.memory.copy(machine.bytes);
    const nativeHeap = createDynamicLightHeap({...source, memory: machine.bytes}, nativeLog);
    put(machine.bytes, 0x56e258, 0x710000); machine.externalCalls.set(0x710000, m => {m.r.EAX = nativeHeap(m.bytes.readUInt32LE(m.r.ESP));});
    const call = entry => {machine.entry = entry; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); steps += machine.run(1_000_000);};
    const compare = stage => {
      assert.deepEqual(nativeLog, sourceLog, `heap${fixture}/${stage}`);
      for (const [address, length] of ranges) if (!machine.bytes.subarray(address, address + length).equals(source.memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, index) => value !== source.memory[address + index]); assert.fail(`fixture${fixture}/${stage} byte${(address + offset).toString(16)} native${machine.bytes[address + offset]} JS${source.memory[address + offset]}`);}
    };
    try {
      initializeDynamicLightStorage({...source, handlers: {allocate: sourceHeap}}); call(0x48ef30); compare('storage');
      initializeAuthoredDynamicLights(source); call(0x44e220); compare('authored');
      //Cached attenuation is a strict no-op, including a valid nonzero pointer.
      if (source.memory.readUInt32LE(0x6e6ca8)) {initializeDynamicLightAttenuation({...source, handlers: {allocate: sourceHeap}}); call(0x48eeb0); compare('cached');}
    } catch (error) {console.error({fixture, sourceLog, nativeLog}); throw error;}
    allocations += sourceLog.length; bytesRequested += sourceLog.reduce((sum, value) => sum + value, 0); generatedBodies += (source.memory.readUInt32LE(0x70dcf4) - fixture % 4) / 384;
  }
  const report = {method: 'Complete48ef30 sector band/pool reset with actual48eeb0 attenuation producer, followed by actual44e220 authored light/scripted-body construction and44d5b0 registration. Only CRT malloc/memset are admitted services. Caller-owned loaded pack segment dimensions,32-byte authored rows,palette/script offset tables,spawn positions and body arena are explicit inputs. Compares complete bands/pool/dirty/queue/attenuation/body arena/registration/global bytes and allocation order,including aligned arena claims,signed512 registration limit,preservedFF gaps,u16 palette wrap,live captured-pack mutation and zero-return allocator buffer semantics. Cached attenuation is also checked. No original-process execution or safe host-null-page claim.', evidence: own.evidence.map(item => item.evidence_id), instructions: own.instructions.length, fixtures, allocations, bytesRequested, generatedBodies, instructionSteps: steps, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), matched: true};
  if (output) {
    try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});}
    catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report, 'Existing report differs; choose a new output filename.');}
  }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyDynamicLightConstruction()));
