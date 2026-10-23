import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm, access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareNativeCaptureFixture} from '../tools/prepare-native-capture-fixture.mjs';

const helper = fileURLToPath(new URL('../tools/native-physics-capture.ps1', import.meta.url));
const run = (filename, validate = false) => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-ConfigPath', filename, ...(validate ? ['-ValidateOnly'] : []), '-Quiet'], {windowsHide: true, encoding: 'utf8', timeout: 30000});
async function fixture(directory) {
  const prepared = await prepareNativeCaptureFixture(path.join(directory, 'fixture'));
  const config = JSON.parse(await readFile(path.join(prepared.directory, 'pending-frame-config.json'), 'utf8'));
  config.maxSnapshots = 6;
  config.pendingFrameObserver.nestedBreakpointIds = ['nested-compare', 'nested-return', 'nested-between'];
  config.pendingFrameObserver.maxNestedSnapshots = 2;
  config.breakpoints.push(...[
    ['nested-compare', '0x1046'], ['nested-return', '0x1061'], ['nested-between', '0x1023'],
  ].map(([id, rva]) => ({id, rva, ranges: [{id: 'counter', rva: '0x1100', length: 4}]})));
  return config;
}
async function save(directory, config, name) {
  const file = path.join(directory, `${name}.json`);
  config.outputDirectory = path.join(directory, `${name}-capture`);
  await writeFile(file, JSON.stringify(config));
  return file;
}
async function trace(directory) {
  return (await readFile(path.join(directory, 'trace.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
}
async function cleanup(directory) {
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.match(path.basename(resolved), /^rollcage-nested-/);
  await rm(resolved, {recursive: true, force: true});
}

test('nested observer configuration requires distinct bounded read-only declared points', {skip: process.platform !== 'win32'}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rollcage-nested-validation-'));
  try {
    const config = await fixture(directory), good = run(await save(directory, config, 'good'), true);
    assert.equal(good.status, 0, good.stdout + good.stderr);
    for (const [name, edit, pattern] of [
      ['zero', c => {c.pendingFrameObserver.maxNestedSnapshots = 0;}, /snapshot bound/],
      ['large', c => {c.pendingFrameObserver.maxNestedSnapshots = 129;}, /snapshot bound/],
      ['empty', c => {c.pendingFrameObserver.nestedBreakpointIds = [];}, /zero bound/],
      ['unknown', c => {c.pendingFrameObserver.nestedBreakpointIds.push('undeclared');}, /unique declared/],
      ['duplicate', c => {c.pendingFrameObserver.nestedBreakpointIds.push('nested-compare');}, /unique declared/],
      ['event', c => {c.pendingFrameObserver.nestedBreakpointIds.push('dispatch');}, /distinct from/],
      ['stop', c => {c.breakpoints[3].stopAfterHits = 1;}, /cannot stop, skip or perform services/],
      ['skip', c => {c.breakpoints[3].skipMatchingHits = 1; c.breakpoints[3].captureWhen = {range: {id: 'nested-zero', rva: '0x1104', length: 4}, equalsBytesHex: '00000000'};}, /cannot stop, skip or perform services/],
      ['write', c => {c.phaseActions = [{breakpointId: 'nested-compare', hit: 1, writes: []}];}, /phaseActions cannot reference/],
    ]) {
      const value = structuredClone(config); edit(value);
      const result = run(await save(directory, value, name), true);
      assert.notEqual(result.status, 0, name); assert.match(result.stdout + result.stderr, pattern, name);
      await assert.rejects(access(value.outputDirectory));
    }
  } finally {await cleanup(directory);}
});

test('owned synthetic frames discard nested observations then commit exact observed order without changing selection', {skip: process.platform !== 'win32'}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rollcage-nested-execution-'));
  try {
    const config = await fixture(directory), result = run(await save(directory, config, 'ordered'));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const rows = await trace(config.outputDirectory), snapshots = rows.filter(row => row.type === 'snapshot');
    assert.deepEqual(snapshots.map(row => row.breakpointId), ['nested-between', 'frame-before', 'nested-compare', 'dispatch', 'nested-return', 'frame-after']);
    assert.deepEqual(snapshots.map(row => row.ordinal), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(snapshots.map(row => row.hit), [1, 1, 1, 1, 1, 1]);
    const nested = snapshots.find(row => row.breakpointId === 'nested-compare');
    assert.equal(nested.rawHit, 2); assert.equal(nested.matchingHit, 2);
    assert.equal(nested.pendingFrame.role, 'nested');
    assert.equal(nested.pendingFrame.nestedSnapshots, 2);
    const discarded = rows.filter(row => row.type === 'pending-frame-discarded');
    assert.equal(discarded.length, 1); assert.equal(discarded[0].nestedSnapshots, 1);
    assert.equal(discarded[0].qualifyingEventSnapshots, 0);
    const committed = rows.find(row => row.type === 'pending-frame-selected');
    assert.equal(committed.qualifyingEventSnapshots, 1); assert.equal(committed.nestedSnapshots, 2);
    assert.equal(committed.firstOrdinal, 2); assert.equal(committed.lastOrdinal, 6);
    assert.ok(snapshots.every((row, i) => Number.isInteger(row.observedDebugEventOrdinal) && (!i || row.observedDebugEventOrdinal > snapshots[i - 1].observedDebugEventOrdinal)));
    assert.equal(rows.find(row => row.type === 'complete').reason, 'snapshot-bound');
    for (const snapshot of snapshots) {
      const range = snapshot.ranges.find(row => row.id === 'counter');
      assert.equal((await readFile(path.join(config.outputDirectory, range.file))).readUInt32LE(), snapshot === snapshots[0] || snapshot === snapshots[1] ? 1 : 2);
    }
  } finally {await cleanup(directory);}
});

test('nested execution retains byte/global/nested bounds and rejects undeclared interleaving', {skip: process.platform !== 'win32'}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rollcage-nested-bounds-'));
  try {
    const config = await fixture(directory);
    for (const [name, edit, pattern] of [
      ['nested-bound', c => {c.pendingFrameObserver.maxNestedSnapshots = 1;}, /nested snapshot bound/],
      ['byte-bound', c => {c.pendingFrameObserver.maxPendingBytes = 1600;}, /host-buffer byte bound/],
      ['global-bound', c => {c.maxSnapshots = 5;}, /remaining global snapshot bound/],
      ['undeclared', c => {c.pendingFrameObserver.nestedBreakpointIds = ['nested-compare', 'nested-between'];}, /Unrelated observation/],
    ]) {
      const value = structuredClone(config); edit(value);
      const result = run(await save(directory, value, name));
      assert.notEqual(result.status, 0, name); assert.match(result.stdout + result.stderr, pattern, name);
      const rows = await trace(value.outputDirectory);
      assert.ok(rows.some(row => row.type === 'capture-error'), name);
      assert.ok(!rows.some(row => row.type === 'pending-frame-selected'), name);
      assert.equal(rows.filter(row => row.type === 'snapshot').length, 1, 'Only the earlier independent observation can be published.');
      assert.equal(rows.find(row => row.type === 'owned-process-cleanup').terminated, true);
    }
  } finally {await cleanup(directory);}
});
