import test from 'node:test';
import assert from 'node:assert/strict';
import * as source from '../src/pickup-world-state.mjs';
import {initializeWorldPickups} from '../src/pickup-world-construction.mjs';
import {verifyPickupWorldState} from '../tools/verify-pickup-world-state-instructions.mjs';
import {verifyPickupWorldConstruction} from '../tools/verify-pickup-world-construction-instructions.mjs';
import {verifyWeaponNetworkConnected} from '../tools/verify-weapon-network-connected-instructions.mjs';
test('endpoint producer preserves ordered overlapping WORD copies and four-slot exhaustion',()=>{
 const memory=Buffer.alloc(0xa00000),slot=0x911ba0;memory.writeUInt16LE(123,slot+6);memory.writeUInt16LE(456,slot+8);memory.writeUInt16LE(789,slot+10);assert.equal(source.createPickupTransition(slot+6,slot+8,12,{memory}),0);assert.deepEqual([8,10,12,16,18,20].map(o=>memory.readUInt16LE(slot+o)),[123,123,123,123,123,123]);for(let i=1;i<4;i++)memory.writeUInt16LE(1,slot+i*24);assert.equal(source.createPickupTransition(slot+6,slot+8,12,{memory}),-1);
});
test('negative transition handles leave all storage untouched',()=>{
 const memory=Buffer.alloc(0xa00000),before=Buffer.from(memory);source.updatePickupTransition(0,0,-1,{memory});assert.ok(memory.equals(before));
});
test('pending controller queue sign-extends an authored pickup byte and removes its head',()=>{
 const memory=Buffer.alloc(0xa00000);memory.writeUInt32LE(0x10000,0x90b990);memory[0x100f7]=1;memory.writeUInt32LE(0x20000,0x91d480);memory.writeInt32LE(1,0x5ec954);memory[0x91d498]=255;memory[0x91d499]=7;memory.writeUInt16LE(2,0x91d4b0);source.updatePickupRespawnControllers({memory,scratchBase:0x9000});assert.equal(memory.readInt32LE(0x20180),2);assert.equal(memory.readInt16LE(0x20186),-1);assert.equal(memory[0x91d498],7);assert.equal(memory.readUInt16LE(0x91d4b0),1);assert.equal(memory.readInt32LE(0x5ec954),0x41a7);
});
test('physical removal updates both owner lists by swapping their last body',()=>{
 const memory=Buffer.alloc(0xa00000),body=0x10000;memory.writeUInt32LE(0x20000,0x902bc0);memory.writeUInt16LE(2,0x902bc4);memory.writeUInt32LE(body,0x20000);memory.writeUInt32LE(0x11000,0x20004);memory.writeUInt32LE(0x30000,body+0x130);memory.writeUInt32LE(0x31000,0x30000);memory.writeUInt16LE(2,0x30004);memory.writeUInt32LE(body,0x31000);memory.writeUInt32LE(0x11000,0x31004);source.removePickupPhysicalLists(body,{memory});assert.equal(memory.readUInt16LE(0x902bc4),1);assert.equal(memory.readUInt32LE(0x20000),0x11000);assert.equal(memory.readUInt32LE(0x20004),0);assert.equal(memory.readUInt16LE(0x30004),1);assert.equal(memory.readUInt32LE(0x31000),0x11000);assert.equal(memory.readUInt32LE(0x31004),0);
});
test('disabled constructor publishes zero count without calling allocation',()=>{
 const memory=Buffer.alloc(0xa00000);memory.writeUInt32LE(0x10000,0x90b98c);memory.writeUInt32LE(0x20000,0x5ecb1c);memory.writeInt32LE(99,0x902024);initializeWorldPickups({memory,scratchBase:0x9000});assert.equal(memory.readInt32LE(0x902024),0);
});
test('actual populated collection, respawn and particle native closure',async()=>{const r=await verifyPickupWorldState({fixtures:36,persistent:1,output:null});assert.equal(r.calls,176);assert.equal(r.matched,true);});
test('actual constructors feed scripted timers, respawning, collection and reuse',async()=>{const r=await verifyPickupWorldConstruction({fixtures:12,chains:1,frames:180,output:null});assert.equal(r.matched,true);assert.ok(r.visits['47caf0']>=2);assert.ok(r.visits['47b920']>=2);assert.ok(r.visits['476550']>0);});
test('collected-award network payload consumes the real surviving PUSH6 stack word',async()=>{const r=await verifyWeaponNetworkConnected({fixtures:8,output:null});assert.equal(r.matched,true);assert.equal(r.networkRequests,8);assert.equal(r.visits['47b920'],4);});
