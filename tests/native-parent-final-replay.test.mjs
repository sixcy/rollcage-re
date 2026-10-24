import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {checkNativeParentTail} from '../tools/check-native-parent-tail.mjs';

const raw = 'analysis/native-parent-final-stock-capture-v2-20261024';

test('original FinalV2 executes one carried parent through real RET, independent clocks and declared final inputs',
  {skip:!existsSync(`${raw}/trace.jsonl`)}, async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'rollcage-final-parent-replay-'));
    try {
      const {report:r} = await checkNativeParentTail(raw, path.join(temporary, 'result')), f = r.frames[0];
      assert.equal(r.matched, true); assert.equal(r.sourceComplete, true);
      assert.equal(r.completeParentTickMatched, true); assert.equal(r.comparedFrames, 1);
      for (const result of [f.afterAi, f.prefix, f.physics]) assert.equal(result.matched, true);
      assert.deepEqual(f.stages.map(s => s.stage), ['attachments','recovery','drive','auxiliary','cameras','world-effects','parent-return']);
      assert.ok(f.stages.every(s => s.comparison.matched && s.comparison.differingBytes === 0));
      const final = f.stages.at(-1);
      assert.equal(final.comparison.uniqueBytesCompared, 5107238);
      assert.equal(final.execution.clock, 289); assert.equal(final.execution.eax, 1);
      assert.equal(final.comparison.parentAbiBytesCompared, 28);
      assert.equal(f.execution.parentReturned, true); assert.equal(f.execution.parentPreRetReached, true);
      assert.equal(f.execution.parentReturn.entryEsp, 0x116fbe0);
      assert.deepEqual(f.returnedRegisters.map(({name, source, native, matched}) => [name,source,native,matched]), [
        ['eax',1,1,true],['edi',1,1,true],['esi',0,0,true],['ebp',0,0,true],['ebx',0,0,true],
        ['esp',0x116fbe4,0x116fbe4,true],['eip',0x780e38,0x780e38,true]
      ]);
      assert.deepEqual(f.execution.finalInputAdmissions.map(s => [s.stage,s.originalOrdinal]), [['lights',4],['listeners',4],['manager',4]]);
      assert.ok(final.comparison.regions.some(r => r.id.startsWith('final-source-owned-light-bands-') && r.length === 2272));
      assert.ok(final.comparison.regions.some(r => r.id.startsWith('final-source-listener-0-destination-') && r.length === 80));
      assert.ok(final.comparison.regions.some(r => r.id.startsWith('final-source-manager-level-') && r.length === 4));
      assert.deepEqual(f.sourceRttiEvents.map(e => e.family), ['camera','weather-screen','weather-screen']);
      assert.equal(f.sourceCounterEvents.length, 1);
      assert.equal(f.sourceCounterEvents[0].authority, 'observed-external-QPC-only');
      assert.deepEqual(f.sourceSoundCreationEvents, [], 'This positive case does not prove active sound creation or combat.');
      assert.ok(r.limits.some(l => l.includes('outer producers remain open')));
    } finally {
      const resolved = path.resolve(temporary);
      if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('rollcage-final-parent-replay-')) throw Error('Unexpected temporary replay path.');
      await rm(resolved, {recursive:true, force:true});
    }
  });
