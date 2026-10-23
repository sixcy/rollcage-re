import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';
import {replayNativeControlThroughPhysics} from '../tools/lib/native-control-physics.mjs';
import {compareNativeControlOutput} from '../tools/check-native-frame-control-prefix.mjs';

const directory = 'analysis/native-physics-local/startup-20261022/control-prefix-v4-20261023';
test('original V4 physics consumes genuine source prephysics state without an intermediate refresh', {skip: !existsSync(`${directory}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(directory), configuration = JSON.parse(await readFile(`${directory}/configuration.json`));
  const pairing = pairNativeControlSnapshots(capture, configuration), pair = pairing.pairs[0];
  let prefix, positions;
  const source = replayNativeControlThroughPhysics(pair.before, {...pairing.options, moduleBaseAddress: pair.moduleBaseAddress,
    onPrefixComplete: source => {
      prefix = compareNativeControlOutput(source, pair.after);
      positions = Array.from({length: 6}, (_, i) => {
        const body = source.memory.readUInt32LE(0x909300 + i * 0x30c);
        return {body, bytes: Buffer.from(source.span(body + 0x34, 12))};
      });
    }});
  assert.equal(prefix.matched, true);
  for (const [name, value] of Object.entries(source.derivedPhysicsRegisters.registers)) assert.equal(value, Number(pair.after.registers[name]), name);
  for (const unknown of ['eax', 'edx', 'eflags']) assert.equal(Object.hasOwn(source.manifest.entryRegisters, unknown), false);
  assert.equal(source.report.nativeReturn, 0);
  assert.equal(source.report.preparedBodies, 14);
  assert.equal(source.report.scriptedBodies, 2);
  assert.equal(source.report.vehicles.length, 6);
  assert.ok(positions.every(row => !source.span(row.body + 0x34, 12).equals(row.bytes)), 'All six cars actually move during physics.');
  const result = compareNativeControlOutput(source, pair.physicsAfter);
  assert.equal(result.matched, true);
  assert.equal(result.bytesCompared, 4984964);
  assert.equal(result.uniqueBytesCompared, 4984832);
  assert.equal(result.overlappingComparedBytes, 132);
  assert.equal(result.protectedControlBytes, 720);
  assert.equal(result.parentAbiBytesCompared, 28);
  assert.equal(compareNativeControlOutput(source, pair.after).matched, false, 'Physics-entry state cannot stand in for the computed physics exit.');

  const address = positions[0].body + 0x34, original = Buffer.from(source.span(address, 12));
  const corrupted = {...pair.physicsAfter, ranges: new Map([...pair.physicsAfter.ranges].map(([id, row]) => {
    const bytes = Buffer.from(row.bytes), offset = address - Number(row.address);
    if (offset >= 0 && offset < bytes.length) bytes[offset] ^= 1;
    return [id, {...row, bytes}];
  }))};
  const mismatch = compareNativeControlOutput(source, corrupted);
  assert.equal(mismatch.matched, false);
  assert.equal(mismatch.firstDivergence.address, address);
  assert.deepEqual(source.span(address, 12), original);
  assert.equal(compareNativeControlOutput(source, pair.physicsAfter).matched, true);
});
