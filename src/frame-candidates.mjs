// Complete two-pass parent stage0x4287f0. Offsets address a shared16-byte
// candidate arena; model cursor advancement intentionally uses the terrain word.
import {lookupSqrt,signedShort} from './fixed-integer.mjs';
import {appendRegionCandidates} from './terrain-candidates.mjs';
import {buildModelCandidates} from './model-candidates.mjs';
const countOf=body=>body.collisionCount10c<<24>>24;
function recordAt(records,id){if(!Number.isInteger(id)||id<0||id>255)throw Error('Frame candidates require explicit collision IDs.');const record=Buffer.isBuffer(records)?records.subarray(id*72,(id+1)*72):records[id];if(!Buffer.isBuffer(record)||record.length<72)throw Error('Frame candidates require complete72-byte records.');return record;}
function writeArena(arena,offset,candidates){for(let i=0;i<candidates.length;i++)arena.entries[(offset>>4)+i]=candidates[i];}
export function candidateArenaView(arena,body,kind='terrain'){const offset=kind==='terrain'?body.terrainCandidateOffset154:body.modelCandidateOffset158,count=kind==='terrain'?body.terrainWord15c:body.modelCandidateCount15e;return arena.entries.slice(offset>>4,(offset>>4)+(count&65535));}
// Arena offsets are relative to arena.entries[0]. Its initial cursor is explicit;
// entries beyond this frame's writes retain their prior values. Supplied hooks
// are instruction-check boundaries, while defaults use recovered algorithms.
export function buildFrameCandidates(bodies,{records,grid,models,arena,count=bodies.length,spatialStateFor=body=>({found:true,outside:body.spatialOutside,node:body.spatialBucket}),lookup=position=>grid.spatial.lookup(position),appendRegion=appendRegionCandidates,appendModels=buildModelCandidates,nativeState}={}) {
 if(!Number.isInteger(count)||count<0||count>65535||count>bodies.length)throw Error('Frame candidate count must be an in-bounds unsigned word.');
 if(!Array.isArray(arena?.entries)||!Number.isInteger(arena.startOffset)||arena.startOffset<0||(arena.startOffset&15))throw Error('Frame candidates require an explicit aligned arena startOffset and retained entries.');
 let cursor=arena.startOffset;const reports=[];
 for(let index=0;index<count;index++){
  const body=bodies[index],aggregate=recordAt(records,body.collisionIds?.[countOf(body)]);
  body.terrainCandidateOffset154=cursor;
  for(let axis=0;axis<3;axis++){aggregate.writeInt32LE(body.position[axis]>>8,8+axis*4);aggregate.writeInt32LE(body.linearVelocity[axis]>>8,0x14+axis*4);}
  body.terrainWord15c=0;body.modelCandidateCount15e=0;
  const report={body,index,skipped:null};reports.push(report);
  if((body.flags&0x200)||(body.collisionFlags&0x80000000)){report.skipped='object_filter';continue;}
  const originQ8=body.position.map(value=>value>>8),deltaQ8=body.linearVelocity.map(value=>value>>8),half=deltaQ8.map(value=>value>>1),midpoint=originQ8.map((value,axis)=>(value+half[axis])|0);
  const found=lookup(midpoint.map(value=>value<<8),body),prior=spatialStateFor(body);
  if(!found.found||!found.node)throw Error('Native frame stage requires a populated spatial lookup.');
  let node=found.node;
  if(found.outside){if(prior.outside){body.collisionState128=16;report.skipped='outside_stays_outside';continue;}if(!prior.node)throw Error('Frame candidate prior registration requires its node.');node=prior.node;}
  if((body.flags&0x1ff)===17){recordAt(records,body.collisionIds?.[0]).writeInt32LE(0x1900,0x40);recordAt(records,body.collisionIds?.[1]).writeInt32LE(0x5000,0x40);}
  const speedSquared=half.reduce((sum,value)=>(sum+Math.imul(value,value))|0,0)>>16;
  if(speedSquared)nativeState?.sqrtLookup(speedSquared); //42899c ->432e70, before region appends.
  const radius=((speedSquared?lookupSqrt(speedSquared):0)+(aggregate.readInt32LE(0x40)>>8))|0,radiusSquared=Math.imul(radius,radius),center=midpoint.map(value=>signedShort(value>>8));
  const query={originQ8,deltaQ8,radiusQ8:aggregate.readInt32LE(0x40)},zone=grid.zones.find(zone=>zone.root===node.zone);
  if(!zone)throw Error('Frame candidate spatial node has no terrain zone.');
  const candidates=[];
  //428aa0 writes every accepted row before capping its published count at64.
  //Those overrun rows survive in the shared arena (including bytes untouched
  //by later model writes), even after the logical list is truncated.
  Object.defineProperty(candidates,'push',{value:function(...entries){writeArena(arena,body.terrainCandidateOffset154+this.length*16,entries);return Array.prototype.push.apply(this,entries);}});
  const state={candidates,closest:body.closestTerrain11c,closestDistanceSquared:body.collisionBound120,dropped:0};
  for(const regionIndex of zone.regions){const region=grid.regions.find(region=>region.index===regionIndex);if(!region)throw Error('Frame candidate zone references unavailable region.');nativeState?.beforeAppendRegion?.({body,aggregate,region,query,center,radiusSquared});appendRegion(grid,region,query,center,radiusSquared,state,body,aggregate);}
  body.terrainWord15c=state.candidates.length&65535;body.closestTerrain11c=state.closest;body.collisionBound120=state.closestDistanceSquared;
  writeArena(arena,body.terrainCandidateOffset154,state.candidates);cursor=(cursor+body.terrainWord15c*16)|0;
  Object.assign(report,{spatial:{lookup:found,usedNode:node.index},query,center,radiusSquared,dropped:state.dropped});
 }
 for(let index=0;index<count;index++){
  const body=bodies[index];body.modelCandidateOffset158=cursor;
  if((body.flags&0x200)||(body.flags&0x1ff)===4)continue;
  const aggregate=recordAt(records,body.collisionIds?.[countOf(body)]),result=appendModels(models,body,{radiusQ8:aggregate.readInt32LE(0x40),spatialState:spatialStateFor(body)});
  body.modelCandidateCount15e=result.candidates.length&65535;writeArena(arena,body.modelCandidateOffset158,result.candidates);
  // Native428a72 reads+15c here, even though429360 writes+15e.
  cursor=(cursor+(body.terrainWord15c&65535)*16)|0;
 }
 return {cursor,reports,arena};
}

