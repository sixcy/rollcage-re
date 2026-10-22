import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {selectCameraEvent} from '../src/camera-event-selection.mjs';

const program = await loadRetainedNativeProgram(), baseline = program.initializeMemory(Buffer.alloc(0xa00000));
const machine = new BoundedX86(program.instructions), reached = new Set(), histogram = {};
const memory = Buffer.alloc(baseline.length), stack = 0x9000, session = 0x50000;
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
let seed = 0x417930ab, steps = 0, aliases = 0;
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
machine.onInstruction = address => reached.add(address);
const fixtures = Number(process.argv[2] ?? 8000);
for (let fixture = 0; fixture < fixtures; fixture++) {
  baseline.copy(memory); const index = fixture % 4, camera = 0x91ff80 + index * 0x184;
  put(memory, 0x5ecb1c, session); memory[session + 0x552] = fixture & 255; memory[session + 0x58c] = fixture % 9 === 0 ? 2 : 0;
  put(memory, 0x90a548, [599, 600, 3600, 0x7fffffff, -1, 0, random()][fixture % 7]);
  for (let row = 0; row < 4; row++) {
    const p = 0x91ff80 + row * 0x184;
    put(memory, p, [0, 11, 15, 16, 4][(fixture + row) % 5]); put(memory, p + 0x118, [0, 3001, -600, 0x7fffffff, random()][(fixture + row) % 5]);
    put(memory, p + 0x3c, row === index ? fixture % 6 : fixture % 13 === 0 ? 1 : 0);
    word(memory, p + 0x32, [-32768, -1, 59, 60, 32767][(fixture + row) % 5]); word(memory, p + 0x3a, [-32768, 0, 1, 32767][(fixture + row) % 4]); word(memory, p + 0x38, 0);
    put(memory, p + 0x20, random());
  }
  for (const [table, count, offset] of [[0x9034a0, 24, 0x188], [0x903480, 6, 0x194], [0x80b5e0, 1, 0x188]]) {
    for (let entry = 0; entry < count; entry++) {
      const object = 0x60000 + (table === 0x9034a0 ? 0 : table === 0x903480 ? 24 : 30) * 0x200 + entry * 0x200;
      put(memory, table + entry * 4, object); put(memory, object + offset, [0, 1, 2, -1][(fixture + entry) % 4]); put(memory, object + 0x184, [0, 1, 2, -1][(fixture * 3 + entry) % 4]);
    }
  }
  //Force fully eligible cases across every session byte, then remove candidates
  //in each priority table to reach all three world-event families and no hit.
  if (fixture % 3 !== 0) {
    memory[session + 0x58c] = 0; put(memory, 0x90a548, 10000);
    for (let row = 0; row < 4; row++) {const p = 0x91ff80 + row * 0x184; put(memory, p + 0x118, 0); put(memory, p + 0x3c, 0);}
    put(memory, camera, 4); word(memory, camera + 0x32, 60); word(memory, camera + 0x3a, 0);
    for (let entry = 0; entry < 24; entry++) {const object = memory.readUInt32LE(0x9034a0 + entry * 4); put(memory, object + 0x188, fixture % 4 === 0 && entry === (fixture >>> 2) % 24 ? 1 : 0); put(memory, object + 0x184, (fixture >>> 3) & 1);}
    for (let entry = 0; entry < 6; entry++) put(memory, memory.readUInt32LE(0x903480 + entry * 4) + 0x194, fixture % 4 === 1 && entry === (fixture >>> 2) % 6 ? 1 : 0);
    put(memory, memory.readUInt32LE(0x80b5e0) + 0x188, fixture % 4 === 2 ? 1 : 0);
    if (fixture % 11 === 0) {put(memory, 0x9034a0, camera - 0x184); aliases++;}
  }
  machine.reset(); memory.copy(machine.bytes); machine.entry = 0x417930; machine.r.ECX = index; machine.r.ESP = stack; put(machine.bytes, stack, -1);
  selectCameraEvent(index, {memory}); steps += machine.run(10000);
  const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
  if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`fixture${fixture} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
  const kind = memory.readInt32LE(camera + 0x3c); histogram[kind] = (histogram[kind] ?? 0) + 1;
}
const report = {method: 'Actual417930 complete event-camera selector against retained x86, all mapped bytes>=10000h. All256 session bytes, split-view timestamp minimum/cap, signed short age/cooldown, unsigned clock rollover, stale live world-event pointers, class priority/first hit, excluded modes15/16 and camera/world aliases. No game/helper contracts or original process execution. World object constructors and full4180a0 remain separate incomplete scopes.', fixtures, aliases, executedInstructions: reached.size, instructionSteps: steps, histogram, evidence: program.references.map(r => r.evidence), matched: true};
await writeFile('analysis/camera-event-selection-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
