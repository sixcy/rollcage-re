import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {updateDynamicLights, allocateDynamicLight, insertDynamicLightRanges, removeDynamicLightRanges, updateDynamicLightPosition, updateVehicleDynamicLight} from '../src/dynamic-light-state.mjs';
import {initializeBodyRetirementEffectTables, appendRawBodyFlash} from '../src/body-retirement-effects.mjs';
import {appendBodyPositionEffect} from '../src/body-retirement.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
export const lightAddresses = {rows: 0x40000, indices: 0x43000, buckets: 0x45000, segments: 0x48000, bounds: 0x49000, ranges: 0x4c000, position: 0x4d000, color: 0x4d100, authored: 0x4d200, bands: 0x50000, bodies: 0x60000, palette: 0x90000, stack: 0x9000};

export function createDynamicLightFixture(fixture) {
  const memory = Buffer.alloc(0xa00000), a = lightAddresses;
  initializeBodyRetirementEffectTables(memory); memory.fill(0xa5, a.stack - 0x1000, a.stack + 64); memory.writeFloatLE(1 / 4096, 0x5dc5f4);
  put(memory, 0x909254, a.rows); put(memory, 0x909278, a.buckets); put(memory, 0x909240, a.segments); put(memory, 0x9092c0, a.bounds); put(memory, 0x90924c, a.ranges);
  for (let row = 0; row < 256; row++) {word(memory, a.rows + row * 16, 0xff00); word(memory, a.rows + row * 16 + 2, 255); put(memory, a.rows + row * 16 + 12, a.indices);}
  for (let column = 0; column < 256; column++) word(memory, a.indices + column * 2, 0);
  put(memory, a.buckets, 1 | (2 << 7) | (2 << 1)); put(memory, a.buckets + 4, 0); word(memory, a.bounds, 32); word(memory, a.bounds + 2, 1);
  for (let sector = 0; sector < 3; sector++) {const segment = a.segments + 0x100 + sector * 0x100; put(memory, a.segments + sector * 4, segment); put(memory, segment + 12, 64); put(memory, 0x80f220 + sector * 4, a.bands + sector * 0x1000);}
  put(memory, a.position, (fixture % 5 - 2) << 24); put(memory, a.position + 4, fixture * 1234); put(memory, a.position + 8, (fixture % 7 - 3) << 24); put(memory, a.color, fixture ^ 0x1234abcd); put(memory, a.authored, (32 << 20) | (16 << 8) | 1);
  const exhausted = fixture % 59 === 0, count = exhausted ? 71 : [1, 2, 6, 10][fixture % 4];
  put(memory, 0x80f20c, count); put(memory, 0x80f214, fixture % 11 === 0 ? count : 1); put(memory, 0x80f210, fixture % 8); put(memory, 0x5ec958, [0, 1, 0x7fffffff, -1, 0x12345678][fixture % 5]);
  for (let dirty = 0; dirty < fixture % 8; dirty++) put(memory, 0x80f420 + dirty * 4, ((dirty % 8) << 29) | (dirty * 37));
  for (let index = 1; index < count; index++) {
    const light = 0x80f520 + index * 64, body = a.bodies + (index % 10) * 0x4000, kind = exhausted ? 4 : [0, 1, 2, 3, 4, 5, 6, 7, 8][(fixture + index) % 9];
    word(memory, light + 0x24, kind); word(memory, light + 0x26, [-32768, -1, 0, 1, 2, 33][(fixture + index) % 6]); word(memory, light + 16, [8, 9, 10, 11, 12][fixture % 5]); word(memory, light + 18, [0, 1, 2, 65535][(fixture + index) % 4]); put(memory, light + 12, 0xab123456);
    for (let lane = 0; lane < 3; lane++) {put(memory, light + lane * 4, (fixture % 3 - 1) << 24); put(memory, body + 0x34 + lane * 4, ((fixture + lane + index) % 5 - 2) << 24); put(memory, body + 0x68 + lane * 4, (index + lane + 1) << 24);}
    put(memory, body + 0x188, fixture % 4 === 0 ? 0 : fixture % 4 === 1 ? 16 : 1); put(memory, light + 0x34, body); put(memory, light + 0x30, kind === 1 && fixture % 2 ? body : 0);
    for (let lane = 0; lane < 3; lane++) {memory[body + 0x1b4 + lane] = (fixture + lane * 67) & 255; memory[body + 0x2a3d + lane] = (fixture * 3 + lane * 73) & 255; memory[body + 0x2e78 + lane] = (fixture * 11 + lane * 71) & 255;}
    memory[body + 0x2e7c] = fixture & 255; memory[body + 0x2e7d] = fixture % 3; put(memory, body + 0x664, [-1, 0, 0x200000, 0x3fffff, 0x400000, 0x7fffffff][fixture % 6]);
    for (let lane = 0; lane < 10; lane++) word(memory, body + 0xc4 + lane * 2, lane % 4 === 0 ? 4096 : (fixture * lane * 19) & 65535);
    put(memory, light + 0x28, kind === 1 && fixture % 3 ? a.palette : 0); word(memory, light + 0x2c, fixture % 5); word(memory, light + 0x2e, 4);
    const queued = 0x90b688 + (index - 1) * 8; for (let lane = 0; lane < 3; lane++) word(memory, queued + lane * 2, ((fixture + index + lane) % 7 - 3) * 256); word(memory, queued + 6, fixture % 3 ? 1 : 0);
    insertDynamicLightRanges(index, a.authored, {memory});
  }
  for (let color = 0; color < 8; color++) word(memory, a.palette + color * 2, (fixture * 71 + color * 701) & 65535);
  const queuedCount = fixture % 3;
  put(memory, 0x810920, queuedCount);
  for (let index = 0; index < queuedCount; index++) {
    const item = 0x8106e0 + index * 36;
    for (let lane = 0; lane < 3; lane++) put(memory, item + lane * 4, (index + lane) << 24);
    put(memory, item + 12, 0xff573311); word(memory, item + 16, fixture % 5 + 8); word(memory, item + 18, [1, 2, 3][fixture % 3]); word(memory, item + 20, 5);
    put(memory, item + 24, a.bodies); put(memory, item + 28, fixture % 2 ? 0 : a.bodies); put(memory, item + 32, 123);
  }
  put(memory, 0x5e8890, 0x44d96031);
  return {memory, fixture, scratchBase: a.stack};
}

export async function verifyDynamicLightState({fixtures = 3000, output = 'analysis/dynamic-light-state-instruction-check.json'} = {}) {
  const directory = 'analysis/native-simulation/results';
  const {instructions, evidence} = await readInstructionEvidence(['1161-race-final-stage-44d960-assembly.json', '1165-dynamic-stage-allocation-assembly.json', '1167-dynamic-stage-remove-assembly.json', '1173-dynamic-stage-spatial-insert-assembly.json', '1175-dynamic-stage-kind8-assembly.json', '1180-dynamic-stage-transform-assembly.json', '1182-dynamic-stage-position-update-assembly.json', '665-retirement-4286e0-assembly.json', '669-retirement-4746f0-assembly.json', '667-retirement-44d230-assembly.json', '657-retirement-436410-assembly.json', '671-retirement-436490-assembly.json'], {directory});
  const switchReply = JSON.parse(await readFile(`${directory}/1178-dynamic-stage-switch.json`, 'utf8')), switchEvidence = switchReply.structuredContent, machine = new BoundedX86(instructions), a = lightAddresses;
  let steps = 0, scriptedCalls = 0, cookies = 0, producerChains = 0; const visits = new Map(), watched = new Set([0x44d960, 0x44d7a0, 0x44d6a0, 0x44d5b0, 0x44df50, 0x44d8a0, 0x4334b0, 0x4286e0, 0x44d230, 0x436410, 0x436490]);
  machine.onInstruction = address => {if (watched.has(address)) visits.set(address, (visits.get(address) ?? 0) + 1);};
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX | 0, m.bytes.readInt32LE(0x5e8890)); cookies++;});
  const ranges = [[0x80f20c, 0x1718], [0x90b688, 80], [a.bands, 0x3000], [a.bodies, 0x28000], [0x5ec958, 4], [0x91d360, 20], [0x91d3e4, 8], [0x91d448, 12], [0x91cdc0, 44]];
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const source = createDynamicLightFixture(fixture), sourceLog = [], nativeLog = [];
    Buffer.from(switchEvidence.normalized_result.bytes_hex, 'hex').copy(source.memory, Number(switchEvidence.normalized_result.address));
    machine.reset(); source.memory.copy(machine.bytes);
    if (fixture % 12 === 4) {
      for (const [entry, producer] of [[0x436410, appendBodyPositionEffect], [0x436490, appendRawBodyFlash]]) {
        producer(a.position, fixture % 32, source); machine.entry = entry; machine.r.ECX = a.position; machine.r.EDX = fixture % 32; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); steps += machine.run();
      }
      producerChains++;
    }
    const script = (memory, body, log) => {log.push(body); put(memory, body + 0x68, ((fixture % 5) + 1) << 24); put(memory, body + 0x6c, 0); put(memory, 0x5ec958, (fixture * 37) | 0);};
    machine.externalCalls.set(0x476550, m => {script(m.bytes, m.r.ECX >>> 0, nativeLog); scriptedCalls++;});
    const runtime = {...source, handlers: {call476550: request => script(source.memory, request.ecx, sourceLog)}};
    let entry, expected;
    if (fixture % 6 === 0) {entry = 0x44d7a0; expected = allocateDynamicLight(a.position, a.color, fixture % 5 + 8, runtime); machine.r.ECX = a.position; machine.r.EDX = a.color; put(machine.bytes, a.stack + 4, fixture % 5 + 8);}
    else if (fixture % 6 === 1) {entry = 0x44d5b0; insertDynamicLightRanges(1, a.authored, runtime); machine.r.ECX = 1; machine.r.EDX = a.authored;}
    else if (fixture % 6 === 2) {entry = 0x44d6a0; removeDynamicLightRanges(1, runtime); machine.r.ECX = 1;}
    else if (fixture % 6 === 3) {entry = 0x44d8a0; updateDynamicLightPosition(1, a.position, runtime); machine.r.ECX = 1; machine.r.EDX = a.position;}
    else {entry = 0x44d960; const intermediate = fixture % 2; updateDynamicLights(intermediate, runtime); machine.r.ECX = intermediate;}
    machine.entry = entry; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1);
    try {
      steps += machine.run(1_000_000); if (expected !== undefined) assert.equal(machine.r.EAX >>> 0, expected >>> 0); assert.deepEqual(nativeLog, sourceLog);
      for (const [address, length] of ranges) if (!machine.bytes.subarray(address, address + length).equals(source.memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, index) => value !== source.memory[address + index]); assert.fail(`fixture${fixture}/entry${entry.toString(16)} byte${(address + offset).toString(16)} native${machine.bytes[address + offset]} JS${source.memory[address + offset]}`);}
    } catch (error) {console.error({fixture, entry: entry.toString(16), sourceLog, nativeLog}); throw error;}
  }
  const report = {method: 'Complete44d960 dynamic colored-light parent,44d7a0 pool allocation,44d6a0 range removal/dirty queue,44d5b0 range insertion,44df50 vehicle RGB pulse/short transform,44d8a0 cell movement with actual4286e0/4746f0/44d230 spatial/range helpers. Actual436410/436490 runtime queue producers connected before selected final-substep cases. Scripted body476550 is the sole remaining reached game contract; it mutates real body/RNG state before actual native position integration and re-registration. Compiler cookies explicit; no original-process execution. Compares complete light/queue/band/body/dirty/RNG/renderer scratch bytes and script call order. Source-owned pool/terrain/body/script/queued producers remain explicit.', evidence: [...evidence, switchEvidence].map(item => item.evidence_id), instructions: instructions.length, fixtures, producerChains, scriptedCalls, cookieChecks: cookies, instructionSteps: steps, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyDynamicLightState()));
