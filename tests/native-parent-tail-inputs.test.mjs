import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeParentTailAdditionalRegions} from '../tools/lib/native-parent-tail-inputs.mjs';
import {nativeParentLateObservedInputRegions} from '../tools/lib/native-parent-late-inputs.mjs';

//Synthetic input admission fixtures. No native output values are supplied.
function fixture() {
  const base = 0x730000, actual = p => base + p - 0x400000;
  const count = Buffer.alloc(4); count.writeUInt32LE(4);
  const lights = Buffer.alloc(3 * 64), points = Buffer.alloc(3 * 8, 0x73);
  lights.writeInt16LE(1, 0x24);
  lights.writeInt16LE(1, 64 + 0x24); lights.writeUInt32LE(0x919140, 64 + 0x30);
  lights.writeInt16LE(2, 128 + 0x24);
  const ranges = [{id:'count', address:actual(0x80f20c), bytes:count},
    {id:'lights', address:actual(0x80f560), bytes:lights},
    {id:'points', address:actual(0x90b688), bytes:points}];
  return {base, actual, lights, count, points, snapshot:{moduleBaseAddress:base, ranges}};
}

test('live authored light dirty/position slots are inputs even without a queued attachment handle', () => {
  const f = fixture(), original = Buffer.from(f.points);
  const rows = nativeParentTailAdditionalRegions(f.snapshot).filter(r => r.id.startsWith('tail-live-light-point-'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].preferredAddress, 0x90b688);
  assert.equal(rows[0].address, f.actual(0x90b688)); assert.equal(rows[0].length, 8);
  assert.equal(rows[0].comparison, 'mutable'); assert.equal('bytes' in rows[0], false);
  assert.deepEqual(f.points, original, 'Admission preserves the actual flag; it never clears it.');
  f.lights.writeUInt32LE(0, 64 + 0x30);
  assert.equal(nativeParentTailAdditionalRegions(f.snapshot).filter(r => r.id.startsWith('tail-live-light-point-')).length, 2,
    'A changed live script-body pointer changes which existing slots the source can read.');
});

test('light input admission rejects out-of-pool counts and missing slot backing without creating bytes', () => {
  const f = fixture(); f.count.writeUInt32LE(72);
  assert.throws(() => nativeParentTailAdditionalRegions(f.snapshot), /70-slot/);
  f.count.writeUInt32LE(4); f.snapshot.ranges[1].bytes = f.lights.subarray(0, 127);
  assert.throws(() => nativeParentTailAdditionalRegions(f.snapshot), /Uncaptured/);
  const complete = fixture(); complete.snapshot.ranges.pop();
  assert.equal(nativeParentTailAdditionalRegions(complete.snapshot).some(r => r.id.startsWith('tail-live-light-point-')), false);
});

test('alternate attachment mesh is an exact observed DWORD, not its unobserved pointee or a table default', () => {
  const base = 0x730000, address = base + 0x519140, bytes = Buffer.from('2601000c', 'hex');
  const rows = nativeParentLateObservedInputRegions({ranges:[{address, bytes}]}, base);
  const mesh = rows.find(r => r.id === 'late-attachment-alternate-mesh');
  assert.ok(mesh); assert.equal(mesh.address, address); assert.equal(mesh.preferredAddress, 0x919140);
  assert.equal(mesh.length, 4); assert.equal(mesh.comparison, 'read-only'); assert.equal('bytes' in mesh, false);
  assert.equal(nativeParentLateObservedInputRegions({ranges:[{address, bytes:bytes.subarray(0,3)}]}, base).length, 0);
});
