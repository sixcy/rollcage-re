import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeVehicleAutonomousState, initializeAutonomousCompetitorOwners, initializeAutonomousRouteFlags} from '../src/vehicle-autonomous-init.mjs';
import {triggerVehicleContactRecovery} from '../src/vehicle-contact-state.mjs';

export async function verifyVehicleAutonomousInitialization({fixtures = 2400, helperFixtures = 1200, output = 'analysis/vehicle-autonomous-init-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), baseline = program.initializeMemory(Buffer.alloc(0xa00000)), memory = Buffer.alloc(baseline.length), machine = new BoundedX86(program.instructions);
  const STACK = 0x9000, SESSION = 0x50000, ROUTES = 0x80000, GROUPS = 0x81000, RECORDS = 0x909300;
  let seed = 0x410060ab, instructionSteps = 0, recoveryCalls = 0, firstInitializationCases = 0, reloadedBodyCases = 0, sequentialCalls = 0;
  const calls = new Map(), reached = new Set();
  const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
  const put = (address, value) => memory.writeInt32LE(value | 0, address);
  machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX >>> 0, m.bytes.readUInt32LE(0x5e8890)));
  machine.onInstruction = address => {reached.add(address); if ([0x410060, 0x4123a0, 0x420270, 0x491ee0, 0x41ebb0, 0x41f900, 0x41f380].includes(address)) calls.set(address, (calls.get(address) ?? 0) + 1);};
  const setup = (fixture, body = 0x10000) => {
    baseline.copy(memory); memory.fill(0xa5, body, body + 0x800);
    put(0x5ecb1c, SESSION); put(0x90b98c, ROUTES); put(ROUTES + 0x60, GROUPS); memory[ROUTES + 0x46] = fixture % 10;
    for (let index = 0; index < 12; index++) {
      const group = GROUPS + index * 12; memory.writeUInt16LE([0, 1, 19, 20, 21, 65535][(fixture + index) % 6], group);
      memory[group + 4] = (fixture + index) % 3; memory[group + 5] = index;
    }
    const own = fixture % 6, record = RECORDS + own * 0x30c;
    for (let index = 0; index < 6; index++) {
      const candidate = index === own ? body : 0x10000 + (index + 1) * 0x4000;
      put(RECORDS + index * 0x30c, candidate); memory[candidate + 0x718] = 10;
      memory[SESSION + index] = [8, 8, 0, 1, 8, 8][(fixture + index) % 6];
      memory[SESSION + index + 0x1c] = (fixture + index) % 7;
      memory[RECORDS + index * 0x30c + 0x1c] = (fixture + index) % 5; put(RECORDS + index * 0x30c + 0x24, random());
    }
    memory.writeUInt16LE(own, body + 0x65e); put(record + 0x54, GROUPS + (fixture % 10) * 12); memory.writeUInt16LE(fixture * 113 & 65535, record + 0x58);
    memory[SESSION + 0x54d] = fixture % 7; memory[SESSION + 0x551] = fixture % 256; memory[SESSION + 0x58c] = fixture % 5 === 0 ? 1 : 0;
    memory[SESSION + 0x585] = [0, 1, 2, 3, 255][Math.floor(fixture / 16) % 5]; memory[SESSION + 0x579] = [0, 2, 3, 5, 6, 9, 10, 255][Math.floor(fixture / 80) % 8];
    put(SESSION + 0x618, [0, 1, -1, 65536, 0x7fffffff, random()][fixture % 6]);
    memory[0x6e650d] = fixture % 3 === 0 ? 1 : 0; put(0x5ea4d4, random()); put(0x5ea4d8, fixture % 4); put(0x920f84, fixture % 5); put(0x90a548, [0, 349, 350, 377, 378, -1][fixture % 6]);
    memory.fill(255, 0x91f6a8, 0x91f6ae);
    const obstacleCount = fixture % 4; put(0x6e6514, obstacleCount);
    for (let index = 0; index < obstacleCount; index++) {
      const object = 0x100000 + index * 0x1000, model = 0x110000 + index * 0x1000, vertices = 0x120000 + index * 0x1000, faces = 0x130000 + index * 0x1000, metadata = 0x140000 + index * 0x1000;
      put(0x920b40 + index * 12, object); put(object + 0x10, model); put(object + 0x24, vertices); put(object + 0x28, faces); put(object + 0x194, metadata); memory[object + 0x10d] = 4;
      memory[model + 0x27] = 3; memory.writeUInt16LE(0x40, model + 0x34);
      for (let vertex = 0; vertex < 4; vertex++) memory.writeInt16LE([0, 1, 24, -1][(fixture + vertex) % 4], vertices + vertex * 8 + 2);
      for (let polygon = 0; polygon < 3; polygon++) {
        memory[model + 0x40 + polygon * 20 + 8] = polygon; memory[model + 0x40 + polygon * 20 + 9] = polygon + 1;
        put(faces + polygon * 8, 0x04030201); memory[metadata + polygon * 4 + 3] = (fixture + polygon) % 5;
      }
    }
    return {body, record};
  };
  const execute = (entry, ecx = 0, edx = 0) => {machine.entry = entry; machine.r.ESP = STACK; machine.r.ECX = ecx; machine.r.EDX = edx; machine.bytes.writeInt32LE(-1, STACK); instructionSteps += machine.run(200000);};
  const compare = label => {
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
    if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`${label} diff0x${(offset + 0x10000).toString(16)} native=${native[offset]} source=${source[offset]}`);}
  };
  for (const [entry, implementation] of [[0x420270, initializeAutonomousCompetitorOwners], [0x491ee0, initializeAutonomousRouteFlags]]) for (let fixture = 0; fixture < helperFixtures; fixture++) {
    setup(fixture); machine.reset(); memory.copy(machine.bytes); implementation({memory, scratchBase: STACK}); execute(entry); compare(`helper${entry.toString(16)}/${fixture}`);
  }
  const aliases = [0x10000, 0x5ea4d4 - 0x6c0, 0x920f84 - 0x6c0, 0x91f6a8 - 0x6c0, 0x6e650d - 0x6c0];
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const {body, record: ordinaryRecord} = setup(fixture, aliases[Math.floor(fixture / 12) % aliases.length]);
    let record = ordinaryRecord;
    if (fixture % 11 === 0) {
      //4123a0 publishes the polygon pool cursor into the participant's body
      //slot, proving410060's route stage reloads it while policy keeps ESI.
      record = 0x920b48; put(record, body); put(record + 0x54, GROUPS + 12); memory.writeUInt16LE(321, record + 0x58);
      put(0x6e6514, 1); memory[0x6e650d] = 0; memory[ROUTES + 0x46] = 2;
      const object = 0x100000; put(0x920b40, object); put(object + 0x10, 0x110000); put(object + 0x24, 0x120000); put(object + 0x28, 0x130000); put(object + 0x194, 0x140000); memory[object + 0x10d] = 0;
      reloadedBodyCases++;
    }
    if (!memory[0x6e650d]) firstInitializationCases++;
    machine.reset(); memory.copy(machine.bytes); initializeVehicleAutonomousState(record, {memory, scratchBase: STACK}); execute(0x410060, record); compare(`parent${fixture}`);
    if (fixture % 3 === 0) {
      memory.writeUInt16LE(0, body + 0x6c4); machine.bytes.writeUInt16LE(0, body + 0x6c4);
      triggerVehicleContactRecovery(body, 20, {memory}); execute(0x41f380, body, 20); compare(`parentRecovery${fixture}`); recoveryCalls++;
    }
  }
  for (let fixture = 0; fixture < 120; fixture++) {
    setup(fixture); const count = fixture % 6 + 1; memory[SESSION + 0x54d] = count; memory[0x6e650d] = 0;
    for (let index = 0; index < count; index++) {
      const record = RECORDS + index * 0x30c, body = 0x20000 + index * 0x4000;
      put(record, body); memory.writeUInt16LE(index, body + 0x65e); put(record + 0x54, GROUPS + (index + 1) * 12); memory.writeUInt16LE(index * 17, record + 0x58);
    }
    machine.reset(); memory.copy(machine.bytes);
    for (let index = 0; index < count; index++) {
      const record = RECORDS + index * 0x30c;
      initializeVehicleAutonomousState(record, {memory, scratchBase: STACK}); execute(0x410060, record); compare(`sequential${fixture}/${index}`); sequentialCalls++;
    }
  }
  const report = {method: 'Whole410060 parent, actual4123a0 polygon producer,420270 ownership assignment,491ee0 route flag mutation,41ebb0 profile and41f900 complete planner; actual recovery chains and persistent1..6participant initialization. Full mapped memory>=10000h compares after every operation, private stack excluded. Explicit synthetic participant/session/model/route storage; original code/data retained, no original process. Cookie check is the only admitted external service.', targetSha256: program.sha256, fixtures, helperFixtures, helperCalls: helperFixtures * 2, firstInitializationCases, reloadedBodyCases, sequentialCalls, recoveryCalls, aliases: aliases.map(value => '0x' + value.toString(16)), calls: Object.fromEntries([...calls].map(([address, count]) => ['0x' + address.toString(16), count])), instructionSteps, executedInstructions: reached.size, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyVehicleAutonomousInitialization()));
