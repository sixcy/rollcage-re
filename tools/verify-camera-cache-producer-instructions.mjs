import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {constructCameraController} from '../src/camera-construction.mjs';
import {publishCachedCameraMatrix} from '../src/camera-pose-helpers.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
export async function verifyCameraCacheProducer({fixtures = 128, output = 'analysis/camera-cache-producer-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let steps = 0, calls = 0, clears = 0;
  machine.onInstruction = p => {steps++; reached.add(p); if ([0x416180, 0x417e80, 0x4167f0, 0x4798d0, 0x428270].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568162, state => assert.equal(state.r.ECX, state.bytes.readInt32LE(0x5e8890)));
  machine.externalCalls.set(0x568a50, state => {const m = state.bytes, p = m.readUInt32LE(state.r.ESP), value = m[state.r.ESP + 4], size = m.readUInt32LE(state.r.ESP + 8); assert.equal(p, 0x91ff80); assert.equal(value, 0); assert.equal(size, 0x610); m.fill(value, p, p + size); state.r.EAX = p; clears++;});
  const run = (entry, ecx, edx, args = []) => {machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = 0x9000; put(machine.bytes, 0x9000, -1); args.forEach((v, i) => put(machine.bytes, 0x9004 + i * 4, v)); machine.run(300000); calls++;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = {memory, scratchBase: 0x9000}, control = 0x909060, direction = 0x220000, other = 0x220020, output = 0x220040;
    memory.fill(0x36, 0x8000, 0xa000); put(memory, 0x5ecb1c, 0x50000); put(memory, 0x5ecefc, 0x52000); put(memory, 0x909288, 0x30000); put(memory, 0x902eec, 0x100000); put(memory, 0x70dcf4, 0x60000 + fixture % 4); put(memory, 0x909254, 0x40000); put(memory, 0x909278, 0x45000);
    for (let row = 0; row < 256; row++) {word(memory, 0x40000 + row * 16, 0xff00); word(memory, 0x40002 + row * 16, 255); put(memory, 0x4000c + row * 16, 0x43000);}
    for (const [p, v] of [[0x91e79c, 0x180000], [0x91e780, 0x190000], [0x91e78c, 0x190100], [0x91e790, 0x190200], [0x91e794, 255], [0x91e784, -1], [0x902bc0, 0x1a0000]]) put(memory, p, v);
    for (let id = 0; id < 256; id++) memory[0x190000 + id] = id;
    for (let index = 0; index < 8; index++) for (let axis = 0; axis < 3; axis++) word(memory, 0x30000 + index * 8 + axis * 2, (fixture * 713 + index * 17 + axis * 31) & 65535);
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes);
    const compare = label => {if (!memory.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {let p = 0x10000; while (memory[p] === machine.bytes[p]) p++; assert.fail(`${label} byte0x${p.toString(16)} JS${memory[p]} native${machine.bytes[p]}`);}};
    for (let constructor = 0; constructor < 2; constructor++) {
      constructCameraController(constructor, 0x210000, control + constructor * 76, runtime); run(0x416180, constructor, 0x210000, [control + constructor * 76]); compare(`${fixture}/construct${constructor}`);
      for (let camera = 0; camera < 4; camera++) {
        const cache = 0x9200a0 + camera * 0x184; assert.deepEqual(memory.subarray(cache, cache + 32), Buffer.alloc(32));
        for (const phase of constructor ? ['fallback'] : ['fallback', 'publish', 'restore']) {
          for (const m of [memory, machine.bytes]) {put(m, direction, phase === 'publish' ? 65536 : 0); put(m, direction + 4, 0); put(m, direction + 8, 0); put(m, other, 0); put(m, other + 4, 65536); put(m, other + 8, 0); m.fill((fixture + camera * 17) & 255, output, output + 32);}
          const result = publishCachedCameraMatrix(direction, other, output, camera, runtime); run(0x417e80, direction, other, [output, camera]); assert.equal(machine.r.EAX, result); assert.equal(result, phase === 'publish' ? 1 : 0); compare(`${fixture}/${constructor}/${camera}/${phase}`);
          if (phase === 'fallback') assert.deepEqual(memory.subarray(output, output + 32), Buffer.alloc(32));
        }
      }
    }
  }
  const report = {method: 'Actual416180 camera/body/controller constructor and all reached raw-body/shape/spatial children followed by417e80→4167f0 cached matrix fallback,publish,restore for all4 view rows; second actual constructor resets every previously populated cache. All mapped bytes>=10000h,EAX and original610h-byte clear ownership compared after every stage; private stack persists. Supplied raw scene/spawn/shape/pool state and declared compiler cookie/CRT memset only; no game mocks or original execution.', targetSha256: program.sha256, fixtures, calls, constructors: fixtures * 2, cacheCalls: fixtures * 16, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, literalClears: clears, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyCameraCacheProducer()));
