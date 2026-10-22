import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationRuntimeFixture} from '../tools/lib/simulation-runtime-fixtures.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';
const program = await loadRetainedNativeProgram();

test('native script bridge reads live body bytecode and executes inside the complete physics frame', () => {
  const f = createSimulationRuntimeFixture(program), {memory, context, bodies, views} = f, body = bodies[0], script = 0x7e000;
  memory.writeInt32LE(body.flags | 0x2000, body.address); memory.writeUInt32LE(script, body.address + 0x134);
  memory.writeUInt16LE(0, body.address + 0x138); memory.writeInt16LE(0, script);
  memory.writeInt16LE(2, script + 2); memory.writeInt16LE(0, script + 4); memory.writeInt16LE(-3, script + 6);
  context.nativeScripted = {memory, views, scratchBase: 0x9000 - 24};
  context.scriptOptionsFor = () => {throw Error('A copied structured script must not replace native state.');};
  const before = body.position.slice(), report = stepSimulationFrame(views.physicalGroup, [], context);
  assert.equal(report.scriptedBodies, 1); assert.equal(report.ordinaryBodies, 0);
  assert.equal(memory.readUInt16LE(body.address + 0x138), 8);
  assert.deepEqual(body.linearVelocity, [512, 0, -768]); assert.deepEqual(body.position, [before[0] + 512, before[1], before[2] - 768]);
});

test('native script bridge rejects detached views and an invented child stack', () => {
  const f = createSimulationRuntimeFixture(program), {memory, context, bodies, views} = f;
  bodies[0].flags |= 0x2000;
  context.nativeScripted = {memory, views, scratchBase: 0x9000};
  assert.throws(() => stepSimulationFrame(views.physicalGroup, [], context), /child entry ESP/);
});
