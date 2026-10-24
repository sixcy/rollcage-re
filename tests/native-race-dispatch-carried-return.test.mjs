import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {checkNativeRaceDispatchCarriedReturn} from '../tools/check-native-race-dispatch-carried-return.mjs';
import {checkNativeParentTail} from '../tools/check-native-parent-tail.mjs';

test('retained-source opt-in is boolean before any input/output filesystem operation', async () => {
  for (const value of [null, 1, 'true']) await assert.rejects(() => checkNativeParentTail('missing-input', 'unused-output', {retainCompletedSources: value}), /must be boolean/);
});

const raw = 'analysis/native-parent-final-stock-capture-v2-20261024';
test('actual FinalV2 source carry continues through live outer pops without native-after refresh', {skip: !existsSync(raw + '/trace.jsonl')}, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'rollcage-dispatch-return-'));
  try {
    const {report: r} = await checkNativeRaceDispatchCarriedReturn(raw, path.join(temporary, 'result'));
    assert.equal(r.matched, true); assert.equal(r.parentReport.completeParentTickMatched, true); assert.equal(r.parentReport.uniqueBytesCompared, 5107238);
    assert.equal(r.newNativeAfterInputBytes, 0); assert.equal(r.nativeOuterEndpointCaptured, false);
    assert.equal(r.bridge.kind, 'returned'); assert.equal(r.bridge.registers.eax, 1);
    assert.equal(r.bridge.registers.esp, 0x116fc00); assert.equal(r.bridge.registers.eip, 0x770cd5);
    assert.deepEqual([r.bridge.registers.edi, r.bridge.registers.esi, r.bridge.registers.ebp, r.bridge.registers.ebx, r.bridge.registers.ecx], [0x7704d730, 0xa61158, 4, 0, 0]);
    assert.equal(r.bridge.childExecuted, false);
    const serializedParent = JSON.parse(await readFile(path.join(temporary, 'result', 'parent-replay', 'report.json')));
    assert.equal(Object.hasOwn(serializedParent, 'completedSources'), false);
    assert.equal(serializedParent.completeParentTickMatched, true);
  } finally {
    const resolved = path.resolve(temporary);
    if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('rollcage-dispatch-return-')) throw Error('Unexpected temporary replay path.');
    await rm(resolved, {recursive: true, force: true});
  }
});
