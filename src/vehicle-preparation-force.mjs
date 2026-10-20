// Native41d9a0, called by the preparation parent for exact flags0x1c03.
// The caller owns the speed664 producer and complete byte wheel state.
import {add32,subtract32,multiplyQ16,divideQ16,vectorLengthQ16,signedShort} from './fixed-integer.mjs';
export function applyVehiclePreparationForce(body,state,{gravityQ16,timeScaleActive=false,timeScaleExempt=false,timeScaleQ16=65536}={}) {
 const scaled=timeScaleActive&&!timeScaleExempt,gravity=scaled?multiplyQ16(gravityQ16,timeScaleQ16):gravityQ16;
 body.force[1]=add32(body.force[1],gravity);
 let side;
 if(state.wheels.some(wheel=>wheel.flags&1)) {
  side=state.reverseByte64f&255;state.rememberedSide654=side;state.airCounter655=0;
 }else {
  if((state.airCounter655&255)>=6)return;
  side=state.rememberedSide654&255;state.airCounter655=(state.airCounter655+1)&255;
 }
 if(state.speed664<0x200000)return;
 let amount=(Math.min(state.speed664,0x300000)-0x200000)>>2;
 if(scaled)amount=multiplyQ16(amount,timeScaleQ16);
 let force=[1,4,7].map(index=>{let value=signedShort(body.rotation[index]);if(side)value=-value;return multiplyQ16(value<<4,amount);});
 force[1]=add32(force[1],gravity);body.force[1]=subtract32(body.force[1],gravity);
 const length=vectorLengthQ16(force);
 if(length>gravityQ16){const limit=divideQ16(gravityQ16,length);force=force.map(value=>multiplyQ16(value,limit));}
 body.force=body.force.map((value,index)=>add32(value,force[index]));
}
