import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameAudioCopyServices} from '../tools/lib/game-audio-copy-fixtures.mjs';
import {constructGameSoundOwner, appendGameSoundOwner, reserveGameSoundOwners} from '../src/game-sound-owner.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p);
  const runtime = {memory, scratchBase: 0x1f000, sehWord: 0x12345678};
  return {memory, put, runtime};
}

test('self-referenced sound-owner append rebases after growth and survives deletion of the old buffer', () => {
  const {memory: m, put, runtime} = fixture(), array = 0x100000, output = 0x110000;
  put(0x6f2414, array); put(0x6f2418, array + 8); put(0x6f241c, array + 8); put(array, 11); put(array + 4, 22);
  runtime.services = {libraryCall(name, args) {
    if (name === 'operatorNew') {put(array + 4, 33); return output;}
    if (name === 'memmove') {Buffer.from(m.subarray(args[1], args[1] + args[2])).copy(m, args[0]); return args[0];}
    if (name === 'operatorDelete') {m.fill(0xcd, array, array + 8); return 0;}
    throw Error(`Unexpected CRT ${name}`);
  }};
  appendGameSoundOwner(array + 4, runtime);
  assert.deepEqual([0, 4, 8].map(offset => m.readInt32LE(output + offset)), [11, 33, 33]);
  assert.equal(m.readUInt32LE(0x6f2418), output + 12);
});

test('external sound-owner append reads its source after allocator side effects', () => {
  const {memory: m, put, runtime} = fixture(), input = 0x100000, output = 0x110000;
  put(input, 17);
  runtime.services = {libraryCall(name, args) {
    if (name === 'operatorNew') {put(input, 29); return output;}
    if (name === 'memmove') return args[0];
    throw Error(`Unexpected CRT ${name}`);
  }};
  appendGameSoundOwner(input, runtime);
  assert.equal(m.readInt32LE(output), 29); assert.equal(m.readUInt32LE(0x6f2418), output + 4);
});

test('reserve captures length after copying and retains that capture across deletion-side global changes', () => {
  const {memory: m, put, runtime} = fixture(), array = 0x100000, output = 0x110000;
  put(0x6f2414, array); put(0x6f2418, array + 4); put(0x6f241c, array + 4);
  runtime.services = {libraryCall(name, args) {
    if (name === 'operatorNew') return output;
    if (name === 'memmove') {put(0x6f2418, array + 8); return args[0];}
    if (name === 'operatorDelete') {put(0x6f2414, 0); put(0x6f2418, 0); return 0;}
    throw Error(`Unexpected CRT ${name}`);
  }};
  reserveGameSoundOwners(4, runtime);
  assert.deepEqual([0x6f2414, 0x6f2418, 0x6f241c].map(p => m.readUInt32LE(p)), [output, output + 8, output + 16]);
});

test('null handle allocation retains the copied descriptor and untouched owner padding without invoking a sample factory', () => {
  const {memory: m, put, runtime} = fixture(), object = 0x100000, descriptor = 0x110000;
  m.fill(0x57, object, object + 0x490); m.write('SFX_TEST\0', descriptor); m.write('BANK\0', descriptor + 24); m.write('test.wav\0', descriptor + 48, 'utf16le');
  put(descriptor + 0x430, 0x12345678);
  const copies = createGameAudioCopyServices(m);
  runtime.services = {libraryCall(name, args, context) {return name === 'operatorNew' ? 0 : copies.libraryCall(name, args, context);}};
  assert.equal(constructGameSoundOwner(object, 123, descriptor, runtime), object);
  assert.equal(m.readUInt32LE(object), 0); assert.equal(m.readUInt32LE(object + 0x440), 0x12345678);
  assert.deepEqual([0x480, 0x484, 0x488, 0x48c].map(offset => m.readUInt32LE(object + offset)), [0, 0x57575757, 0, 0]);
  assert.equal(m.readUInt32LE(runtime.scratchBase + 8), 0);
});
