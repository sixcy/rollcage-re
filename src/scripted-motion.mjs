// Native object bytecode runner476550 and table-difference curve476df0.
import table from './scripted-curve-table.json' with {type:'json'};
import {abs32,multiplyQ16,divideQ16,vectorLengthQ16,dotQ16,crossQ16,signedShort} from './fixed-integer.mjs';
import {multiplyQ8,normalizeCollisionVector} from './sphere-collision.mjs';
const coefficients=Buffer.from(table.hex,'hex');
const add=(a,b)=>a.map((value,axis)=>(value+b[axis])|0);
const subtract8=(a,b)=>a.map((value,axis)=>(value-b[axis])>>8);
const scale=(a,value)=>a.map(lane=>multiplyQ16(lane,value));
export function scriptedCurveVelocity(points,phaseQ8,stepQ8) {
 const end=Math.min((phaseQ8+stepQ8)|0,256),weights=[
  (coefficients.readInt16LE(end*4)-coefficients.readInt16LE(phaseQ8*4))<<2,
  (coefficients.readInt16LE(end*4+2)-coefficients.readInt16LE(phaseQ8*4+2))<<2,
  (coefficients.readInt16LE(1026-end*4)-coefficients.readInt16LE(1026-phaseQ8*4))<<2,
  (coefficients.readInt16LE(1024-end*4)-coefficients.readInt16LE(1024-phaseQ8*4))<<2];
 return [0,1,2].map(axis=>points.reduce((value,point,index)=>(value+multiplyQ16(point[axis],weights[index]))|0,0));
}
const boundary=(handlers,name,...args)=>{if(typeof handlers[name]!=='function')throw Error(`Scripted motion requires an explicit ${name} callback.`);return handlers[name](...args);};
function facePath(body,direction,roundingMode) {
 const forward=normalizeCollisionVector(direction.slice(),roundingMode).vector.map(value=>value<<4),right=[forward[2],0,-forward[0]|0];
 if(vectorLengthQ16(right)<0x400)return;
 const reduced=right.some(value=>abs32(value)>0x230000)?right.map(value=>value>>3):right;
 const normalized=scale(reduced,divideQ16(65536,vectorLengthQ16(reduced))),up=crossQ16(forward,normalized);
 if(vectorLengthQ16(normalized)<0xff78)return;
 body.rotation=[0,1,2].flatMap(axis=>[normalized[axis]>>4,up[axis]>>4,forward[axis]>>4]).map(signedShort);
 body.integrationFlags|=1;
}
// Offset and timers are unsigned storage words, with signed reads at timer tests.
// maxOpcodes is a caller workflow guard, not a recovered game instruction.
export function stepScriptedMotion(body,{bytecode,spawnPositions,handlers={},roundingMode,maxOpcodes=100000}={}) {
 if(!Buffer.isBuffer(bytecode))throw Error('Scripted motion requires explicit native bytecode.');
 let changed=0,direction,executedOpcodes=0;
 for(;;) {
  if(executedOpcodes++>=maxOpcodes)throw Error('Scripted-motion workflow opcode budget exceeded.');
  const offset=body.scriptOffset138&65535,opcode=bytecode.readInt16LE(offset);let advance=0,again=false;
  switch(opcode) {
   case 0:body.linearVelocity=[2,4,6].map(p=>bytecode.readInt16LE(offset+p)<<8);changed|=1;advance=8;break;
   case 1:changed|=1;if(signedShort(body.scriptTimer13a)===0){body.scriptTimer13a=bytecode.readUInt16LE(offset+2);body.linearVelocity=[6,8,10].map(p=>bytecode.readInt16LE(offset+p)<<8);}else{body.scriptTimer13a=(body.scriptTimer13a-1)&65535;if(body.scriptTimer13a===0)advance=12;}break;
   case 2:{advance=16;if(!(body.flags&0x8000))boundary(handlers,'removeSpatial',body);const insert=!(body.flags&0x8000);body.position=[4,8,12].map(p=>bytecode.readInt32LE(offset+p));if(insert)boundary(handlers,'insertSpatial',body);again=true;break;}
   case 3:case 7:{
    const count=bytecode.readInt16LE(offset+2),segment=(body.scriptSegment13e&255),base=offset+4+segment*16,speed=bytecode.readUInt16LE(base),action=bytecode.readUInt16LE(base+18);
    if((action&15)===1){if(signedShort(body.scriptActionTimer13c)===0)body.scriptActionTimer13c=((action>>>4)&0x7ff)+1;const timer=signedShort(body.scriptActionTimer13c);if(timer>0){body.scriptActionTimer13c=timer===1?65535:(timer-1)&65535;body.linearVelocity=[0,0,0];changed|=1;break;}}
    else if((action&15)===2){boundary(handlers,'destroyBody',body,0,0);return {destroyed:true,executedOpcodes};}
    else if((action&15)===3&&signedShort(body.scriptActionTimer13c)===0){boundary(handlers,'triggerEffect',body,7);body.scriptActionTimer13c=1;}
    let pointsAt=base+4;
    if(signedShort(body.scriptTimer13a)===0)body.scriptTimer13a=4096;
    else {body.scriptTimer13a=(body.scriptTimer13a-speed)&65535;if(signedShort(body.scriptTimer13a)<=0){body.scriptSegment13e=(segment+1)&255;body.scriptTimer13a=4096;body.scriptActionTimer13c=0;pointsAt=offset+8+body.scriptSegment13e*16;if(body.scriptSegment13e===count){body.scriptTimer13a=0;body.scriptActionTimer13c=0;body.scriptSegment13e=0;advance=(count*16+52)&65535;again=true;break;}}}
    const points=Array.from({length:4},(_,index)=>[0,4,8].map(axis=>bytecode.readInt32LE(pointsAt+index*16+axis))),phase=(4096-signedShort(body.scriptTimer13a))>>4,step=speed>>4;
    let linearWeight=0,curveWeight=65536;
    if(opcode===7){
     const middle=subtract8(points[2],points[1]),left=add(subtract8(points[1],points[0]),middle),right=add(subtract8(points[3],points[2]),middle),alignment=divideQ16(dotQ16(left,right),multiplyQ16(vectorLengthQ16(right),vectorLengthQ16(left)));
     linearWeight=Math.max(0,Math.min(65536,(alignment*2-65536)|0));curveWeight=(65536-linearWeight)|0;
     direction=add(left.map(value=>multiplyQ8(value,(4096-((4096-signedShort(body.scriptTimer13a))|0))>>4)),right.map(value=>multiplyQ8(value,phase)));
    }
    const linear=linearWeight===0?[0,0,0]:scale(subtract8(points[2],points[1]).map(value=>Math.imul(value,step)),linearWeight),curve=curveWeight===0?[0,0,0]:scale(scriptedCurveVelocity(points,phase,step),curveWeight);
    body.linearVelocity=add(linear,curve);changed|=opcode===7?3:1;break;
   }
   case 4:{body.scriptOffset138=0;const index=body.scriptSpawnIndex13f&255,position=Buffer.isBuffer(spawnPositions)?[0,2,4].map(axis=>spawnPositions.readInt16LE(index*8+axis)):spawnPositions?.[index];if(!position)throw Error('Scripted restart requires an explicit spawn position.');body.position=position.map(value=>signedShort(value)<<16);body.linearVelocity=[0,0,0];again=true;break;}
   case 5:break;
   case 6:{advance=8;const kind=bytecode.readInt16LE(offset+2);if((kind>>>0)<100&&(body.flags&0x1ff)===26){if(kind!==2)body.scriptField184=bytecode.readUInt16LE(offset+4);else body.scriptField180=3;}again=true;break;}
   case 8:break; // Both signed zero/nonzero native branches stop without advancing.
   default:break;
  }
  body.scriptOffset138=((body.scriptOffset138&65535)+advance)&65535;
  if(again)continue;
  if(changed&1)body.momentum=body.mass===65536?body.linearVelocity.slice():scale(body.linearVelocity,body.mass);
  if(changed&2)facePath(body,direction,roundingMode);
  return {destroyed:false,executedOpcodes};
 }
}

