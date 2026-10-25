import test from 'node:test';
import assert from 'node:assert/strict';
import {checkEditorLifecycleEvidence} from '../tools/lib/editor-lifecycle-evidence.mjs';

// Synthetic proof records test checker admission boundaries, not native output.
function fixture(){
  const data=Buffer.alloc(0x300),dataBase=0x100000,moduleBase=0x400000,bodyAddresses=new Map([[1,0x200000],[2,0x210000]]),carAddresses=[0x300000,0x310000,0x320000,0x330000,0x340000,0x350000],placements=[{index:1,configurationOffset:0x240,configurationBytes:4,groupId:1,previousIndex:-1,nextIndex:-1,attachmentCount:1},{index:2,configurationOffset:0x244,configurationBytes:4,groupId:2,previousIndex:-1,nextIndex:-1,attachmentCount:1}];data.writeUInt32LE(0xf4000000,0x240);data.writeUInt32LE(0xf4000000,0x244);
  const row=(index,released=false)=>{const p=placements.find(p=>p.index===index),body=Buffer.alloc(0x1b4),configuration=Buffer.alloc(4);body.writeUInt16LE(p.groupId,0x190);body.writeUInt16LE(index,0x192);body.writeUInt32LE(dataBase+p.configurationOffset,0x194);body[0x19a]=index===2?5:0;body.writeUInt16LE(released?0:0x2000+index,0x16a);configuration.writeUInt32LE(index===2?0x05000000:0xf4000000);return {index,body:'0x'+bodyAddresses.get(index).toString(16),bodyHex:body.toString('hex'),configuration:'0x'+(dataBase+p.configurationOffset).toString(16),configurationHex:configuration.toString('hex')};};
  const event=(kind,ordinal,released)=>({type:'editor-lifecycle-event',kind,tid:1,ordinal,nativeOutputsWritten:false,registers:{eip:'0x'+(moduleBase+0x51155).toString(16)},originals:[row(1)],clones:[row(2,released)],originalConfigurationsUnchanged:true,cloneConfigurationChanged:true,destructionStarted:true,attachmentsReleased:released});
  return {events:[event('independent-clone-damage',11,false),event('clone-attachments-released',12,true)],data,expected:{lifecycleProbe:{timingEnabled:false,originalIndices:[1],cloneIndices:[2],materialOffsets:[],requireLap:false,requirePad:false,requireDestruction:true},topologyProbe:{checkpointCount:2,checkpointIdsHex:'00ffffff01ffffff',checkpointOffset:0x120},probe:{placements}},dataBase,moduleBase,tid:1,firstTickOrdinal:10,bodyAddresses,carAddresses};
}

test('lifecycle proof separates independent damage from later complete attachment release',()=>{
  const f=fixture(),proof=checkEditorLifecycleEvidence(f);assert.equal(proof.independentDamageObserved,true);assert.equal(proof.allAttachmentOwnersReleased,true);assert.equal(proof.damage[0].allOwnedAttachmentsReleased,false);assert.equal(proof.release[0].allOwnedAttachmentsReleased,true);
});

test('zero handles on an unattached tail cannot prove release of its attached owner',()=>{
  const f=fixture(),release=f.events[1],body=Buffer.from(release.clones[0].bodyHex,'hex');body.writeUInt16LE(0x2002,0x16a);release.clones[0].bodyHex=body.toString('hex');assert.throws(()=>checkEditorLifecycleEvidence(f),/strictly equal/);
});

test('cloned configuration storage aliases and original damage at the independence event reject',()=>{
  const f=fixture();f.events[0].clones[0].configuration=f.events[0].originals[0].configuration;assert.throws(()=>checkEditorLifecycleEvidence(f),/assertion|expression|strictly equal/i);
  const other=fixture();other.events[0].originals[0].configurationHex='00000005';other.events[0].originalConfigurationsUnchanged=false;assert.throws(()=>checkEditorLifecycleEvidence(other),/Original configurations must remain unchanged/);
});

test('later natural original damage is factual without invalidating previously proven independence',()=>{
  const f=fixture();f.events[1].originals[0].configurationHex='00000005';f.events[1].originalConfigurationsUnchanged=false;const proof=checkEditorLifecycleEvidence(f);assert.equal(proof.damage[0].originalsUnchanged,true);assert.equal(proof.release[0].originalsUnchanged,false);
});
