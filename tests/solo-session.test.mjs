import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {ByteBuffer} from '../tools/track-viewer/byte-buffer.mjs';
import {SoloController} from '../tools/track-viewer/solo-controller.mjs';
import {carDisplayMatrix, formatPracticeTime} from '../tools/track-viewer/solo-presentation.mjs';
import {readDefaultModelMaterials} from '../src/model-materials.mjs';
import {buildViewerBundle} from '../tools/lib/track-viewer-bundle.mjs';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession, SOLO_STEP_SECONDS} from '../src/solo-session.mjs';

test('browser mutable bytes match native signed integers, IEEE values and overlapping copies', () => {
  const native = Buffer.alloc(64), browser = ByteBuffer.alloc(64);
  for (const bytes of [native, browser]) {
    bytes.writeInt32LE(-2147483648, 1); bytes.writeUInt32LE(0xffffffff, 5);
    bytes.writeInt16LE(-32768, 9); bytes.writeUInt16LE(65535, 11);
    bytes.writeInt8(-128, 13); bytes.writeUInt8(255, 14);
    bytes.writeFloatLE(Math.PI, 15); bytes.writeDoubleLE(-0, 19);
    bytes.subarray(1, 27).copy(bytes, 3); bytes.copy(bytes, 0, 3, 29);
  }
  assert.deepEqual([...browser], [...native]);
  for (const [method, offset] of [['readInt32LE',0],['readUInt32LE',4],['readInt16LE',8],['readUInt16LE',10],['readInt8',12],['readUInt8',13],['readFloatLE',14],['readDoubleLE',18]]) assert.equal(browser[method](offset), native[method](offset));
  assert.deepEqual([...ByteBuffer.from('ab00ff7', 'hex')], [...Buffer.from('ab00ff7', 'hex')]);
  assert.throws(() => browser.writeInt32LE(0x80000000, 0), RangeError);
  assert.throws(() => browser.writeFloatLE(1, 62), RangeError);
  browser.writeBigUInt64LE(0xffffffffffffffffn, 0); assert.equal(browser.readBigUInt64LE(0), 0xffffffffffffffffn);
  for (let length = 1; length <= 6; length++) assert.equal(browser.readUIntLE(1, length), Buffer.from(browser).readUIntLE(1, length));
  assert.throws(() => browser.readUIntLE(0, 7), RangeError); assert.throws(() => browser.readUIntLE(63, 3), RangeError);
  assert.throws(() => createSession(Buffer.alloc(2), Buffer.alloc(2)), /GFXM/);
});

test('practice controller decouples physics from render scheduling, pause and background gaps', () => {
  const make = () => new SoloController({snapshot: {}, ticks: 0, step() {this.ticks++;}, reset() {this.ticks = 0;}, dispose() {}});
  const first = make(), second = make(); first.start(); second.start();
  for (let i = 0; i < 120; i++) first.advance(1 / 60);
  for (let i = 0; i < 48; i++) second.advance(1 / 24);
  assert.equal(SOLO_STEP_SECONDS, 1 / 30);
  assert.equal(first.session.ticks, 60); assert.equal(second.session.ticks, 60);
  first.pause(); first.advance(100); assert.equal(first.session.ticks, 60);
  first.start(); first.advance(100); assert.equal(first.session.ticks, 68);
  first.reset(); assert.equal(first.state, 'ready'); assert.equal(first.session.ticks, 0);
  first.start(); first.session.step = () => {throw Error('bad state');}; first.advance(SOLO_STEP_SECONDS);
  assert.equal(first.state, 'error'); assert.equal(first.message, 'bad state');
});

test('manual frame and recovery controls preserve pause, defer running requests and surface failures', () => {
  const session = {ticks: 0, recoveries: 0, pending: false,
    step() {this.ticks++; if (this.pending) {this.recoveries++; this.pending = false;}},
    requestRecovery() {this.pending = true;},
    reset() {this.ticks = 0; this.recoveries = 0; this.pending = false;}, dispose() {}};
  const control = new SoloController(session);
  assert.equal(control.stepFrame(), true); assert.equal(control.state, 'paused'); assert.equal(session.ticks, 1);
  control.advance(100); assert.equal(session.ticks, 1, 'Single stepping does not resume scheduling.');
  assert.equal(control.requestRecovery(), true); assert.equal(session.recoveries, 1); assert.equal(control.state, 'paused');
  control.start(); assert.equal(control.stepFrame(), false); assert.equal(session.ticks, 2);
  control.requestRecovery(); assert.equal(session.ticks, 2); assert.equal(session.recoveries, 1);
  control.advance(SOLO_STEP_SECONDS); assert.equal(session.ticks, 3); assert.equal(session.recoveries, 2);
  control.reset(); assert.equal(control.state, 'ready'); assert.equal(session.ticks, 0); assert.equal(session.pending, false);
  session.requestRecovery = () => {throw Error('test recovery failure');};
  assert.equal(control.requestRecovery(), false); assert.equal(control.state, 'error'); assert.equal(control.message, 'test recovery failure');
  assert.equal(control.stepFrame(), false); assert.equal(session.ticks, 0);
});

test('car presentation applies the handedness-preserving display transform once', () => {
  const matrix = carDisplayMatrix({position: [10,-20,30], rotation: [0,0,1,0,1,0,-1,0,0]});
  const localDisplay = [1,-2,-3,1], output = Array.from({length: 3}, (_, row) => localDisplay.reduce((sum, value, column) => sum + matrix[column * 4 + row] * value, 0));
  assert.deepEqual(output, [13,18,-29]);
  assert.equal(formatPracticeTime(61.239), '1:01.23'); assert.equal(formatPracticeTime(null), '—');
});

test('embedded car packets preserve face order, UVs and texture page independently of instance materials', () => {
  const data = Buffer.alloc(128); data.writeUInt32LE(80, 0x10); data.writeUInt32LE(120, 0x14);
  for (const [offset, u, v] of [[12,1,2],[20,3,4],[28,5,6],[36,7,8]]) {data[80 + offset] = u; data[81 + offset] = v;}
  data.writeUInt16LE(31, 102);
  const model = {offset: 0, faceCount: 1, faces: [{indices: [1,2,3,4], triangle: false}]};
  assert.deepEqual(readDefaultModelMaterials(data, model), [{page:31,pageWord:31,uv:[[1,2],[3,4],[5,6],[7,8]],indices:[0,2,1,3]}]);
  data.writeUInt32LE(121, 0x14); assert.throws(() => readDefaultModelMaterials(data, model), /face count/);
});

const installation = 'C:/Program Files (x86)/Psygnosis/Rollcage';
test('installed LEV1 session preserves assets, resets deterministically and matches browser bytes', {skip: !existsSync(`${installation}/IDXData/Rollcage.idx`)}, async () => {
  const archive = await RollcageArchive.open(installation);
  try {
    const {data} = await archive.readResource(30), {data: textures} = await archive.readResource(31);
    const frames = [];
    const original = Buffer.from(data), session = createSession(data, textures, {onDebugFrame: frame => frames.push(frame)}), initial = session.snapshot;
    assert.equal(session.assets.modelIndices.length, 5);
    assert.equal(session.assets.worldObjects.modelIndices.length, 5);
    assert.deepEqual(session.assets.worldObjects.placementIndices, [4, 13, 27, 77, 108]);
    assert.ok(Object.isFrozen(initial.worldObjects)); assert.ok(Object.isFrozen(initial.worldObjects[0].position));
    const browser = runInNewContext(await buildViewerBundle('src/solo-session.mjs'), {btoa, atob, TextEncoder, TextDecoder}).createSession(data, textures);
    for (let i = 0; i < 150; i++) {session.step(); browser.step();}
    const expected = session.snapshot;
    assert.equal(frames.length, 450);
    assert.deepEqual(frames.slice(0, 3).map(frame => frame.stage), ['after-controls', 'after-physics', 'after-postframe']);
    assert.ok(Object.isFrozen(frames[0])); assert.ok(Object.isFrozen(frames[0].positionQ16));
    assert.throws(() => {frames[0].positionQ16[0] = 0;}, TypeError);
    assert.deepEqual(JSON.parse(JSON.stringify(browser.snapshot)), JSON.parse(JSON.stringify(expected)));
    assert.ok(expected.stats.wheelContacts > 0); assert.notDeepEqual(expected.position, initial.position);
    assert.notDeepEqual(expected.worldObjects[0].position, initial.worldObjects[0].position);
    assert.deepEqual(expected.worldObjects.map(row => row.modelIndex), session.assets.worldObjects.modelIndices);
    assert.throws(() => {expected.position[0] = 0;}, TypeError);
    session.reset(); assert.deepEqual(session.snapshot, initial);
    for (let i = 0; i < 150; i++) session.step();
    assert.deepEqual(session.snapshot, expected); assert.deepEqual(data, original);
    session.dispose(); session.dispose(); assert.throws(() => session.step(), /disposed/); browser.dispose();
  } finally {await archive.close();}
});
