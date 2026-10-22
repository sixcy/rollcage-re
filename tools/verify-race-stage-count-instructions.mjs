import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {getRaceStageCount} from '../src/race-stage-count.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';
const directory = 'analysis/native-simulation/results';
const {instructions, evidence} = await readInstructionEvidence(['310-race-step-parent-assembly.json', '1909-race-dynamic-count.json'], {directory});
const table = JSON.parse(await readFile(`${directory}/1910-race-stage-count-switch.json`, 'utf8')).structuredContent;
const machine = new BoundedX86(instructions), session = 0x50000, alternate = 0x51000, stack = 0x9000;
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const targets = [...new Set(instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0])))].filter(address => address !== 0x41bef0);
let steps = 0, stageCalls = 0;
for (let fixture = 0; fixture < 512; fixture++) {
  const memory = Buffer.alloc(0xa00000), nativeLog = [], sourceLog = [];
  Buffer.from(table.normalized_result.bytes_hex, 'hex').copy(memory, Number(table.normalized_result.address));
  put(memory, 0x5ecb1c, session); put(memory, session + 0x57c, 4); put(memory, alternate + 0x57c, 4);
  memory[session + 0x552] = fixture & 255; memory[alternate + 0x552] = 4;
  put(memory, 0x5ecefc, 0x52000); put(memory, 0x90b990, 0x53000);
  put(memory, 0x714b08, 0x56000); put(memory, 0x56000, 0x57000); put(memory, 0x5705c, 0x58000);
  machine.reset(); memory.copy(machine.bytes);
  if (fixture < 256) {
    const expected = getRaceStageCount({memory});
    machine.entry = 0x41bef0; machine.r.ESP = stack; put(machine.bytes, stack, -1); steps += machine.run();
    assert.equal(machine.r.EAX, expected);
  } else {
    const boundary = (bytes, log, address, ecx) => {
      if (address === 0x4180a0) {
        log.push(ecx);
        // Extend, shrink or replace the session after a real iteration.
        if (!ecx) {
          if (fixture % 3 === 0) bytes[session + 0x552] = 4;
          else if (fixture % 3 === 1) bytes[session + 0x552] = 0;
          else put(bytes, 0x5ecb1c, alternate);
        }
      }
      return 0;
    };
    const handlers = {};
    for (const address of targets) {
      handlers[`call${address.toString(16)}`] = request => boundary(memory, sourceLog, address, request.ecx);
      machine.externalCalls.set(address, m => {m.r.EAX = boundary(m.bytes, nativeLog, address, m.r.ECX);});
    }
    handlers.audioManagerCall = () => {};
    machine.externalCalls.set(0x58000, m => {m.r.ESP += 4;});
    const expected = runRaceUpdate(0, 1, {memory, scratchBase: stack, handlers});
    machine.entry = 0x450e50; machine.r.EDX = 0; machine.r.ESP = stack; put(machine.bytes, stack, -1); put(machine.bytes, stack + 4, 1);
    steps += machine.run(100000); assert.equal(machine.r.EAX, expected); assert.deepEqual(nativeLog, sourceLog);
    assert(machine.bytes.subarray(0x10000).equals(memory.subarray(0x10000))); stageCalls += sourceLog.length;
  }
}
const report = {method: 'Actual41bef0 selector for all256 byte values plus256 actual450e50 caller cases with the real count default. Later4180a0 contracts extend/shrink552 or replace the session after iteration0; the next loop condition consumes live changes. Other41 game stages and manager service are explicit boundaries; no whole-stage4180a0 or whole-frame claim. All mapped data above10000h compared in caller cases; private stack excluded. No original-process execution.', evidence: [...evidence, table].map(item => item.evidence_id), instructions: instructions.length, directCases: 256, parentCases: 256, stageCalls, instructionSteps: steps, matched: true};
await writeFile('analysis/race-stage-count-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
