import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRawScriptedProgram} from './verify-raw-scripted-motion-instructions.mjs';
import {createSimulationRuntimeFixture} from './lib/simulation-runtime-fixtures.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';
import {createRawAttachmentQueue} from '../src/raw-attachment-queue.mjs';

const [output] = process.argv.slice(2);
if (!output) throw Error('Usage: node tools/verify-native-scripted-frames.mjs NEW_REPORT_JSON');
const program = await loadRawScriptedProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), fixtures = 240;
let steps = 0, operations = 0, scriptCalls = 0;
machine.onInstruction = address => {reached.add(address); if (address === 0x476550) scriptCalls++;};
machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX >>> 0, m.bytes.readUInt32LE(0x5e8890)));
for (let index = 0; index < fixtures; index++) {
  const f = createSimulationRuntimeFixture(program, 0), {memory, context, bodies, views} = f, body = bodies[0], script = 0x7e000;
  const put = (p, value) => memory.writeInt32LE(value | 0, p), word = (p, value) => memory.writeUInt16LE(value & 65535, p);
  body.flags |= 0x2000; put(body.address + 0x134, script); word(body.address + 0x138, 0); put(body.address + 0x13a, 0); memory[body.address + 0x13e] = 0;
  word(body.address + 0x16a, index % 2 ? 0x5000 : 0);
  const opcode = [0, 3, 7][index % 3]; word(script, opcode);
  if (!opcode) {word(script + 2, index % 9 - 4); word(script + 4, 0); word(script + 6, 1); word(script + 8, 5);}
  else {
    word(script + 2, 1); word(script + 4, index % 2 ? 16 : 256); word(script + 22, 0); word(script + 68, 5);
    for (let point = 0; point < 4; point++) {put(script + 8 + point * 16, (point - 1) * 10 * 65536); put(script + 12 + point * 16, -6 * 65536); put(script + 16 + point * 16, 0);}
  }
  context.nativeScripted = {memory, views, scratchBase: 0x9000 - 24};
  context.handlers.attachmentQueue = createRawAttachmentQueue({memory, bodyAt: views.bodyAt});
  for (let frame = 0; frame < 3; frame++) {
    machine.reset(); memory.copy(machine.bytes); machine.entry = 0x4749e0; machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000);
    const result = stepSimulationFrame(views.physicalGroup, [], context);
    steps += machine.run(3_000_000); operations++; assert.equal(machine.r.EAX, result.nativeReturn);
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
    if (!native.equals(source)) {const offset = native.findIndex((value, i) => value !== source[i]); assert.fail(`fixture${index}/frame${frame}/opcode${opcode} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${source[offset]}`);}
  }
}
const report = {method: 'Whole4749e0 physics frames with real476550 velocity/curve/facing scripts and live902040/6e6ba0 attachment queue producers. Native script pointer/timers remain in the same raw body memory; no script/arithmetic/game-call overrides. All mapped bytes>=10000h compared after each of three persistent source frames. Synthetic initialized terrain/body/shape pools, not original-process trajectory evidence.', targetSHA256: program.sha256,
  fixtures, framesPerFixture: 3, operations, scriptCalls, instructionSteps: steps, reachedInstructions: reached.size, matched: true};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'}); console.log(JSON.stringify(report));
