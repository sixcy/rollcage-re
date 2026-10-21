import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {awardWeightedPickup, initializePickupProbabilityTables} from '../src/pickup-award.mjs';
import storedProbabilities from '../src/pickup-probabilities.json' with {type: 'json'};

const {evidence, instructions} = await readInstructionEvidence(['176-lap-award-assembly.json'], {directory: 'analysis/native-simulation/results'});
const readEvidence = async name => {const reply = JSON.parse(await readFile(`analysis/native-simulation/results/${name}`, 'utf8')); return reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);};
const probabilityEvidence = await readEvidence('194-pickup-probability-tables.json'), switchEvidence = await readEvidence('195-pickup-switch-tables.json');
const tableBytes = Buffer.from(probabilityEvidence.normalized_result.bytes_hex, 'hex');
assert.equal(storedProbabilities.bytes_hex, tableBytes.toString('hex'));
assert.equal(storedProbabilities.sha256, createHash('sha256').update(tableBytes).digest('hex'));
let nativeItem, nativeRejected, nativeIterations;
const machine = new BoundedX86(instructions, {tables: [switchEvidence.normalized_result]});
for (const instruction of instructions) {
  const op = instruction.op;
  if ([0x47b9a6, 0x47bc90, 0x47bcd2].includes(instruction.address)) Object.defineProperty(instruction, 'op', {get() {
    if (instruction.address === 0x47b9a6) nativeIterations++;
    if (instruction.address === 0x47bc90) nativeRejected++;
    if (instruction.address === 0x47bcd2) nativeItem = machine.r.EBX & 255;
    return op;
  }});
}
let seed = 0x47b920ab;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const signed = () => random(0xffffffff) | 0;
const SESSION = 0x60000, BODIES = 0x20000, EXTERNAL = 0x10000, SPECIAL = 0x50000, PACKET = 0x8fec;
let instructionSteps = 0, awards = 0, secondaryAwards = 0, primaryAwards = 0, sends = 0, deniedAuthority = 0, noSlots = 0, fallbacks = 0, restrictedChoices = 0, controlledProbabilityFixtures = 0;
const fixtures = 6000, itemCounts = {}, modes = {};
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const bytes = machine.bytes;
  initializePickupProbabilityTables(bytes);
  for (let p = 0x8000; p < 0x9000; p++) bytes[p] = random(256);
  bytes.fill(0x73, 0x908000, 0x90b000); bytes.fill(0x53, EXTERNAL, EXTERNAL + 0x30c);
  bytes.fill(0xa5, SESSION, SESSION + 0x600); bytes.writeUInt32LE(SESSION, 0x5ecb1c);
  bytes.writeUInt32LE(0x36d4c921, 0x5e8890);
  const count = random(9), targetIndex = random(8), inList = fixture % 4 !== 0 && fixture % 17 !== 0;
  const record = inList ? 0x909300 + targetIndex * 0x30c : EXTERNAL, body = BODIES + targetIndex * 0x2000;
  const mode = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 255][fixture % 11];
  bytes[SESSION + 0x54d] = count; bytes[SESSION + 0x551] = mode;
  for (let index = 0; index < 8; index++) {
    const pointer = BODIES + index * 0x2000, other = 0x909300 + index * 0x30c;
    bytes.fill(0xa5, pointer, pointer + 0x2000); bytes.writeUInt32LE(pointer, other);
    bytes[pointer + 0x68c] = [255, 0, 1, 2, 3, 4, 5, 6, 7][random(9)];
    bytes[pointer + 0x68d] = [255, 0, 1, 2, 3, 4, 5, 6, 7][random(9)];
    bytes[pointer + 0x718] = fixture % 4 ? 0 : 8;
    bytes.writeUInt16LE(random(8), pointer + 0x65e);
    bytes.writeUInt32LE(fixture % 3 ? SPECIAL + index * 4 : 0xffffffff, pointer + 0x6bc); bytes[SPECIAL + index * 4] = random(3);
    bytes[other + 0x1c] = random(256); bytes[other + 0x1d] = random(9); bytes.writeInt32LE(signed(), other + 0x24);
  }
  bytes.writeUInt32LE(body, record);
  bytes[body + 0x68c] = fixture % 3 === 1 ? 255 : random(8);
  bytes[body + 0x68d] = fixture % 3 === 0 ? 255 : random(8);
  const playerIndex = bytes.readUInt16LE(body + 0x65e), reference = 0x90960c - playerIndex * 0x30c;
  bytes[reference + 0x1c] = random(256); bytes.writeInt32LE(signed(), reference + 0x24);
  bytes[record + 0x1c] = fixture % 17 ? random(256) : bytes[reference + 0x1c];
  if (fixture % 17 === 0) bytes.writeInt32LE((bytes.readInt32LE(reference + 0x24) + [0, 1, 0x7fff, 0x8000, -0x7ffe, -0x7fff, -0x8000][Math.floor(fixture / 17) % 7]) | 0, record + 0x24);
  bytes[record + 0x1d] = random(9);
  bytes.writeInt32LE([0, 1, -1, 0x7fffffff, -2147483648, signed()][fixture % 6], 0x5ec954);
  bytes.writeInt32LE(random(6), 0x6e9f68); bytes.writeInt32LE(fixture % 4 ? 0 : 1, 0x90cb80);
  bytes.writeUInt32LE((random(4) << 24) | (random(4) << 16) | (random(8) << 8) | random(256), 0x903500);
  const flags = [0, 1, 0x81, 0x83, 0x85, 0x87, 0xc7, 0xff][fixture % 8]; bytes.writeUInt32LE(flags, 0x6eafe0);
  bytes.writeInt32LE(fixture % 3 ? playerIndex : fixture % 2 ? -1 : random(8), 0x6e9f70);
  if (fixture % 13 === 0) {
    // Explicit synthetic one-hot table makes restriction/retry branches
    // reachable, including nine rejections of the same restricted item.
    bytes[SESSION + 0x551] = 0; bytes[body + 0x718] = 0; bytes[record + 0x1d] = 1;
    bytes.fill(0, 0x574ee0, 0x574ee8); bytes[0x574ee0 + (Math.floor(fixture / 13) % 8)] = 100;
    controlledProbabilityFixtures++;
  }
  const expectedMemory = Buffer.from(bytes), sourceLog = [], nativeLog = [];
  const service = (memory, log, request) => {
    log.push([request.ecx, request.args, memory.subarray(request.edx, request.edx + request.args[0]).toString('hex')]);
    // Header edits model a packet-router boundary and must preserve payload.
    memory[request.edx + 1] = fixture & 255; memory.writeUInt16LE(fixture & 65535, request.edx + 2);
    memory.writeInt32LE(fixture ^ 0x10203040, request.edx + 4); return 1;
  };
  const result = awardWeightedPickup(record, {memory: expectedMemory, packetAddress: PACKET,
    handlers: {call4a0420: request => service(expectedMemory, sourceLog, request)}});
  machine.externalCalls.set(0x4a0420, m => {m.r.EAX = service(bytes, nativeLog, {ecx: m.r.ECX, edx: m.r.EDX,
    args: [bytes.readInt32LE(m.r.ESP), bytes.readInt32LE(m.r.ESP + 4)]});});
  machine.externalCalls.set(0x568162, () => {});
  machine.r.ECX = record; machine.r.ESP = 0x9000; bytes.writeUInt32LE(0xffffffff, 0x9000);
  nativeItem = undefined; nativeRejected = 0; nativeIterations = 0;
  instructionSteps += machine.run();
  try {
    assert.equal(nativeItem, result.item, 'selected item'); assert.equal(nativeRejected, result.rejectedChoices, 'restriction counter'); assert.equal(nativeIterations, result.iterations, 'weighted iterations');
    assert.deepEqual(nativeLog, sourceLog, 'network packet/call');
    assert.deepEqual(bytes.subarray(BODIES, BODIES + 8 * 0x2000), expectedMemory.subarray(BODIES, BODIES + 8 * 0x2000), 'complete bodies');
    assert.deepEqual(bytes.subarray(0x908000, 0x90b000), expectedMemory.subarray(0x908000, 0x90b000), 'ordinary and reverse-indexed records');
    assert.deepEqual(bytes.subarray(EXTERNAL, EXTERNAL + 0x30c), expectedMemory.subarray(EXTERNAL, EXTERNAL + 0x30c), 'external record');
    assert.deepEqual(bytes.subarray(PACKET, PACKET + 12), expectedMemory.subarray(PACKET, PACKET + 12), 'retained packet');
    assert.equal(bytes.readInt32LE(0x5ec954), expectedMemory.readInt32LE(0x5ec954), 'single RNG transition');
    for (const p of [0x5ecb1c, 0x6e9f68, 0x6e9f70, 0x6eafe0, 0x903500, 0x90cb80]) assert.equal(bytes.readInt32LE(p), expectedMemory.readInt32LE(p), `global ${p.toString(16)}`);
    assert.deepEqual(bytes.subarray(SESSION, SESSION + 0x600), expectedMemory.subarray(SESSION, SESSION + 0x600));
  } catch (error) {console.error(JSON.stringify({fixture, record, targetIndex, playerIndex, mode: bytes[SESSION + 0x551], count, result, nativeItem, nativeRejected, nativeIterations, sourceLog, nativeLog})); throw error;}
  itemCounts[result.item] = (itemCounts[result.item] ?? 0) + 1;
  modes[bytes[SESSION + 0x551]] = (modes[bytes[SESSION + 0x551]] ?? 0) + 1;
  if (result.slot) {awards++; if (result.slot === 0x68d) secondaryAwards++; else primaryAwards++;}
  else if ((flags & 129) === 129 && playerIndex !== (bytes.readInt32LE(0x6e9f70) === -1 ? 0 : bytes.readInt32LE(0x6e9f70))) deniedAuthority++;
  else noSlots++;
  sends += nativeLog.length; if (result.rejectedChoices === 9) fallbacks++; restrictedChoices += result.rejectedChoices;
}
const report = {method: 'Complete47b920 weighted pickup selection interpreted with original two switch tables and retained probability bytes. Compares selected item, iteration/restriction counts, all eight8192-byte bodies, standard/reverse-indexed and external vehicle records, globals, one RNG transition and all12 packet bytes plus call4a0420 arguments/order. Outgoing packet router and cookie check are explicit fixtures; no weapon-use, original process or network execution claim. Includes recorded tables and declared one-hot probability overrides, zero/one/eight vehicles, rank0..8, difficulty0..5, all modes, external/aliased body records, authority denial, occupied slots and stale packet payload high bits.',
  evidence: [...evidence, probabilityEvidence, switchEvidence].map(item => item.evidence_id), instructions: instructions.length, fixtures,
  controlledProbabilityFixtures, awards, secondaryAwards, primaryAwards, sends, deniedAuthority, noSlots, fallbacks, restrictedChoices, itemCounts, modes, instructionSteps, matched: true};
await writeFile('analysis/pickup-award-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
