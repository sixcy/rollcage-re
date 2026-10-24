import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {verifyNativeRaceStepClockInstructions,originalClockTarget} from '../tools/verify-native-race-step-clock-instructions.mjs';

test('full timing instructions execute both conversions and true integer helpers with all owned memory and API preimages',
  {skip:!existsSync(originalClockTarget)}, async () => {
    const report = await verifyNativeRaceStepClockInstructions({fixtures:330});
    assert.equal(report.matched,true); assert.equal(report.fixtures,330);
    assert.equal(report.firstDelivery,66); assert.equal(report.initializedCalls,275); assert.equal(report.totalFixtures,341);
    for(const address of ['0x441c70','0x489cd0','0x568d6e','0x568c41','0x568bfd','0x568f10','0x569380'])assert.ok(report.actualChildren[address]>0,`Actual child ${address}`);
    assert.ok(report.qpfFailures>0);assert.ok(report.qpcFailures>0);assert.ok(report.catchup>0);
    assert.equal(report.authority,'constructed-inputs-with-retained-original-instructions');
    assert.equal(report.comparedStack.alsoComparedInWholeMemory,true);
    assert.equal(report.schedulerInstructionsReached,report.schedulerInstructions);
    assert.ok(report.explicitScheduling.some(row=>row.count===2));
    assert.ok(report.excluded.some(value=>value.includes('No original-process')));
  });
