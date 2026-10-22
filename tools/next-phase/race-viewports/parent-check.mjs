import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeRaceViewports, initializeRaceViewportLiterals} from './parent.mjs';
import {checkRaceViewportParent} from './check-parent.mjs';

function fixture({width = 640, height = 480, selection = 0} = {}) {
  const memory = initializeRaceViewportLiterals(Buffer.alloc(0xa00000)), session = 0x120000, config = 0x122000, app = 0x150000, entry = 0x9000;
  const put = (p, v) => memory.writeInt32LE(v | 0, p), ptr = p => memory.readUInt32LE(p), calls = [], definitions = [];
  put(0x5ecb1c, session); put(0x5ecefc, config); memory[session + 0x552] = selection; memory.writeUInt16LE(width, config + 0x42c); memory.writeUInt16LE(height, config + 0x42e);
  put(0x6efb38, app); put(0x715060, 1); [2, 0, 5, 1].forEach((v, i) => put(0x5ec120 + i * 4, v));
  for (let i = 0; i < 6; i++) for (let lane = 0; lane < 4; lane++) put(0x909308 + i * 0x30c + lane * 4, i * 100 + lane * 10);
  const runtime = {memory, scratchBase: entry, handlers: {
    call471770: request => calls.push(['471770', request]),
    call42ef80: request => calls.push(['42ef80', request]),
    call404020: request => {const [name, ...rectangle] = request.args; definitions.push({name: memory.toString('latin1', name, memory.indexOf(0, name)), rectangle, application: request.ecx});},
    call406b80: () => {},
    dynamicCast: application => application
  }, services: {crtCall: (name, [value, output, radix]) => {assert.equal(name, '_itoa'); assert.equal(radix, 10); memory.write(`${value}\0`, output, 'latin1'); return output;}}};
  return {memory, session, config, app, runtime, calls, definitions, put, ptr};
}

test('the already-created gate still executes both helpers with four42ef80 arguments', () => {
  const f = fixture(); f.put(0x6e6758, -1);
  f.runtime.handlers.call471770 = request => {f.calls.push(['471770', request]); [4, 3, 2, 1].forEach((v, i) => f.put(0x5ec120 + i * 4, v));};
  initializeRaceViewports(f.runtime); const request = f.calls.find(([name]) => name === '42ef80')[1];
  assert.equal(request.ecx, 4); assert.equal(request.edx, 3); assert.deepEqual(request.args, [2, 1]); assert.equal(f.definitions.length, 0);
});

test('view names use ordinal indices while rectangles use selected participant records', () => {
  const f = fixture({selection: 4}); initializeRaceViewports(f.runtime);
  assert.deepEqual(f.definitions.slice(0, 4).map(d => [d.name, d.rectangle]), [
    ['0 Player', [200, 210, 220, 230]], ['1 Player', [0, 10, 20, 30]], ['2 Player', [500, 510, 520, 530]], ['3 Player', [100, 110, 120, 130]]
  ]);
  assert.equal(f.memory.readInt32LE(0x6e6758), 1);
});

test('zero dimensions preserve the native negative cinematic X coordinate', () => {
  const f = fixture({width: 0, height: 0}); initializeRaceViewports(f.runtime);
  assert.deepEqual(f.definitions.at(-2), {name: 'Rear View Mirror', rectangle: [0, 0, 0, 0], application: f.app});
  assert.deepEqual(f.definitions.at(-1), {name: 'Cinematic Window', rectangle: [-10, 0, 0, 0], application: f.app});
});

test('the stage count remains live after each named enable call', () => {
  const f = fixture(); let enables = 0; f.runtime.handlers.call406b80 = () => {enables++; f.memory[f.session + 0x552] = 4;};
  initializeRaceViewports(f.runtime); assert.equal(enables, 4); assert.equal(f.definitions.length, 6);
});

test('RTTI mutations of pending arguments reach the game child as raw stack words', () => {
  const f = fixture(); f.runtime.handlers.dynamicCast = (application, ...args) => {const runtime = args.at(-1); f.put(runtime.scratchBase + 32, 0x76543210); return application;};
  initializeRaceViewports(f.runtime); assert.equal(f.definitions[0].rectangle[1], 0x76543210);
});

test('a cleared singleton is republished before the next child even when construction flag is set', () => {
  const f = fixture(); let enabledApplication; const define = f.runtime.handlers.call404020;
  f.runtime.handlers.call404020 = request => {define(request); f.put(0x6efb38, 0);}; f.runtime.handlers.call406b80 = request => {enabledApplication = request.ecx;};
  initializeRaceViewports(f.runtime); assert.equal(enabledApplication, 0x715470); assert.equal(f.ptr(0x6efb38), 0);
});

test('retained native parent with actual bootstrap preserves callback aliases and mapped state', async () => {
  const result = await checkRaceViewportParent({fixtures: 120}); assert.equal(result.matched, true);
  assert.ok(result.constructed > 0); assert.ok(result.stats.liveCountChanges > 0); assert.ok(result.stats.allocatorMutations > 0); assert.ok(result.stats.castArgumentAliases > 0);
});
