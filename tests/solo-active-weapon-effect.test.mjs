import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSession} from '../src/solo-session.mjs';
import {buildViewerBundle} from '../tools/lib/track-viewer-bundle.mjs';

const installation = 'C:/Program Files (x86)/Psygnosis/Rollcage';
//Observe the owned allocation without adding a mutable runtime/debug API.
//This test never writes simulation inputs or grants an item/fire command.
function observeMemory(BufferType, create) {
  const allocate = BufferType.alloc; let memory;
  BufferType.alloc = function(size, ...args) {
    const value = allocate.call(this, size, ...args);
    if (size === 64 * 1024 * 1024) memory = value;
    return value;
  };
  try {return {session: create(), get memory() {return memory;}};} finally {BufferType.alloc = allocate;}
}
function shield(memory, index = 0) {
  const body = memory.readUInt32LE(0x909300 + index * 0x30c), owner = memory.readUInt32LE(body + 0x6bc), lookup = memory.readUInt32LE(0x713180);
  return {body, owner, backlink: memory.readUInt32LE(owner + 0x6c), lookup,
    lookupHex: memory.subarray(lookup, lookup + 64).toString('hex'),
    controllerHex: memory.subarray(owner, owner + 0x8c).toString('hex'),
    active: memory[owner], status: memory.readInt8(owner + 1), timer: memory.readInt8(owner + 8),
    intensities: [...memory.subarray(owner + 9, owner + 9 + memory.readUInt32LE(0x7130f8))]};
}

test('natural HIGH/LEV15 ground-projectile impulse executes482730 against constructed live shield state and lookup, with browser parity', {skip: !existsSync(`${installation}/IDXData/Rollcage.idx`)}, async () => {
  const archive = await RollcageArchive.open(installation);
  try {
    const track = getGame('rollcage').tracks.find(row => row.name === 'HIGH/LEV15.BLP');
    const {data} = await archive.readResource(track.index), {data: textures} = await archive.readResource(track.textureIndex);
    const options = {vehicleTypes: [0,1,2,3,4,5], aiDifficulty: 2, weaponsEnabled: true};
    const native = observeMemory(Buffer, () => createSession(data, textures, options));
    const modules = runInNewContext(await buildViewerBundle(['src/solo-session.mjs','tools/track-viewer/byte-buffer.mjs']), {btoa, atob, TextEncoder, TextDecoder});
    const browser = observeMemory(modules['tools/track-viewer/byte-buffer.mjs'].ByteBuffer, () => modules['src/solo-session.mjs'].createSession(data, textures, options));
    try {
      const states = new Map();
      for (let tick = 1; tick <= 600; tick++) {
        const state = native.session.step(), web = browser.session.step();
        if ([1,490,492,493,494,600].includes(tick)) {
          assert.equal(JSON.stringify(web), JSON.stringify(state), `Complete snapshot parity at${tick}`);
          const actual = shield(native.memory), browserActual = shield(browser.memory);
          assert.equal(JSON.stringify(browserActual), JSON.stringify(actual), `Actual controller/lookup backing bytes at${tick}`);
          assert.equal(actual.owner, 0x8495e0); assert.equal(actual.backlink, actual.body);
          assert.equal(actual.lookupHex.length, 128); assert.notEqual(actual.lookupHex, '00'.repeat(64));
          states.set(tick, {shield: actual, effects: state.weapons.effects});
        }
      }
      const before = states.get(492), after = states.get(493);
      assert.equal(before.effects.impulsePending, true); assert.equal(after.effects.impulsePending, false);
      assert.equal(before.shield.active, 1); assert.equal(after.shield.active, 1);
      assert.equal(before.shield.status, 10); assert.equal(after.shield.status, 7, '482730 consumes strength through the actual shield controller.');
      assert.equal(before.shield.timer, 0); assert.equal(after.shield.timer, 9, '482730 writes10; the ordered late482990 update consumes one tick.');
      assert.ok(before.shield.intensities.every(value => value === 0)); assert.ok(after.shield.intensities.some(value => value !== 0));
      assert.equal(states.get(494).shield.timer, 8); assert.notEqual(states.get(494).shield.controllerHex, after.shield.controllerHex);
      assert.equal(before.shield.lookupHex, after.shield.lookupHex, 'The hit reads the actual generated lookup, without replacing it.');
      assert.equal(native.session.snapshot.ticks, 600); assert.equal(browser.session.snapshot.ticks, 600);
    } finally {native.session.dispose(); browser.session.dispose();}
  } finally {await archive.close();}
});
