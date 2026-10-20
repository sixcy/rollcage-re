// Native44f050 and its432080 transform. Runtime model point/table producers
// remain explicit; attachment handles begin at body+16a, rather than a count.
export const ATTACHMENT_SCRATCH_BASE=0x91cdb0;
export const ATTACHMENT_SCRATCH_LENGTH=0x6a4;
const at=address=>address-ATTACHMENT_SCRATCH_BASE;
const requireScratch=scratch=>{if(!Buffer.isBuffer(scratch)||scratch.length<ATTACHMENT_SCRATCH_LENGTH)throw Error('Attachments require complete retained global scratch.');};
const modes=['nearest-even','toward-zero','down','up'];
function integer(value,mode){let rounded;if(mode==='nearest-even'){const low=Math.floor(value),part=value-low;rounded=part<0.5?low:part>0.5?low+1:low%2===0?low:low+1;}else if(mode==='toward-zero')rounded=Math.trunc(value);else if(mode==='down')rounded=Math.floor(value);else if(mode==='up')rounded=Math.ceil(value);else throw Error('Attachments require an explicit x87 rounding mode.');return Number.isFinite(rounded)&&rounded>=-2147483648&&rounded<=2147483647?rounded|0:-2147483648;}
export function transformAttachmentPoint(scratch,roundingMode){
 requireScratch(scratch);if(!modes.includes(roundingMode))throw Error('Attachments require an explicit x87 rounding mode.');
 const point=[0,2,4].map(offset=>scratch.readInt16LE(at(0x91d3e4)+offset)),result=[];
 // Native stores z, x, y. All products generated from signed shorts and Q12
 // matrices are exact dyadics in binary64; this is not general x87 emulation.
 for(const row of [2,0,1]){let value=scratch.readFloatLE(at(0x91cdb0)+row*4);for(let column=0;column<3;column++)value+=scratch.readFloatLE(at(0x91cdc0)+row*16+column*4)*point[column];result[row]=integer(value,roundingMode);scratch.writeInt32LE(result[row],at(0x91d448)+row*4);}
 return result;
}
const record=(buffer,p,length,name)=>{if(!Buffer.isBuffer(buffer)||p<0||p+length>buffer.length)throw Error(`Attachment ${name} backing record is unavailable.`);return buffer.subarray(p,p+length);};
const shorts=(target,p,position)=>position.forEach((value,index)=>target.writeUInt16LE(value&65535,p+index*2));
export function updateBodyAttachments(queue,options){
 const {pointsFor,scratch,roundingMode,handlers={}}=options;
 requireScratch(scratch);if(!modes.includes(roundingMode))throw Error('Attachments require an explicit x87 rounding mode.');
 if(typeof pointsFor!=='function')throw Error('Attachments require an explicit runtime pointsFor provider.');
 const count=()=>{if(!Array.isArray(queue.entries)||!Number.isInteger(queue.count)||queue.count<0||queue.count>0xffffffff||queue.count>queue.entries.length)throw Error('Attachments require an in-bounds unsigned live queue count.');return queue.count;};
 const report={processedBodies:0,transformedPoints:0,type1Writes:0,type2Writes:0,type4Writes:0,spatialMoves:0};
 for(let index=0;index<count();index++){
  const body=queue.entries[index],points=pointsFor(body);
  if(!Array.isArray(body.rotation)||body.rotation.length!==9||body.rotation.some(value=>!Number.isInteger(value)||value< -32768||value>32767)||!Number.isInteger(body.rotationPaddingD6)||body.rotationPaddingD6< -32768||body.rotationPaddingD6>65535)throw Error('Attachments require nine signed matrix shorts and explicit padding +d6.');
  if(!Array.isArray(body.attachmentHandles)||body.attachmentHandles.length<5||body.attachmentHandles.slice(0,5).some(value=>!Number.isInteger(value)||value<0||value>65535))throw Error('Attachments require five unsigned handles at +16a.');
  for(let lane=0;lane<10;lane++)scratch.writeUInt16LE((lane===9?body.rotationPaddingD6:body.rotation[lane])&65535,at(0x91d360)+lane*2);
  for(let lane=0;lane<9;lane++)scratch.writeFloatLE(body.rotation[lane]/4096,at(0x91cdc0)+Math.floor(lane/3)*16+(lane%3)*4);
  for(let axis=0;axis<3;axis++){const value=body.position[axis]>>16;scratch.writeInt32LE(value,at(0x91d374)+axis*4);scratch.writeFloatLE(value,at(0x91cdb0)+axis*4);}
  for(let pointIndex=0;pointIndex<5;pointIndex++){
   const handle=body.attachmentHandles[pointIndex],type=handle>>>12;if(!type)break;
   record(points,pointIndex*8,8,'model point').copy(scratch,at(0x91d3e4));const position=transformAttachmentPoint(scratch,roundingMode),id=handle&0xfff;report.transformedPoints++;
   if(type===1){const target=record(options.type1Records,id*8,8,'type1');shorts(target,0,position);target.writeUInt16LE(1,6);report.type1Writes++;}
   else if(type===2){
    const target=options.type2Objects?.[id],bytes=record(target?.bytes,0,0x16,'type2'),before=[0,2,4].map(offset=>bytes.readUInt16LE(0x10+offset));shorts(bytes,0x10,position);report.type2Writes++;
    if(position.some((value,axis)=>((value^before[axis])&0xff00)!==0)){
     if(typeof handlers.removeTarget!=='function'||typeof handlers.insertTarget!=='function')throw Error('Attachment type2 movement requires explicit spatial handlers.');
     handlers.removeTarget(target);handlers.insertTarget(target,[0,2,4].map(offset=>bytes.readInt16LE(0x10+offset)<<16));report.spatialMoves++;
    }
   }else if(type===4){shorts(record(options.type4Records,id*12,12,'type4'),0,position);report.type4Writes++;}
  }
  report.processedBodies++;
 }
 queue.count=0;return report;
}
