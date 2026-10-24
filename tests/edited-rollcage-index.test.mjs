import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import stock from '../src/rollcage-editable-index.json' with {type:'json'};
import {recoverEditedRollcageIndex} from '../src/edited-rollcage-index.mjs';
import {identifyGame,getGame} from '../src/track-games.mjs';
import {RollcageArchive} from '../src/archive.mjs';
import {parseIndex} from '../src/archive-index.mjs';
import {buildEditedArchive} from '../src/archive-write.mjs';
import {createPickupDraft,compilePickupEdits} from '../src/pickup-editor.mjs';

function syntheticIndex(){const index=Buffer.alloc(stock.indexBytes);for(const row of stock.entries)index.set(Buffer.from(row.bytesHex,'hex'),row.index*16);return index;}
function editedIndex(){const index=syntheticIndex(),p=stock.entries[0].index*16;index.writeUInt32LE(stock.imageBytes,p);index.writeUInt32LE(256,p+4);index.writeUInt32LE(256,p+8);return {index,p};}
test('recovery only normalizes allowed appended resource fields and keeps the source index immutable',()=>{
  const {index}=editedIndex(),before=Buffer.from(index),result=recoverEditedRollcageIndex(index);assert.deepEqual(result.changed,[stock.entries[0].index]);assert.deepEqual(result.indexData,syntheticIndex());assert.deepEqual(index,before);
  assert.equal(recoverEditedRollcageIndex(syntheticIndex()),null);assert.equal(recoverEditedRollcageIndex(Buffer.alloc(32)),null);
});
test('changed metadata, in-place replacements, compression, overlap and native bounds cannot be recognized as editor output',()=>{
  for(const change of [(d,p)=>d.writeUInt16LE(1,p+12),(d,p)=>d.writeUInt32LE(0,p),(d,p)=>d.writeUInt32LE(stock.imageBytes+1,p),(d,p)=>d.writeUInt32LE(128,p+8),(d,p)=>d.writeUInt32LE(0,p+4),(d,p)=>d.writeUInt32LE(0x7ffffffc,p)]){const {index,p}=editedIndex();change(index,p);assert.equal(recoverEditedRollcageIndex(index),null);}
  const {index}=editedIndex(),p=stock.entries[1].index*16;index.writeUInt32LE(stock.imageBytes+4,p);index.writeUInt32LE(256,p+4);index.writeUInt32LE(256,p+8);assert.equal(recoverEditedRollcageIndex(index),null);
});
test('restoring plausible track rows does not establish a known archive fingerprint',async()=>{
  const {index}=editedIndex();await assert.rejects(identifyGame({indexData:index,entries:[],async readResource(){throw Error('Must not read an unknown base');}}),/Unrecognized archive/);
});
test('real editor exports and repeated exports retain automatic detection; wrong original IMG sentinels and unrelated IDX changes fail',async t=>{
  const root='analysis/pickup-editor-native-baseline-20261024/installation';try{await access(root);}catch{t.skip('Retained pristine archive is unavailable.');return;}
  const source=await RollcageArchive.open(root);
  try{
    const track=getGame('rollcage').tracks[0],geometry=(await source.readResource(track.index)).data,rows=createPickupDraft(geometry);rows[0].position[0]++;
    const bytes=compilePickupEdits(geometry,rows),plan=buildEditedArchive(source.indexData,stock.imageBytes,new Map([[track.index,bytes]])),payloads=new Map([[plan.changes[0].offset,bytes]]);
    const archive={indexData:plan.index,entries:parseIndex(plan.index,plan.imageBytes),position:99,async readResource(index){const entry=this.entries[index];if(payloads.has(entry.offset))return {data:payloads.get(entry.offset)};return source.readResource(index);}};
    const found=await identifyGame(archive);assert.equal(found.verified,true);assert.equal(found.modified,true);assert.equal(found.game.id,'rollcage');assert.equal(archive.position,99);assert.equal(archive.entries[track.index].offset,plan.changes[0].offset);
    const next=buildEditedArchive(plan.index,plan.imageBytes,new Map([[track.index,bytes]]));payloads.set(next.changes[0].offset,bytes);archive.indexData=next.index;archive.entries=parseIndex(next.index,next.imageBytes);assert.equal((await identifyGame(archive)).modified,true);
    const unrelated=Buffer.from(next.index);unrelated[0]^=1;await assert.rejects(identifyGame({...archive,indexData:unrelated}),/Unrecognized archive/);
    const damaged={...archive,async readResource(index){const result=await archive.readResource.call(this,index);if(index===track.index&&this.entries[index].offset<stock.imageBytes){const data=Buffer.from(result.data);data[0x30]^=1;return {data};}return result;}};
    await assert.rejects(identifyGame(damaged),/does not match the original IMG/);
  }finally{await source.close();}
});
