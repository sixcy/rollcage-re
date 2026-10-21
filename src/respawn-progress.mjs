import {abs32,multiplyQ16,divideQ16} from './fixed-integer.mjs';
import {updateLapAdvance} from './lap-timing.mjs';

const bytesFor = record => {
  if (!Buffer.isBuffer(record.bytes) || record.bytes.length < 0x30c) throw Error('Progression requires the complete 0x30c-byte vehicle record.');
  return record.bytes;
};
const countFor = pack => {
  const count = pack?.checkpointCount44;
  if (!Number.isInteger(count) || count < 0 || count > 255) throw Error('Progression requires an explicit unsigned checkpoint count44.');
  return count;
};
const checkpointAt = (pack, index) => {
  const table = pack.checkpoints70, offset = index * 20;
  if (!Buffer.isBuffer(table) || offset + 20 > table.length) throw Error('Checkpoint ID exceeds supplied 20-byte record memory.');
  return table.subarray(offset, offset + 20);
};

// 44a2e0's initial nearest checkpoint scan. A zero count or entirely ff table
// dereferences native null+1; reject missing supplied memory rather than invent
// a checkpoint. Position comes from the body's signed high16 coordinates.
export function findNearestRespawnCheckpoint(record, pack) {
  const count = countFor(pack), ids = pack.checkpointIds90;
  if (!Buffer.isBuffer(ids) || ids.length < count * 4) throw Error('Progression requires its packed checkpoint-ID word table.');
  const position = record.body00.position.map(value => value >> 16);
  let nearest = null, nearestDistance = 0x7fffffff;
  for (let word = 0; word < count; word++) for (let lane = 0; lane < 4; lane++) {
    const id = ids[word * 4 + lane];
    if (id === 255) continue;
    const checkpoint = checkpointAt(pack, id);
    const delta = [4, 6, 8].map((offset, axis) => position[axis] - checkpoint.readInt16LE(offset));
    const distance = (Math.imul(delta[0], delta[0]) + Math.imul(delta[1], delta[1]) + Math.imul(delta[2], delta[2])) | 0;
    if (distance < nearestDistance) {nearestDistance = distance; nearest = {id, checkpoint, distance};}
  }
  if (!nearest) throw Error('Respawn progress selected no readable checkpoint.');
  return nearest;
}

// 44a2e0. The default transition is449d40 below; an explicit override permits
// caller-only checks. EDI's pack identity is refreshed only after
// transition results1/2; the final call runs with EDX0 after clearing byte1f.
export function updateRespawnProgress(record, runtime, options = {}) {
  const bytes = bytesFor(record);
  const transition=options.transition??((record,mode,runtime)=>transitionCheckpoint(record,mode,runtime,options));
  let pack = runtime.pack;
  const selected = findNearestRespawnCheckpoint(record, pack), current = selected.checkpoint[1];
  bytes[0x20] = current; bytes[0x21] = current;
  bytes[0x21] = ((current || countFor(pack)) - 1) & 255;
  let iteration = 0;
  for (;;) {
    iteration++;
    if (iteration > countFor(pack) + 10) break;
    const result = transition(record, 1, runtime);
    if (result === 1) {
      const previous = bytes[0x20];
      pack = runtime.pack;
      bytes[0x20] = (previous + 1) & 255;
      bytes[0x21] = previous;
      if (bytes[0x20] >= countFor(pack)) bytes[0x20] = 0;
    } else if (result === 2) {
      pack = runtime.pack;
      bytes[0x20] = bytes[0x21];
      bytes[0x21] = ((bytes[0x21] || countFor(pack)) - 1) & 255;
    } else break;
  }
  bytes[0x1f] = 0;
  return transition(record, 0, runtime);
}

//449d40. Complete checkpoint geometry/state caller; track-basis and reached
//race-completion work remain explicit handlers. Body byte storage may alias
//a larger native-memory view; the original body is captured before callbacks.
export function transitionCheckpoint(record,mode,runtime,{trackBasis,advanceLap,finishProgress}={}) {
 const bytes=bytesFor(record),body=record.body00,source=body.bytes;
 if(!Buffer.isBuffer(source)||source.length<0x66a)throw Error('Checkpoint transition requires original native body bytes.');
 const directionCounter=bytes[0x1f],terrain=source.readInt32LE(0x11c);
 if(mode===0&&terrain<0)return 0;
 const sector=mode===0?terrain&255:-1,position=[0x36,0x3a,0x3e].map(offset=>source.readInt16LE(offset)),pack=runtime.pack;
 const idAt=index=>{const ids=pack.checkpointIds90;if(!Buffer.isBuffer(ids)||index*4>=ids.length)throw Error('Checkpoint transition index exceeds supplied ID memory.');return ids[index*4];};
 const currentId=idAt(bytes[0x20]),previousId=idAt(bytes[0x21]),current=checkpointAt(pack,currentId),previous=checkpointAt(pack,previousId);
 const projection=checkpoint=>position.reduce((sum,value,axis)=>(sum+(Math.imul(checkpoint.readInt16LE(0xc+axis*2),value-checkpoint.readInt16LE(4+axis*2))>>6))|0,0);
 const currentDot=projection(current);
 let forward=false,selected=null,distance=0x7fffffff,minimum=0x7fffffff;
 if(currentDot>=0){
  if(!Number.isInteger(runtime.session?.mode579))throw Error('Checkpoint transition requires explicit session mode579.');
  if(runtime.session.mode579!==11||sector===current[0]){forward=true;minimum=0;distance=0;selected=current;}
 }
 if(abs32(currentDot)<minimum){distance=abs32(currentDot);selected=current;bytes[0x22]=currentId;}
 const previousDot=projection(previous),backward=previousDot<0,previousDistance=backward?0:previousDot;
 bytes[0x23]=previousId;
 if(mode===1)return backward?2:forward?1:3;
 if(!selected)throw Error('Checkpoint transition selected no readable progress record.');
 let progress=previous.readUInt16LE(2),selectedProgress=selected.readUInt16LE(2);
 if(selectedProgress<progress)selectedProgress=65536;
 const total=(previousDistance+distance)|0;
 if(total>10)progress=divideQ16((multiplyQ16(progress,distance)+multiplyQ16(selectedProgress,previousDistance))|0,total);
 progress=progress<0?0:progress>65535?65535:progress;
 let delta=(progress-bytes.readInt32LE(0x24))|0;
 if(delta< -32768)delta=(delta+65536)|0;else if(delta>32767)delta=(delta-65536)|0;
 if(delta<0)bytes.writeInt32LE((bytes.readInt32LE(0x28)-delta)|0,0x28);else if(delta>0)bytes.writeInt32LE(0,0x28);
 if(typeof trackBasis!=='function')throw Error('Checkpoint transition requires the track basis for its registered body.');
 const answer=trackBasis(body,record,runtime),tangent=answer?.tangentQ16??answer;
 if(!Array.isArray(tangent)||tangent.length!==3||!tangent.every(Number.isInteger))throw Error('Checkpoint transition requires native-readable track tangent scratch.');
 const live=record.body00.bytes,velocity=live.readInt16LE(0x668)<3?[0xc8,0xce,0xd4].map(offset=>source.readInt16LE(offset)):[0x68,0x6c,0x70].map(offset=>source.readInt32LE(offset));
 const movement=tangent.reduce((sum,value,index)=>(sum+multiplyQ16(value,velocity[index]))|0,0);
 let counter=0;
 if(movement<1)bytes.writeInt32LE(0,0x28);else{counter=directionCounter+1;if(counter>240)counter-=64;}
 bytes[0x1f]=counter;bytes.writeInt32LE(progress,0x24);
 if(forward){
  if(selected[0x12]&1){if(advanceLap)advanceLap(record,runtime);else updateLapAdvance(bytes,{body:record.body00,clock90a548:runtime.clock90a548});}
  bytes[0x23]=bytes[0x22];const current=bytes[0x20];bytes[0x21]=current;bytes[0x20]=(current+1)&255;
  if(bytes[0x20]>=countFor(runtime.pack))bytes[0x20]=0;
  if(bytes[0x21]===0&&!(bytes[0x249]&1)){if(typeof finishProgress!=='function')throw Error('Checkpoint transition requires reached race completion handling.');finishProgress(record,runtime);}
 }else if(backward){
  const previous=bytes[0x21];bytes[0x20]=previous;bytes[0x22]=bytes[0x23];
  if(previous!==0){bytes[0x21]=(previous-1)&255;return 0;}
  bytes[0x21]=(countFor(runtime.pack)-1)&255;
  if(bytes[0x1c]!==0&&!(bytes[0x249]&1)){bytes.writeInt32LE(65535,0x24);bytes[0x1c]=(bytes[0x1c]-1)&255;}
 }
 return 0;
}

//44c2b0 publishes file byte95/+bc/+a0 as runtime pack+44/+90/+70.
//The checkpoint view keeps all resource-readable tail bytes: native IDs may
//address beyond a declared logical group, but never beyond the supplied file.
export function parseCheckpointProgression(data) {
 if(!Buffer.isBuffer(data)||data.length<0xc0||data.toString('ascii',0,4)!=='GFXM')throw Error('Invalid GFXM checkpoint header.');
 const checkpointCount44=data[0x95],idsOffset=data.readUInt32LE(0xbc),checkpointsOffset=data.readUInt32LE(0xa0);
 if(idsOffset+checkpointCount44*4>data.length||checkpointsOffset>data.length)throw Error('Checkpoint progression table exceeds resource bounds.');
 const checkpointIds90=data.subarray(idsOffset,idsOffset+checkpointCount44*4),checkpoints70=data.subarray(checkpointsOffset);
 for(const id of checkpointIds90)if(id!==255&&id*20+20>checkpoints70.length)throw Error('Checkpoint progression ID exceeds resource bounds.');
 return {checkpointCount44,checkpointIds90,checkpoints70,idsOffset,checkpointsOffset};
}
