// FUN_0041e510. Track basis resolution and event 0x47d900 remain explicit
// dependencies; timer transitions and the numeric force/momentum writes are here.
import {add32,subtract32,signedShort,crossQ16,dotQ16,vectorLengthQ16,divideQ16,multiplyQ16} from './fixed-integer.mjs';
const normalize=vector=>{const scale=divideQ16(65536,vectorLengthQ16(vector));return vector.map(value=>multiplyQ16(value,scale));};
export function updateVehicleSpecialState(body,state,drive,{readTrackBasis,onSpecialEvent}={}) {
 if(drive.capacityOverride===0)return {active:false,applied:false};
 if(drive.capacityOverride===1) {
  drive.specialTimer=add32(drive.specialTimer,1);
  if(drive.specialTimer>25){drive.specialTimer=0;drive.capacityOverride=2;}
  if(drive.specialTimer===22){if(!onSpecialEvent)throw Error('Vehicle special state requires its event handler.');onSpecialEvent({body,state,drive,code:2});}
 }else if(drive.capacityOverride===2) {
  drive.specialTimer=add32(drive.specialTimer,1);
  if(drive.specialTimer>40){drive.specialTimer=0;drive.capacityOverride=0;}
 }
 if(!readTrackBasis)throw Error('Active vehicle special state requires its track-basis provider.');
 const basis=readTrackBasis({body,state,drive});if(!basis)return {active:true,applied:false};
 let normal=basis.normalQ16.slice();const sum=[0,0,0];let contacts=0;
 for(const wheel of state.wheels)if(wheel.flags&1){contacts++;for(let axis=0;axis<3;axis++)sum[axis]=add32(sum[axis],wheel.normal[axis]);}
 if(contacts>1&&vectorLengthQ16(sum)>0x8000)normal=normalize(sum);
 let scalar=0x400000;
 if(drive.capacityOverride!==1) {
  const reduced=basis.tangentQ16.map(value=>value>>6),length=vectorLengthQ16(reduced);
  if(length<32)return {active:true,applied:false,contacts};
  const tangent=normalize(reduced),forward=[2,5,8].map(index=>signedShort(body.rotation[index])<<4);
  scalar=add32(dotQ16(forward,tangent),0x11000)<<6;
  if(dotQ16(crossQ16(forward,tangent),normal)>0)scalar=(-scalar)|0;
 }
 const impulse=normal.map(value=>multiplyQ16(value,scalar));body.torque=body.torque.map((value,index)=>add32(value,impulse[index]));
 body.momentum=body.momentum.map(value=>subtract32(value,value>>3));body.angularMomentum=body.angularMomentum.map(value=>subtract32(value,value>>3));
 return {active:true,applied:true,contacts,normalQ16:normal,impulse};
}
