import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {pollInputPacket, decodeAnalogVehicleInput, convertInputPacket, transformInputAxis, initializeVehicleInputConstants} from '../src/vehicle-input-packets.mjs';

const evidence = await readInstructionEvidence(['461-physical-input-packet-assembly.json', '463-analog-input-decode-assembly.json'], {directory: 'analysis/native-simulation/results'});
const machine = new BoundedX86(evidence.instructions), memory = Buffer.alloc(0xa00000), STACK = 0x9000, CONFIG = 0x20000, BODY = 0x30000, PACKET = 0x50000, STATUS = 0x10000, POINTER = 0x11000;
let seed = 0x471250ab, instructionSteps = 0, transforms = 0, axes = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const signed = () => random(0xffffffff) | 0;
const fixtures = 4000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); machine.reset(); const analog = fixture % 2, index = random(6), flags = [0, 1, 3, 5, 7, 0x81, 0x83, 0x85, 0x87][Math.floor(fixture / 2) % 9];
  memory.writeUInt32LE(CONFIG, 0x5ecefc); memory[CONFIG + 0x37] = fixture % 3 ? 0 : 1;
  memory.writeInt32LE(flags, 0x6eafe0); memory.writeInt32LE(random(4), 0x6e675c); memory.writeInt32LE(fixture % 7 ? 0 : 1, 0x5eb518);
  memory.writeInt32LE([0, 1, 100, -1, -0x80000000][random(5)], 0x6ea69c); memory.writeInt32LE([-1, 0, 1, 3, 5][random(5)], 0x6e9f70);
  for (let device = 0; device < 6; device++) {
    const base = device * 0x67c;
    for (let offset = 0; offset < 0x67c; offset += 4) memory.writeInt32LE(signed(), 0x6e7880 + base + offset);
    memory.writeInt32LE(fixture % 5 ? 1 : 0, 0x6e7880 + base);
    const clock = memory.readUInt32LE(0x6ea69c);
    for (let row = 0; row < 64; row++) memory.writeUInt32LE((clock + [0, 1, -1, -64, -65, random(200) - 100][random(6)]) >>> 0, 0x6e7bd8 + base + row * 12);
    const body = BODY + device * 0x4000, record = 0x909300 + device * 0x30c;
    memory.fill(0xa5, body, body + 0x4000); memory.writeUInt32LE(body, record); memory[record + 0x25e] = random(8);
    memory.writeUInt32LE(PACKET + device * 32, body + 0x724); memory[PACKET + device * 32 + 8] = random(256); memory[PACKET + device * 32 + 9] = random(256); memory[PACKET + device * 32 + 10] = random(256);
  }
  const status = fixture % 11 === 0 ? 0x6e7ac6 + index * 0x67c : STATUS, pointer = fixture % 13 === 0 ? 0x6e7edf + index * 0x67c : POINTER;
  const ranges = [[0x6e675c, 0x4900], [BODY, 6 * 0x4000], [0x909300, 6 * 0x30c], [PACKET, 192], [CONFIG, 0x40], [STATUS, 8], [POINTER, 4], [0x5ecefc, 4], [0x5eb518, 4]];
  for (const [address, length] of ranges) memory.copy(machine.bytes, address, address, address + length);
  const sourceCalls = [], nativeCalls = [];
  const packetTransform = (target, packet, source, log) => {
    log.push(['packet', packet, Buffer.from(target.subarray(source, source + 8))]);
    // Explicit state mutation probes the parent's live post-transform flags.
    target.writeInt32LE(target.readInt32LE(source) ^ 0x12345678, packet);
    if (fixture % 7 === 0) {target.writeUInt32LE(0x81, 0x6eafe0); target.writeInt32LE(-1, 0x6e9f70);}
  };
  const axisTransform = (target, value, brake, log) => {
    log.push(['axis', value, brake]);
    const record = 0x909300 + index * 0x30c, body = BODY + index * 0x4000;
    if (fixture % 3 === 0) {target[record + 0x25e] ^= 3; target.writeUInt32LE(PACKET + ((index + 1) % 6) * 32, body + 0x724); target.writeUInt32LE(BODY, record);}
    return ((value ^ 0x73) + brake) & 255;
  };
  if (analog) decodeAnalogVehicleInput(index, {memory, transformAxis: (value, brake) => axisTransform(memory, value, brake, sourceCalls)});
  else pollInputPacket(index, pointer, status, {memory, transformPacket: (packet, source) => packetTransform(memory, packet, source, sourceCalls)});
  machine.externalCalls.set(0x433200, m => packetTransform(m.bytes, m.bytes.readUInt32LE(m.r.ESP), m.r.EDX, nativeCalls));
  machine.externalCalls.set(0x434210, m => {m.r.EAX = axisTransform(m.bytes, m.r.ECX & 255, m.bytes.readInt32LE(m.r.ESP), nativeCalls);});
  machine.entry = analog ? 0x434360 : 0x471250; machine.r.ESP = STACK; machine.bytes.writeUInt32LE(0xffffffff, STACK); machine.r.ECX = index; machine.r.EDX = status; machine.bytes.writeUInt32LE(pointer, STACK + 4);
  instructionSteps += machine.run(); assert.deepEqual(nativeCalls, sourceCalls, `calls ${fixture}`);
  for (const [address, length] of ranges) assert.deepEqual(machine.bytes.subarray(address, address + length), memory.subarray(address, address + length), `fixture ${fixture}/${address.toString(16)}`);
  transforms += sourceCalls.filter(call => call[0] === 'packet').length; axes += sourceCalls.filter(call => call[0] === 'axis').length;
}
const children = await readInstructionEvidence(['465-input-packet-transform-assembly.json', '467-input-axis-transform-assembly.json', '469-input-axis-pow-thunk-assembly.json'], {directory: 'analysis/native-simulation/results'});
const constantReply = JSON.parse(await readFile('analysis/native-simulation/results/470-input-axis-float-constants.json', 'utf8'));
const constantEvidence = constantReply.structuredContent ?? JSON.parse(constantReply.content.find(item => item.type === 'text').text);
const retainedConstants = Buffer.from(constantEvidence.normalized_result.bytes_hex, 'hex');
initializeVehicleInputConstants(memory);
for (const [offset, length] of [[4, 4], [0xb0, 4], [0x210, 8], [0x354, 4]]) assert.deepEqual(memory.subarray(0x5dc680 + offset, 0x5dc680 + offset + length), retainedConstants.subarray(offset, offset + length));
const instructions = [...evidence.instructions, ...children.instructions], full = new BoundedX86(instructions), fullFixtures = 4000;
let powerCalls = 0, lazyInitializations = 0, conversions = 0;
const entryCounts = {};
for (let fixture = 0; fixture < fullFixtures; fixture++) {
  memory.fill(0); full.reset(); initializeVehicleInputConstants(memory); const entry = [0x471250, 0x434360, 0x433200, 0x434210][fixture % 4], index = random(6), offset = index * 0x67c;
  entryCounts[entry.toString(16)] = (entryCounts[entry.toString(16)] ?? 0) + 1;
  memory.writeUInt32LE(0x123456, 0x56e4d4); memory.writeUInt32LE(CONFIG, 0x5ecefc); memory[CONFIG + 0x37] = fixture % 3 ? 0 : 1;
  memory.writeUInt32LE([0, 1, 3, 7, 0x81, 0x83][Math.floor(fixture / 4) % 6], 0x6eafe0); memory.writeUInt32LE(fixture % 4, 0x6e675c);
  memory.writeInt32LE(fixture % 13 ? 0 : 1, 0x5eb518); memory.writeUInt32LE([0, 64, 100, 0xffffffff, 0x80000000][random(5)], 0x6ea69c); memory.writeInt32LE([-1, 0, 1, 3, 5][random(5)], 0x6e9f70);
  const initialized = fixture % 3 !== 0; memory.writeUInt32LE(initialized ? 1 : 0, 0x6e65b0);
  for (let address = 0x6fb740; address < 0x6fb944; address += 4) memory.writeInt32LE(fixture % 11 === 0 ? signed() : random(200), address);
  for (let device = 0; device < 6; device++) {
    const base = device * 0x67c, record = 0x909300 + device * 0x30c, body = BODY + device * 0x4000;
    for (let p = 0x6e7880 + base; p < 0x6e7880 + base + 0x67c; p += 4) memory.writeInt32LE(signed(), p);
    memory.writeUInt32LE(fixture % 17 ? 1 : 0, 0x6e7880 + base);
    for (let row = 0; row < 64; row++) memory.writeUInt32LE((memory.readUInt32LE(0x6ea69c) + [0, 1, -1, -64, -65][random(5)]) >>> 0, 0x6e7bd8 + base + row * 12);
    memory.fill(0xa5, body, body + 0x4000); memory.writeUInt32LE(body, record); memory.writeUInt16LE(random(65536), record + 0x25e);
    memory.writeUInt32LE(PACKET + device * 32, body + 0x724);
    for (let axis = 8; axis <= 10; axis++) memory[PACKET + device * 32 + axis] = random(256);
  }
  const packet = fixture % 7 === 0 ? STATUS + 2 : PACKET, status = fixture % 13 === 0 ? 0x6e7ede + offset : STATUS, pointer = fixture % 17 === 0 ? 0x6e7edf + offset : POINTER;
  memory.writeInt32LE(signed(), status); memory[status + 5] = random(256); memory[status + 6] = random(256);
  const value = fixture % 7 === 0 ? random(65536) - 32768 : random(256), brake = (fixture >>> 2) & 1;
  const ranges = [[0x6e65b0, 4], [0x6e675c, 0x4900], [0x6fb740, 0x204], [BODY, 6 * 0x4000], [0x909300, 6 * 0x30c], [PACKET, 192], [CONFIG, 0x40], [STATUS, 32], [POINTER, 4], [0x5ecefc, 4], [0x5eb518, 4], [0x5dc680, 864], [0x56e4d4, 4]];
  for (const [address, length] of ranges) memory.copy(full.bytes, address, address, address + length);
  const sourcePower = [], nativePower = [], pow = (base, exponent) => {sourcePower.push([base, exponent]); return Math.pow(base, exponent);};
  let returned;
  if (entry === 0x471250) pollInputPacket(index, pointer, status, {memory});
  else if (entry === 0x434360) decodeAnalogVehicleInput(index, {memory, pow});
  else if (entry === 0x433200) convertInputPacket(index, packet, status, {memory});
  else returned = transformInputAxis(value, brake, {memory, pow});
  full.externalCalls.set(0x123456, m => {const base = m.scalars.XMM0, exponent = m.scalars.XMM1; nativePower.push([base, exponent]); m.scalars.XMM0 = Math.pow(base, exponent);});
  full.entry = entry; full.r.ESP = STACK; full.bytes.writeUInt32LE(0xffffffff, STACK); full.r.ECX = entry === 0x434210 ? value : index; full.r.EDX = status; full.bytes.writeUInt32LE(entry === 0x433200 ? packet : entry === 0x434210 ? brake : pointer, STACK + 4);
  instructionSteps += full.run(); assert.deepEqual(nativePower, sourcePower, `power args ${fixture}`);
  if (returned !== undefined) assert.equal(full.r.EAX >>> 0, returned >>> 0, `axis EAX ${fixture}`);
  for (const [address, length] of ranges) assert.deepEqual(full.bytes.subarray(address, address + length), memory.subarray(address, address + length), `actual ${fixture}/${address.toString(16)}`);
  powerCalls += sourcePower.length; if (sourcePower.length) lazyInitializations++; if (entry === 0x433200 || entry === 0x471250) conversions++;
}
const report = {method: 'Four complete target-owned procedures471250/433200/434360/434210.4000 actual-child fixtures run packet conversion and axis lazy initialization, with only the confirmedCRT __libm_sse2_pow thunk represented by a numeric Math.pow service; checks its exact double arguments and every generated dword.4000 additional parent-boundary fixtures probe post-callee flags/mask/pointer mutations. Full device/history/output packet regions, six bodies/records, table/initialization flag, globals and scalar return/order compared. Unsigned history ages/ties, source/status/output aliases, stale custom tables, signed16 axis values and digital bit permutations. Source constants separately checked against retained470 bytes. No original process/device execution.', evidence: [...evidence.evidence, ...children.evidence, constantEvidence].map(item => item.evidence_id), instructions: instructions.length, fixtures: fixtures + fullFixtures, boundaryFixtures: fixtures, actualChildFixtures: fullFixtures, entryCounts, transforms, axes, conversions, powerCalls, lazyInitializations, instructionSteps, matched: true};
await writeFile('analysis/vehicle-input-packets-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
