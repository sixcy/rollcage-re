import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeAutonomousDispatchTables, prepareAutonomousPickupUse, updateAutonomousSharedFrame,
  runAutonomousDispatch, runAutonomousMode200, runAutonomousMode40, runAutonomousMode20,
  selectAutonomousStartTimer} from '../src/autonomous-dispatch.mjs';
import {stepRoutePoints} from '../src/autonomous-route-geometry.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), body = 0x10000, other = 0x14000, pack = 0x20000, resource = 0x21000;
  const groups = 0x22000, rows = 0x23000, points = 0x30000, session = 0x40000, scratchBase = 0x9000, log = [];
  initializeAutonomousDispatchTables(memory);
  memory.writeUInt32LE(pack, 0x90b98c); memory.writeUInt32LE(resource, 0x90b990); memory.writeUInt32LE(session, 0x5ecb1c);
  memory.writeUInt32LE(groups, pack + 0x60); memory.writeUInt32LE(rows, resource + 0xf8);
  for (let group = 0; group < 3; group++) {
    const p = groups + group * 12; memory.writeUInt16LE(8, p); memory[p + 5] = group; memory.writeUInt32LE(points + group * 0x1000, p + 8);
    for (let index = 0; index < 8; index++) memory.writeInt16LE(index * 100, points + group * 0x1000 + index * 16);
  }
  for (let index = 0; index < 6; index++) {
    const record = 0x909300 + index * 0x30c;
    memory.writeUInt32LE(index ? other : body, record); memory.writeUInt32LE(groups, record + 0x54); memory.writeUInt32LE(5, record + 0x58);
  }
  memory.writeUInt32LE(1, 0x90a548); memory.writeUInt32LE(1, 0x6e6510); memory.writeInt32LE(1, 0x5ea4d4);
  memory.writeInt16LE(4096, body + 0xc8); memory.writeInt32LE(100 * 65536, body + 0x34);
  const handlers = Object.fromEntries(['call41f900', 'call47ffb0', 'call47fc20', 'call47ff20', 'call41f0d0', 'call421430', 'call4103f0']
    .map(name => [name, request => {log.push([name, request.ecx, request.edx]);}]));
  handlers.call4311e0 = request => {log.push(['call4311e0', request.ecx]); return 0;};
  return {memory, body, other, pack, resource, groups, rows, points, session, scratchBase, log, handlers};
}
const run = f => runAutonomousDispatch(f.body, f);

test('dispatcher clears output first, keeps a captured unsigned clock, and performs the live common-stage order', () => {
  const f = fixture(); f.memory.writeUInt32LE(120, 0x90a548); f.memory.writeUInt32LE(100, 0x6e6510);
  f.memory.writeUInt16LE(0xc000, f.body + 0x6c4); f.memory.writeInt32LE(-1, f.body + 0x710); f.memory[f.body + 0x6d9] = 5;
  f.handlers.call41f900 = request => {
    assert.equal(request.edx, 0); assert.equal(f.memory.readUInt16LE(f.body + 0x6c4), 0x8000); assert.equal(f.memory.readInt32LE(f.body + 0x710), 0);
    f.log.push(['scheduled']); f.memory.writeUInt32LE(999, 0x90a548);
  };
  f.handlers.call4355c0 = request => {assert.equal(request.ecx, 8); f.log.push(['shared']);};
  run(f);
  assert.equal(f.memory.readUInt32LE(0x6e6510), 120); assert.equal(f.memory.readUInt32LE(0x90a548), 999);
  assert.deepEqual(f.log.map(item => item[0]), ['scheduled', 'shared', 'call47fc20', 'call47ff20', 'call41f0d0', 'call421430', 'call4103f0']);
  assert.equal(f.memory.readUInt16LE(f.body + 0x6c4), 0xc000);
});

test('six-tick phase wraps every byte value at or above5 and rechecks it after421430', () => {
  for (const [initial, expected] of [[0, 1], [4, 5], [5, 0], [255, 0]]) {
    const f = fixture(); f.memory[f.body + 0x6d9] = initial;
    f.handlers.call421430 = () => {f.memory[f.body + 0x6d9] = 2; f.log.push(['call421430']);};
    run(f);
    assert.equal(f.memory[f.body + 0x6d9], expected || 2);
    assert.equal(f.log.some(item => item[0] === 'call4103f0'), false);
  }
});

test('preparation mutations select the live mode and require explicit ECX only when shared work is reached', () => {
  const f = fixture(); f.memory.writeUInt32LE(2, 0x90a548);
  f.handlers.call420020 = () => {f.memory.writeUInt16LE(0x80, f.body + 0x6c4); return {ecx: 77};};
  f.handlers.call4355c0 = request => f.log.push(['shared', request.ecx]);
  run(f); assert.deepEqual(f.log.map(item => item.slice(0, 2)), [['shared', 77], ['call47ffb0', f.body]]);
  assert.equal(f.memory.readUInt16LE(f.body + 0x6c4), 0x80);
  const g = fixture(); g.handlers.call420020 = () => undefined; run(g);
  g.memory.writeUInt32LE(2, 0x90a548);
  assert.throws(() => run(g), /ECX left by420020/);
});

test('modes1/2 can stop at their gate while an allowed path preserves later live mode bits', () => {
  for (const mode of [1, 2]) {
    const f = fixture(); f.memory.writeUInt16LE(mode, f.body + 0x6c4); f.handlers.call4311e0 = () => 1;
    run(f); assert.equal(f.memory.readUInt16LE(f.body + 0x6c4), mode); assert.deepEqual(f.log, []);
  }
  const g = fixture(); g.memory.writeUInt16LE(1, g.body + 0x6c4);
  g.handlers.call47fc20 = () => g.memory.writeUInt16LE(0x8100, g.body + 0x6c4);
  run(g); assert.equal(g.memory.readUInt16LE(g.body + 0x6c4), 0xc100);
});

test('mode100 uses unsigned post-decrement timer30 as the early-return boundary', () => {
  for (const [timer, common] of [[0, true], [30, true], [31, false], [65535, false]]) {
    const f = fixture(); f.memory.writeUInt16LE(0x8100, f.body + 0x6c4); f.memory.writeUInt16LE(timer, f.body + 0x6c6);
    run(f); assert.equal(f.log.some(item => item[0] === 'call47fc20'), common);
    assert.equal(f.memory.readUInt16LE(f.body + 0x6c6), timer ? (timer - 1) & 65535 : 0);
    assert.equal(!!(f.memory.readUInt16LE(f.body + 0x6c4) & 0x4000), common);
    if (!common) assert.equal(f.memory.readUInt32LE(f.body + 0x710), 0x40);
    if (!timer) assert.equal(f.memory.readUInt16LE(f.body + 0x6c4), 0x4000);
  }
});

test('mode200 distinguishes dword reset from wrapping timer/control reconstruction', () => {
  const f = fixture(); f.memory.writeUInt32LE(0x0014c200, f.body + 0x6c4); f.memory.writeInt32LE(-1, f.body + 0x710);
  runAutonomousMode200(f.body, f); assert.equal(f.memory.readUInt32LE(f.body + 0x6c4), 0); assert.equal(f.memory.readInt32LE(f.body + 0x710), -1);
  f.memory.writeUInt16LE(65535, f.body + 0x6c6);
  runAutonomousMode200(f.body, f); assert.equal(f.memory.readUInt16LE(f.body + 0x6c6), 0); assert.equal(f.memory.readUInt32LE(f.body + 0x710), 0x5fff);
});

test('mode40 preserves its no-op tick69, timer-selection tick68 and late countdown distinction', () => {
  const f = fixture(); f.memory.writeUInt32LE(1, f.session + 0x57c); f.memory.writeUInt16LE(1, f.body + 0x6c6);
  f.memory.writeUInt32LE(159, 0x90a548); runAutonomousMode40(f.body, f);
  assert.equal(f.memory.readUInt16LE(f.body + 0x6c6), 1); assert.equal(f.memory.readInt32LE(f.body + 0x710), 0);
  f.memory.writeUInt32LE(160, 0x90a548); runAutonomousMode40(f.body, f);
  assert.equal(f.memory.readUInt16LE(f.body + 0x6c6), 87); assert.equal(f.memory.readInt32LE(f.body + 0x710), 0);
  f.memory.writeUInt32LE(161, 0x90a548); f.memory.writeUInt16LE(1, f.body + 0x6c6); runAutonomousMode40(f.body, f);
  assert.equal(f.memory.readUInt16LE(f.body + 0x6c6), 0); assert.equal(f.memory.readInt32LE(f.body + 0x710), 0);
  runAutonomousMode40(f.body, f); assert.equal(f.memory.readInt32LE(f.body + 0x710), 0x40);
});

test('mode40 caps newly drawn timers and increments active count only for a nonzero stored timer', () => {
  for (const [clock, timer, active] of [[158, 0, 0], [157, 1, 1]]) {
    const f = fixture(); f.memory.writeUInt32LE(1, f.session + 0x57c); f.memory.writeUInt32LE(clock, 0x90a548); f.memory.writeInt32LE(0, 0x5ea4d4);
    runAutonomousMode40(f.body, f); assert.equal(f.memory.readUInt16LE(f.body + 0x6c6), timer); assert.equal(f.memory.readInt32LE(0x6e65a8), active);
    assert.equal(f.memory.readInt32LE(f.body + 0x710), 0);
  }
  const f = fixture(); f.memory.writeUInt32LE(1, f.session + 0x57c); f.memory.writeUInt16LE(1, f.body + 0x6c6);
  runAutonomousMode40(f.body, f); assert.equal(f.memory.readInt32LE(0x6e65a8), -1); assert.equal(f.memory.readUInt32LE(f.body + 0x710), 0x40);
});

test('mode40 phase4 clears only the mode word while other phases clear mode and timer', () => {
  const f = fixture(); f.memory.writeUInt32LE(4, f.session + 0x57c); f.memory.writeUInt32LE(0x0001c040, f.body + 0x6c4);
  runAutonomousMode40(f.body, f); assert.equal(f.memory.readUInt32LE(f.body + 0x6c4), 0x0000c040);
  runAutonomousMode40(f.body, f); assert.equal(f.memory.readUInt32LE(f.body + 0x6c4), 0);
  f.memory.writeUInt32LE(5, f.session + 0x57c); f.memory.writeUInt32LE(0x1234c040, f.body + 0x6c4);
  runAutonomousMode40(f.body, f); assert.equal(f.memory.readUInt32LE(f.body + 0x6c4), 0);
});

test('start-timer profile ranges preserve one versus two RNG transitions', () => {
  const expected = [87, 77, 72, 71, 40, 50, 60, 66];
  for (let profile = 0; profile < 8; profile++) {
    const f = fixture(); f.memory.writeUInt32LE(profile << 3, f.body + 0x6f4);
    assert.equal(selectAutonomousStartTimer(f.body, f), expected[profile]);
    assert.equal(f.memory.readInt32LE(0x5ea4d4), profile < 4 ? 282475249 : 16807);
  }
});

test('pickup-use prepass captures profile bits before a seed/body-field alias is overwritten', () => {
  const f = fixture(), aliasedBody = 0x5ea4d4 - 0x6f8;
  f.memory[aliasedBody + 0x68c] = 1;
  const registers = prepareAutonomousPickupUse(aliasedBody, f);
  assert.equal(registers.ecx, 8); assert.equal(registers.edx, 0); assert.equal(f.memory.readInt32LE(0x5ea4d4), 16807);
  assert.equal(f.memory.readUInt32LE(aliasedBody + 0x710), 4);
});

test('shared rows use five actual directional steps and preserve failed-walk scratch', () => {
  const f = fixture(); f.memory[f.resource + 0xf6] = 2; f.memory[f.session + 0x54d] = 1; f.memory[f.body + 0x718] = 10;
  for (let row = 0; row < 2; row++) {f.memory.writeUInt16LE(0, f.rows + row * 8); f.memory.writeUInt16LE(row, f.rows + row * 8 + 2); f.memory[f.rows + row * 8 + 4] = 2; f.memory[f.rows + row * 8 + 5] = 1;}
  const order = [];
  updateAutonomousSharedFrame(0xa5a50012 | 0, {...f, handlers: {call491470(request) {
    order.push(request.ecx & 65535); return stepRoutePoints(request.edx, request.ecx, request.args[0], request.args[1], request);
  }}});
  assert.deepEqual(order, [1, 0]); assert.equal(f.memory[f.rows + 5], 0); assert.equal(f.memory[f.rows + 13], 0);
  f.memory.writeUInt16LE(3, f.groups); f.memory[f.rows + 5] = 1; f.memory[f.rows + 13] = 1;
  updateAutonomousSharedFrame(0xa5a50012 | 0, f);
  assert.equal(f.memory.readUInt32LE(f.scratchBase - 4), 0xa5a50012); assert.equal(f.memory[f.rows + 5], 1);
});

test('mode20 timeout restores progression on the registered body and clears the current mode/timer dword', () => {
  const f = fixture(); f.memory.writeUInt32LE(f.other, 0x909300); f.memory.writeUInt32LE(f.groups + 12, 0x909354); f.memory.writeUInt32LE(0x1234fedc, 0x909358);
  f.memory.writeUInt32LE(0x0078c020, f.body + 0x6c4); f.memory.writeInt32LE(0x12345678, f.body + 0x710);
  runAutonomousMode20(f.body, f);
  assert.equal(f.memory.readUInt16LE(f.other + 0x6c0), 1); assert.equal(f.memory.readUInt16LE(f.other + 0x6c2), 0xfedc);
  assert.equal(f.memory.readUInt32LE(f.body + 0x6c4), 0); assert.equal(f.memory.readInt32LE(f.body + 0x710), 0x12345678);
});

test('mode20 can fire item4 after a missing event and a blocked primary never falls through to secondary', () => {
  for (const [primary, secondary, blocked, expected] of [[4, 4, 0, 4], [4, 4, 4, 0], [1, 4, 0, 8]]) {
    const f = fixture(); f.memory.writeUInt16LE(0x20, f.body + 0x6c4); f.memory[f.body + 0x68c] = primary; f.memory[f.body + 0x68d] = secondary; f.memory[f.body + 0x70c] = blocked;
    runAutonomousMode20(f.body, f);
    assert.equal(f.memory.readUInt32LE(f.body + 0x710), expected); assert.equal(f.memory.readUInt16LE(f.body + 0x6c4), 0x4000);
  }
});

test('mode20 chooses the last matching authored event before considering firing geometry', () => {
  const f = fixture(); f.memory.writeUInt16LE(0x20, f.body + 0x6c4); f.memory[f.body + 0x68c] = 4; f.memory[f.resource + 0xf6] = 2;
  for (let row = 0; row < 2; row++) {f.memory.writeUInt16LE(0, f.rows + row * 8); f.memory.writeUInt16LE(row, f.rows + row * 8 + 2); f.memory[f.rows + row * 8 + 4] = 4;}
  runAutonomousMode20(f.body, f);
  assert.equal(f.memory.readUInt32LE(f.body + 0x710), 0); assert.equal(f.memory.readUInt16LE(f.body + 0x6c4), 0x4020);
});
