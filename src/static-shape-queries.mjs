// Sphere-list orchestration only: terrain batch0x424e20 and model body0x4238b0.
// Actual nonzero-radius terrain/model geometry queries remain explicit hooks.
const signedByte=value=>value<<24>>24;
function shapeCount(body){if(!Number.isInteger(body.collisionCount10c)||body.collisionCount10c< -128||body.collisionCount10c>255)throw Error('Static queries require the explicit collision count byte.');return signedByte(body.collisionCount10c);}
function recordAt(body,index,records){const id=body.collisionIds?.[index];if(!Number.isInteger(id)||id<0||id>255)throw Error('Static queries require explicit collision IDs.');const record=Buffer.isBuffer(records)?records.subarray(id*72,(id+1)*72):records[id];if(!Buffer.isBuffer(record)||record.length<72)throw Error('Static queries require a complete 72-byte sphere record.');return record;}
function optionsCheck(options){if(typeof options?.query!=='function'||!options.output)throw Error('Static queries require a low-level query hook and explicit reusable output scratch.');}
function storeContact(record,output){for(let axis=0;axis<3;axis++){record.writeInt32LE(output.point[axis]|0,0x20+axis*4);record.writeInt32LE(output.normal[axis]|0,0x2c+axis*4);}record.writeInt32LE(output.contactTime|0,0x38);record.writeInt32LE(output.scalar|0,0x3c);}
const rotateRight=mask=>(mask>>>1)|(mask<<31);

export function queryTerrainBodyShapes(bodies,records,options) {
 optionsCheck(options);const {query,output}=options;
 const count=options.count??bodies.length;
 if(!Number.isInteger(count)||count<0||count>65535||count>bodies.length)throw Error('Terrain query count requires an in-bounds unsigned word.');
 for(let bodyIndex=0;bodyIndex<count;bodyIndex++) {
  const body=bodies[bodyIndex];
  const originalBound=(65536-body.frameTimeQ16)|0;body.collisionFlags&=0x80000000;body.collisionDelta124=originalBound;
  if(!(body.flags&0x10000))continue;
  if(!Number.isInteger(body.terrainWord15c)||body.terrainWord15c<0||body.terrainWord15c>65535)throw Error('Terrain query requires unsigned body.terrainWord15c.');
  if(!body.terrainWord15c)continue;
  let index=shapeCount(body)-1,bound=originalBound,best=originalBound,selected=0,mask=1<<(index&31);
  for(;index>=0;index--,mask=rotateRight(mask)) {
   const record=recordAt(body,index,records);record.writeUInt16LE(0,0x44);
   const time=query(record,body,bound,output)|0;
   if(!output.flags||(bound<originalBound&&(output.flags&0x80000)))continue;
   if(time===best)selected|=mask;else if(time<best){best=time;selected=mask;}
   storeContact(record,output);
   if(best<bound)bound=(best+1)|0;
  }
  if(!selected){body.collisionState128=0;continue;}
  body.collisionFlags|=selected;body.collisionDelta124=best;
  if(best===bound){if([3,4].includes(body.flags&0x1ff)){body.collisionFlags=0;body.collisionState128=0;}else body.collisionState128=8;}
  else body.collisionState128=best===0?2:1;
 }
 return bodies;
}

export function queryModelBodyShapes(body,records,options) {
 optionsCheck(options);const {query,output}=options,originalBound=body.collisionDelta124;
 let count=shapeCount(body);
 if((body.flags&0x1ff)===3){const state=body.pairCollisionContext?.stateByte6bc;if(!(state===null||(Number.isInteger(state)&&state>=0&&state<=255)))throw Error('Vehicle model queries require explicit stateByte6bc.');if(state!==null&&state!==0)count++;}
 let bound=originalBound,best=originalBound,selected=0,specialTime=0x7fffffff,specialFlags=0,mask=1<<((count-1)&31);
 for(let index=count-1;index>=0;index--,mask=rotateRight(mask)) {
  const record=recordAt(body,index,records),time=query(record,body,bound,output)|0;
  if(bound<originalBound&&(output.flags&0x80000)){output.flags=0;continue;}
  if(!output.flags)continue;
  if(time===best)selected|=mask;else if(time<best){best=time;selected=mask;}
  storeContact(record,output);
  if(best<bound)bound=(best+1)|0;
  if((output.flags&0x40)&&time<specialTime){specialTime=time;specialFlags=output.flags&0xf00;}
 }
 if(selected){
  body.collisionState128=best===bound?8:best===0?(specialTime===0?specialFlags|0x40:2):specialTime===best?specialFlags|0x40:1;
  if(selected&(1<<(body.collisionCount10c&31))){body.collisionState128|=0x2000;body.collisionFlags=0;}
  else body.collisionFlags|=selected;
  body.collisionDelta124=best;
 }
 return body;
}
