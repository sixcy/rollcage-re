import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {initializeAutonomousWeaponTables, updateAutonomousWeaponPolicy, decideAutonomousItem00, decideAutonomousItem01, decideAutonomousItem02, decideAutonomousItem03, decideAutonomousItem04, decideAutonomousItem07, hasAutonomousSpeedMarker, writeAutonomousObjectPosition} from '../src/autonomous-weapon-policy.mjs';

const own = await readInstructionEvidence(['420-autonomous-weapon-policy-assembly.json', '422-autonomous-weapon-item-00-assembly.json', '424-autonomous-weapon-item-01-assembly.json', '426-autonomous-weapon-item-02-assembly.json', '428-autonomous-weapon-item-03-assembly.json', '430-autonomous-weapon-item-04-assembly.json', '432-autonomous-weapon-item-07-assembly.json', '436-autonomous-weapon-blocker-assembly.json', '438-autonomous-weapon-position-assembly.json', '442-autonomous-weapon-normalize-assembly.json', '218-autonomous-route-direction-assembly.json', '211-autonomous-next-point-assembly.json', '229-autonomous-previous-point-assembly.json', '301-autonomous-typed-point-assembly.json', '223-autonomous-vector-normalize-small-assembly.json', '224-autonomous-vector-normalize-large-assembly.json', '227-autonomous-vector-length-assembly.json', '232-steering-dot-assembly.json'], {directory: 'analysis/native-simulation/results'});
const math = await readInstructionEvidence(['217-wheel-capacity-curve-assembly.json', '133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json']);
const tables = await Promise.all(['433-autonomous-weapon-dispatch-tables.json', '434-autonomous-weapon-threshold-tables.json', '439-autonomous-weapon-item00-rng-switch.json', '440-autonomous-weapon-item07-rng-switch.json'].map(async name => {const value = JSON.parse(await readFile(`analysis/native-simulation/results/${name}`, 'utf8')); return value.structuredContent ?? JSON.parse(value.content.find(item => item.type === 'text').text);}));
const instructions = [...own.instructions, ...math.instructions], machine = new BoundedX86(instructions, {tables: tables.map(item => item.normalized_result)});
initializeAutonomousWeaponTables(machine.bytes);
const sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8')); sqrt.values.forEach((value, index) => machine.bytes.writeUInt16LE(value, 0x5eb290 + index * 2));
const BODY = 0x10000, PACK = 0x20000, GROUP = 0x21000, POINTS = 0x30000, SESSION = 0x50000, RESOURCE = 0x60000, EVENTS = 0x62000, ROWS = 0x64000, LOCAL = 0x65000, MATERIAL = 0x67000, STACK = 0x9000;
const entries = [0x4103f0, 0x410780, 0x410f80, 0x411340, 0x410930, 0x411ba0, 0x410c90, 0x411b00, 0x411260], returns = Array(entries.length).fill(0), bodyChanges = Array(entries.length).fill(0), rngChanges = Array(entries.length).fill(0);
let seed = 0x411340ad, steps = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;}, signed = () => random(0xffffffff) | 0;
const fixtures = 18000;
const storeWords = (memory, address, values) => values.forEach((value, axis) => memory.writeInt32LE(value, address + axis * 4));
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const bytes = machine.bytes, ownIndex = random(6), count = random(7), group = random(3), index = random(16);
  bytes.fill(0, 0x909000, 0x90a550); bytes.fill(0, STACK - 1024, STACK + 32);
  bytes.writeUInt32LE(PACK, 0x90b98c); bytes.writeUInt32LE(GROUP, PACK + 0x60); bytes.writeUInt32LE(RESOURCE, 0x90b990); bytes.writeUInt32LE(SESSION, 0x5ecb1c);
  bytes[SESSION + 0x54d] = count; bytes[SESSION + 0x586] = random(6); bytes[SESSION + 0x58c] = random(3); bytes.writeInt32LE([0, 5, 6, 7][random(4)], SESSION + 0x57c); bytes.writeInt32LE([149, 150, 299, 300][random(4)], SESSION + 0x580);
  for (let selectedGroup = 0; selectedGroup < 3; selectedGroup++) {
    const address = GROUP + selectedGroup * 12, points = POINTS + selectedGroup * 0x1000;
    bytes.writeUInt16LE(16, address); bytes[address + 2] = random(2); bytes[address + 4] = random(2); bytes[address + 5] = selectedGroup; bytes.writeUInt32LE(points, address + 8);
    for (let point = 0; point < 16; point++) {bytes.writeInt16LE(selectedGroup === 1 ? point * 100 : 0, points + point * 16); bytes.writeInt16LE(0, points + point * 16 + 2); bytes.writeInt16LE(selectedGroup === 1 ? 0 : point * 100 * (selectedGroup === 2 ? -1 : 1), points + point * 16 + 4); bytes[points + point * 16 + 7] = fixture % 3 ? 255 : random(255);}
  }
  for (let bodyIndex = 0; bodyIndex < 6; bodyIndex++) {
    const body = bodyIndex === ownIndex ? BODY : 0x100000 + bodyIndex * 0x4000, record = 0x909300 + bodyIndex * 0x30c, selectedGroup = bodyIndex === ownIndex ? group : random(3);
    bytes.fill(0, body, body + 0x4000); bytes.writeUInt32LE(body, record); bytes[record + 0x1c] = random(6); bytes[record + 0x1d] = random(5) === 0 ? 1 : 0; bytes[record + 0x249] = random(4);
    bytes.writeInt32LE([-32769, -32768, -6001, -2999, -301, -101, 0, 100, 101, 300, 301, 2999, 3999, 4000, 5000, 5900, 6000, 32768, 32769][random(19)], record + 0x24);
    bytes.writeUInt32LE(GROUP + selectedGroup * 12, record + 0x54); bytes.writeUInt16LE(bodyIndex === ownIndex ? index : random(16), record + 0x58); bytes.writeUInt16LE(random(3), record + 0x6a); bytes.writeUInt32LE(0x200000, record + 0x74); bytes.writeInt32LE(random(3) ? 4 : 0, record + 0x7c);
    for (let axis = 0; axis < 3; axis++) {bytes.writeInt32LE((random(6001) - 3000) * 65536, record + 0x5c + axis * 4); bytes.writeInt32LE((axis === 2 ? random(3001) : random(41) - 20) * 65536, body + 0x34 + axis * 4); bytes.writeInt32LE((random(31) - 15) * 65536, body + 0x68 + axis * 4);}
    bytes.writeInt16LE([0, 49, 50, 100, 101, 200, 400][random(7)], body + 0x668); bytes.writeInt32LE(random(20) * 65536, body + 0x664); bytes[body + 0x718] = random(2) ? 8 : 10; bytes[body + 0x11c] = random(12); bytes.writeInt16LE(random(41) - 20, body + 0x11e);
  }
  //No selected flag record may cause the real signed-1 lookup. Supply its body.
  bytes.writeUInt32LE(0x100000, 0x909300 - 0x30c);
  bytes.writeUInt16LE(ownIndex, BODY + 0x65e); bytes.writeUInt16LE(group, BODY + 0x6c0); bytes.writeUInt16LE(index, BODY + 0x6c2); bytes.writeUInt16LE(random(65536), BODY + 0x6c4);
  bytes.writeInt16LE(4096, BODY + 0xc4); bytes.writeInt16LE(4096, BODY + 0xcc); bytes.writeInt16LE(fixture % 7 === 0 ? -4096 : 4096, BODY + 0xd4);
  bytes[BODY + 0x68c] = [0, 1, 2, 3, 4, 5, 6, 7, 255][random(9)]; bytes[BODY + 0x68d] = [0, 1, 2, 3, 4, 5, 6, 7, 255][random(9)]; bytes[BODY + 0x6db] = random(4) ? 0 : random(64); bytes[BODY + 0x6f0] = random(8); bytes[BODY + 0x6f1] = random(5);
  bytes.writeUInt32LE(random(32768), BODY + 0x6f8); bytes.writeUInt32LE(random(1024) | (fixture % 3 ? 16 : 0), BODY + 0x6ec); bytes.writeInt32LE([9999, 10000, 10001][random(3)], BODY + 0x6e0); bytes.writeInt32LE(random(2) ? -1 : 0, BODY + 0x6bc);
  bytes.writeInt16LE([-1, 0, 49, 50, 100, 101, 32767][random(7)], BODY + 0x6e4); bytes.writeInt16LE([-1, 0, 49, 50, 100, 101, 32767][random(7)], BODY + 0x6e6); bytes.writeUInt32LE(random(65536), BODY + 0x710); bytes[BODY + 0x70c] = random(16);
  for (let opponent = 0; opponent < 6; opponent++) bytes.writeUInt16LE(random(6001), BODY + 0x6fc + opponent * 2);
  const eventCount = random(7), rowCount = random(7); bytes[RESOURCE + 0xf6] = eventCount; bytes.writeUInt32LE(EVENTS, RESOURCE + 0xf8); bytes.writeUInt32LE(ROWS, RESOURCE + 0xec); bytes.writeInt32LE(rowCount, 0x82e904);
  for (let event = 0; event < 6; event++) {const p = EVENTS + event * 8; bytes.writeUInt32LE(random(6), p); bytes[p + 4] = random(3); bytes[p + 5] = random(3); bytes[p + 6] = random(8);}
  for (let objectIndex = 0; objectIndex < 24; objectIndex++) {
    const object = 0x200000 + objectIndex * 0x1000, row = ROWS + objectIndex * 20, local = LOCAL + objectIndex * 32;
    bytes.fill(0, object, object + 0x200); bytes.writeUInt32LE(object, 0x9034a0 + objectIndex * 4); bytes.writeInt32LE(random(4) === 0 ? 1 : 0, object + 0x184); bytes.writeInt32LE(random(2), object + 0x188); bytes.writeUInt16LE(objectIndex % 6, object + 0x192); bytes.writeUInt32LE(MATERIAL, object + 0x194); bytes[object + 0x199] = random(256);
    for (let axis = 0; axis < 3; axis++) {bytes.writeInt16LE(random(2001) - 1000, local + axis * 2); bytes.writeInt32LE((random(6001) - 3000) * 65536, object + 0x34 + axis * 4); bytes.writeInt32LE((random(6001) - 3000) * 65536, object + 0x19c + axis * 4);}
    bytes.writeUInt32LE(random(16), local + 12); bytes.writeUInt32LE(local, row); bytes.writeUInt32LE(object, row + 4);
  }
  for (let material = 0; material < 16; material++) bytes[MATERIAL + material * 4 + 3] = random(8);
  const nearby = random(7); bytes[0x6e650e] = nearby; bytes.writeUInt32LE(0x68000, 0x849a5c);
  for (let object = 0; object < 6; object++) {bytes.writeUInt32LE(0x200000 + object * 0x1000, 0x68000 + object * 8); bytes[0x920f60 + object] = object; bytes.writeInt32LE([0, 8999999, 9000000, 9000001][random(4)], 0x920ec0 + object * 4);}
  bytes[0x903502] = random(2); bytes.writeInt32LE([0, 1, 2, -1][random(4)], 0x5ea4d8); bytes.writeInt32LE([0, 1, -1, signed()][random(4)], 0x5ea4d4); bytes.writeUInt32LE([349, 350, 1000, 0xffffffff][random(4)], 0x90a548); bytes.writeInt32LE(random(2), 0x811180); bytes.writeUInt32LE(random(6), 0x920f84);
  const entryIndex = fixture % entries.length, entry = entries[entryIndex], profileCase = Math.floor(fixture / entries.length) % 4;
  if (profileCase !== 0) {
    //Force the less common geometric paths in addition to random admission
    //fixtures: ahead/rear use, predicted vehicles, authored rows and nearby lists.
    bytes.writeInt32LE(5, SESSION + 0x57c); bytes[SESSION + 0x54d] = 6; bytes[SESSION + 0x586] = 8;
    bytes.writeUInt32LE(1000, 0x90a548); bytes.writeUInt32LE(0, BODY + 0x710); bytes[BODY + 0x70c] = 0; bytes[BODY + 0x6db] = 0; bytes[BODY + 0x6f1] = 4; bytes.writeUInt32LE(16, BODY + 0x6ec);
    bytes.writeUInt16LE(0, BODY + 0x6c0); bytes.writeUInt16LE(0, BODY + 0x6c2); bytes.writeUInt16LE(0, BODY + 0x6c4); storeWords(bytes, BODY + 0x34, [0, 0, 0]);
    bytes[GROUP + 2] = 0; bytes[GROUP + 4] = 1; bytes.writeInt16LE(4096, BODY + 0xd4); bytes.writeInt16LE(0, BODY + 0xc8); bytes.writeInt16LE(0, BODY + 0xce);
    for (let point = 0; point < 16; point++) bytes[POINTS + point * 16 + 7] = entryIndex === 7 && profileCase === 1 ? 1 : 255;
    bytes.writeInt32LE(0, 0x5ea4d8); bytes.writeInt32LE(0, 0x82e904); bytes[0x6e650e] = 0; bytes[RESOURCE + 0xf6] = 0;
    for (let vehicle = 0; vehicle < 6; vehicle++) {
      const record = 0x909300 + vehicle * 0x30c, body = bytes.readUInt32LE(record);
      bytes[record + 0x1c] = 0; bytes[record + 0x1d] = 0; bytes[record + 0x249] = 0; bytes.writeInt32LE(vehicle === ownIndex ? 1000 : -10000, record + 0x24); bytes.writeUInt32LE(GROUP, record + 0x54); bytes.writeUInt16LE(0, record + 0x58);
      bytes[body + 0x718] = 10; bytes[body + 0x11c] = 3; bytes.writeInt16LE(0, body + 0x11e); bytes.writeInt16LE(150, body + 0x668); bytes.writeUInt16LE(6000, BODY + 0x6fc + vehicle * 2);
    }
    const otherIndex = (ownIndex + 1) % 6, otherRecord = 0x909300 + otherIndex * 0x30c, other = bytes.readUInt32LE(otherRecord);
    bytes.writeInt32LE(1000 + (entryIndex === 4 ? profileCase === 1 ? -600 : 600 : entryIndex === 6 ? profileCase === 1 ? 4500 : 600 : 600), otherRecord + 0x24); storeWords(bytes, other + 0x34, [0, 0, 200 * 65536]); storeWords(bytes, other + 0x68, [0, 0, 0]); bytes.writeInt32LE(10 * 65536, other + 0x664);
    if (entryIndex === 3) {
      if (profileCase === 1) bytes[other + 0x718] = 8;
      else if (profileCase === 2) {bytes.writeInt32LE(1, 0x82e904); bytes.writeUInt32LE(0, LOCAL + 12); bytes[MATERIAL + 3] = 0; bytes[0x200000 + 0x199] = 0; storeWords(bytes, 0x200000 + 0x34, [0, 0, 100 * 65536]); bytes.writeInt16LE(0, LOCAL); bytes.writeInt16LE(0, LOCAL + 2); bytes.writeInt16LE(0, LOCAL + 4);}
      else {bytes[0x6e650e] = 1; bytes.writeInt32LE(0, 0x920ec0); storeWords(bytes, 0x200000 + 0x34, [0, 0, 300 * 65536]);}
    }
  }
  const timer = [-1, 0, 50, 51, 100, 101][random(6)], flag = random(3), source = Buffer.from(bytes), beforeRng = source.readInt32LE(0x5ea4d4), bodyBefore = Buffer.from(source.subarray(BODY, BODY + 0x4000)), options = {memory: source, scratchBase: STACK};
  let expected;
  if (entryIndex === 0) updateAutonomousWeaponPolicy(BODY, options);
  else if (entryIndex === 1) expected = decideAutonomousItem00(BODY, flag, options);
  else if (entryIndex === 2) expected = decideAutonomousItem01(BODY, timer, options);
  else if (entryIndex === 3) expected = decideAutonomousItem02(BODY, timer, options);
  else if (entryIndex === 4) expected = decideAutonomousItem03(BODY, flag, timer, options);
  else if (entryIndex === 5) expected = decideAutonomousItem04(BODY, flag, options);
  else if (entryIndex === 6) expected = decideAutonomousItem07(BODY, flag, timer, options);
  else if (entryIndex === 7) expected = hasAutonomousSpeedMarker(BODY, options);
  else writeAutonomousObjectPosition(ROWS, STACK - 64, options);
  machine.entry = entry; machine.r.ECX = entryIndex === 8 ? ROWS : BODY; machine.r.EDX = entryIndex === 2 || entryIndex === 3 ? timer : entryIndex === 8 ? STACK - 64 : flag; machine.r.ESP = STACK; bytes.writeUInt32LE(0xffffffff, STACK); if (entryIndex === 4 || entryIndex === 6) bytes.writeUInt32LE(timer & 65535, STACK + 4);
  steps += machine.run();
  try {
    if (expected !== undefined) assert.equal(machine.r.EAX, expected, `return ${fixture}/${entry.toString(16)}`);
    for (const [address, length] of [[BODY, 0x4000], [SESSION, 0x600], [0x909000, 0x1550], [0x5ea4d4, 8], [0x811180, 4]]) assert.deepEqual(bytes.subarray(address, address + length), source.subarray(address, address + length), `memory ${fixture}/${address.toString(16)}`);
    if (entryIndex === 8) assert.deepEqual(bytes.subarray(STACK - 64, STACK - 58), source.subarray(STACK - 64, STACK - 58), `object position ${fixture}`);
  } catch (error) {console.error({fixture, entry: entry.toString(16), ownIndex, count, group, index, timer, flag}); throw error;}
  returns[entryIndex] += expected === 1 ? 1 : 0; bodyChanges[entryIndex] += bodyBefore.equals(source.subarray(BODY, BODY + 0x4000)) ? 0 : 1; rngChanges[entryIndex] += beforeRng !== source.readInt32LE(0x5ea4d4) ? 1 : 0;
}
const report = {method: 'Complete4103f0 policy, all six item decisions,411b00 route marker scan,411260 authored object transform, with actual route stepping/direction/normalization/dot/sqrt callees. No mocked calls. Synthetic caller-owned body/session/progression/events/registered-object/nearby-object lists and original threshold/yaw bytes; no original process execution.', evidence: [...own.evidence, ...math.evidence, ...tables].map(item => item.evidence_id), instructions: instructions.length, fixtures, perEntryFixtures: fixtures / entries.length, entries: entries.map((entry, index) => ({entry: `0x${entry.toString(16)}`, trueReturns: returns[index], bodyChanges: bodyChanges[index], rngChanges: rngChanges[index]})), instructionSteps: steps, matched: true};
await writeFile('analysis/autonomous-weapon-decisions-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

