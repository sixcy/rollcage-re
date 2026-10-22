import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTrackResource, loadDiskTrackResource} from '../src/track-resource-loading.mjs';

function fixture(archived = false) {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p), calls = [];
  memory.write('LOW/LEVEL.BLP\0', 0x100000); memory.write('missing\0', 0x100080); memory.write('low__level_blp\0', 0x100100);
  for (let i = 0; i < 324; i++) {put(0x5eb600 + i * 8, 0x100080); memory.writeUInt16LE(65535, 0x5eb604 + i * 8);}
  if (archived) {put(0x5eb600, 0x100100); memory.writeUInt16LE(3, 0x5eb604);}
  put(0x5e8000, 0x1234); put(0x5e8004, 0x5678); memory.writeInt16LE(1, 0x5e8008);
  put(0x717388, 0x110000); put(0x110030, 64); put(0x110034, 4); put(0x110038, 4); memory.writeInt16LE(2, 0x11003c);
  put(0x6e6708, 1); put(0x6e4900, 0x99);
  let position = 5;
  const libraryCall = (name, args) => {
    calls.push([name, ...args]);
    if (name === 'allocate') {memory.fill(0xcd, 0x400000, 0x400000 + args[0]); return 0x400000;}
    if (name === 'fopen') return 0x99;
    if (name === 'fread') {memory.set([11, 22, 33, 44], args[0]); return 4;}
    return 0;
  };
  const platformCall = (name, args) => {
    calls.push([name, ...args]);
    if (name === 'CreateFileA') return 0x270000;
    if (name === 'SetFilePointer') {if (args[3] === 2) position = 20; else if (args[3] === 0) position = args[1]; return position;}
    if (name === 'ReadFile') {memory.set([position, position + 1, position + 2], args[1]); put(args[3], 3); return 0;}
    return 1;
  };
  return {memory, put, calls, runtime: {memory, scratchBase: 0x9000, services: {libraryCall, platformCall, crtCall: libraryCall}}};
}

test('archive loading installs the real zeroing adapter and restores captured hooks after service changes', () => {
  const f = fixture(true), original = f.runtime.services.libraryCall;
  f.runtime.services.libraryCall = (name, args, runtime) => {
    if (name === 'fread') {
      assert.equal(f.memory.readUInt32LE(0x5e8000), 0x4512c0);
      assert(f.memory.subarray(args[0], args[0] + 13).every(v => v === 0));
      f.put(0x5e8000, 0xaabbccdd); f.put(0x5e8004, 0x11223344);
    }
    return original(name, args, runtime);
  };
  assert.equal(loadTrackResource(0x100000, f.runtime), 0x400000);
  assert.deepEqual([...f.memory.subarray(0x400000, 0x400006)], [11, 22, 33, 44, 0, 0]);
  assert.equal(f.memory.readUInt32LE(0x5e8000), 0x1234); assert.equal(f.memory.readUInt32LE(0x5e8004), 0x5678);
  assert.equal(f.memory.readInt16LE(0x5e8008), 1);
});

test('disk loading restores the prior file position and returns zero-filled short-read storage despite failed status', () => {
  const f = fixture(); assert.equal(loadTrackResource(0x100000, f.runtime), 0x400000);
  assert.deepEqual(f.calls.filter(([name]) => name === 'SetFilePointer').map(row => row.slice(2)), [[0, 0, 1], [0, 0, 2], [5, 0, 0]]);
  assert.deepEqual([...f.memory.subarray(0x400000, 0x400006)], [5, 6, 7, 0, 0, 0]);
  assert.equal(f.calls.filter(([name]) => name === 'CloseHandle').length, 1);
});

test('a failed disk allocation still reaches the native ReadFile with a null destination', () => {
  const f = fixture(), original = f.runtime.services.libraryCall;
  f.runtime.services.libraryCall = (name, args) => name === 'allocate' ? 0 : original(name, args);
  assert.equal(loadDiskTrackResource(0x100000, f.runtime), 0);
  const read = f.calls.find(([name]) => name === 'ReadFile'); assert.equal(read[2], 0); assert.equal(read[4], 0x9000 - 28);
  assert.deepEqual([...f.memory.subarray(0, 3)], [5, 6, 7]);
});

test('a cached handle advances its cursor and releases cache ownership after a null allocation', () => {
  const f = fixture(); f.put(0x90c0a0, 0x270000); f.put(0x90c0a4, 3);
  const original = f.runtime.services.libraryCall; f.runtime.services.libraryCall = (name, args) => name === 'allocate' ? 0 : original(name, args);
  assert.equal(loadDiskTrackResource(0x100000, f.runtime), 0);
  assert.equal(f.memory.readUInt32LE(0x90c0a0), 0); assert.equal(f.memory.readUInt32LE(0x90c0a4), 23);
  assert(f.calls.some(row => row[0] === 'free' && row[1] === 0x270000));
  assert(!f.calls.some(row => row[0] === 'ReadFile' || row[0] === 'CloseHandle'));
});
