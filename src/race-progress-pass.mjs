import {selectFinishRoute} from './finish-bookkeeping.mjs';
import {transitionCheckpoint} from './respawn-progress.mjs';
//449640 captures participant count once. Its local rank and score arrays are
//caller-owned bytes: rank holes, duplicate ranks and overlaps retain memory.
export function runRaceProgressPass({memory,scratchBase,progression,checkpointOptions={},handlers={}}) {
 if(!Buffer.isBuffer(memory)||!Number.isInteger(scratchBase)||scratchBase<0)throw Error('Race progression requires explicit memory and scratch base.');
 const pack=memory.readUInt32LE(0x90b98c),session=memory.readUInt32LE(0x5ecb1c),count=memory.readUInt8(session+0x54d);
 if(memory.readUInt8(pack+0x44)===0||memory.readUInt8(session+0x551)===3||memory.readUInt8(session+0x551)===8)return;
 const select=handlers.call48da10??(({ecx})=>selectFinishRoute(ecx,{memory}));
 const transition=handlers.call449d40??(({ecx,edx})=>{
  if(typeof progression?.recordAt!=='function'||progression.runtime?.memory!==memory)throw Error('Race progression requires coherent record views and runtime sharing its memory for checkpoint transition.');
  return transitionCheckpoint(progression.recordAt(ecx),edx,progression.runtime,checkpointOptions);
 });
 for(let index=0;index<count;index++)select({memory,ecx:0x909300+index*0x30c,args:[]});
 for(let index=0;index<count;index++){
  const record=0x909300+index*0x30c;transition({memory,ecx:record,edx:0,args:[]});
  memory.writeUInt32LE(record,scratchBase+memory.readUInt8(record+0x1d)*4+8);
 }
 for(let index=0;index<count;index++){
  const record=memory.readUInt32LE(scratchBase+index*4+12),score=((memory.readUInt8(record+0x1c)<<16)+memory.readInt32LE(record+0x24))|0;
  memory.writeInt32LE(score,scratchBase+index*4+0x24);
 }
 //One reverse adjacent sweep, rather than a complete comparison sort. A
 //finished leading record blocks this comparison; a finished trailing one may move.
 for(let index=count-1;index>0;index--){
  const leading=memory.readUInt32LE(scratchBase+index*4+8);
  if(memory.readUInt8(leading+0x249)&1)continue;
  const trailingScore=memory.readInt32LE(scratchBase+index*4+0x24),leadingScore=memory.readInt32LE(scratchBase+index*4+0x20);
  if(trailingScore>leadingScore){
   const trailing=memory.readUInt32LE(scratchBase+index*4+12);
   memory.writeUInt32LE(leading,scratchBase+index*4+12);memory.writeUInt32LE(trailing,scratchBase+index*4+8);
   memory.writeInt32LE(trailingScore,scratchBase+index*4+0x20);memory.writeInt32LE(leadingScore,scratchBase+index*4+0x24);
  }
 }
 for(let index=count-1;index>=0;index--){const record=memory.readUInt32LE(scratchBase+index*4+12);memory.writeUInt8((index+1)&255,record+0x1d);}
}
