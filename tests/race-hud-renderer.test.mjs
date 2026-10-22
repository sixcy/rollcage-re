import test from 'node:test';
import assert from 'node:assert/strict';
import {constructGameTexture} from '../src/game-texture-construction.mjs';
import {verifyRaceHudRenderer} from '../tools/verify-race-hud-renderer-connected-instructions.mjs';

test('unknown renderer targets remain explicit reached game boundaries', () => {
  const memory=Buffer.alloc(0xa00000),put=(p,v)=>memory.writeInt32LE(v|0,p);put(0x6e1620,-1);put(0x714ae8,0x100000);put(0x100000,0x110000);put(0x110078,0x123456);
  assert.throws(()=>constructGameTexture(0,1,1,32,0,0,0,{memory,scratchBase:0x9000}),/Unrecovered game renderer virtual\+78 target0x123456/);
});
test('installed font uses actual pool acquisition and renderer upload defaults', async () => {
  const report=await verifyRaceHudRenderer({fixtures:1,mipmaps:false,output:null});assert.equal(report.matched,true);assert.equal(report.rendererAcquisitions,1);assert.equal(report.rendererUploads,1);assert.equal(report.platformTransfers,1);
});
