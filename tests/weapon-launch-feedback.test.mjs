import test from 'node:test';
import assert from 'node:assert/strict';
import {findLocalWeaponParticipant, publishWeaponLaunchFeedback, initializeWeaponLaunchFeedbackTables} from '../src/weapon-launch-feedback.mjs';
function fixture(){const memory=Buffer.alloc(0xa00000),session=0x20000;memory.writeUInt32LE(session,0x5ecb1c);initializeWeaponLaunchFeedbackTables(memory);return{memory,session,scratchBase:0x9000};}
test('local participant selector chooses the first byte-equal marker and otherwise zero',()=>{
 const f=fixture(),m=f.memory;m[f.session+0x54d]=4;m[0x90931d]=2;m[0x90931d+2*0x30c]=1;m[0x90931d+3*0x30c]=1;assert.equal(findLocalWeaponParticipant(f),2);m[0x90931d+2*0x30c]=0;m[0x90931d+3*0x30c]=0;assert.equal(findLocalWeaponParticipant(f),0);m[f.session+0x54d]=0;assert.equal(findLocalWeaponParticipant(f),0);
});
test('missing notification gates preserve public bytes and RNG',()=>{
 for(const flags of[0,1,5,0x41]){const f=fixture(),m=f.memory;m.writeInt32LE(flags,0x6eafe0);m.writeInt32LE(123,0x5ec958);const before=Buffer.from(m.subarray(0x10000));publishWeaponLaunchFeedback(0,0,0,f);assert.deepEqual(m.subarray(0x10000),before);}
});
test('forced signed kind bypasses the bit40 gate and publishes history',()=>{
 const f=fixture(),m=f.memory;m.writeInt32LE(5,0x6eafe0);m[f.session+0x54d]=1;m[f.session+0x721]=128;m.write('Driver\0',0x6e7894,'latin1');m.writeInt32LE(123,0x5ec958);publishWeaponLaunchFeedback(0,0,128,f);assert.match(m.toString('latin1',0x6eaedc,m.indexOf(0,0x6eaedc)),/^Driver/);assert.equal(m.readInt32LE(0x5ec958),Math.imul(123,0x41a7)&0x7fffffff);assert.equal(m.readInt32LE(f.scratchBase+4),0);
});
