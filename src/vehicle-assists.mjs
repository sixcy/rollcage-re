// Post-wheel numeric routines in native frame order. These mutate momentum,
// not pose/derived velocities; integration and collision scheduling are separate.
import {add32,subtract32,abs32,signedShort,crossQ16,vectorLengthQ16,divideQ16,multiplyQ16} from './fixed-integer.mjs';
// FUN_0047ac50 checks the complete wheel flag bytes, rather than contact bit 0.
export function clampVehicleAtRest(body,state,drive) {
 if(drive.multiplierQ16!==0||state.wheels.some(wheel=>(wheel.flags&255)===0))return false;
 const sumAbsolute=vector=>vector.reduce((sum,value)=>add32(sum,abs32(value)),0),input=!!(drive.inputByte&255);
 if(sumAbsolute(body.momentum)>(input?38000:8000)||sumAbsolute(body.angularMomentum)>(input?48000:8000))return false;
 body.momentum=[0,0,0];body.angularMomentum=[0,0,0];
 for(const wheel of state.wheels){wheel.angle=subtract32(wheel.angle,wheel.spin);wheel.spin=0;}
 return true;
}
// FUN_0047ada0 increments a byte before testing/clamping its threshold.
export function dampAirborneSpin(body,state) {
 if(abs32(signedShort(body.rotation[5])<<4)<60000||abs32(body.angularMomentum[1])<8000000||state.wheels.some(wheel=>wheel.flags&1)){state.airSpinCounter=0;return false;}
 state.airSpinCounter=(state.airSpinCounter+1)&255;
 if(state.airSpinCounter<=30)return false;
 state.airSpinCounter=30;body.angularMomentum[1]=subtract32(body.angularMomentum[1],Math.trunc(body.angularMomentum[1]/32));return true;
}
// FUN_0047ae30 rotates the body's second matrix column toward the nearest
// vertical sign, including the native dead zone and arithmetic-shift damping.
export function assistAirborneOrientation(body,state,{nativeState}={}) {
 if(state.wheels.some(wheel=>wheel.flags&1))return false;
 const up=[1,4,7].map(index=>signedShort(body.rotation[index])<<4),target=[0,up[1]<0?-65536:65536,0],axis=crossQ16(up,target);nativeState?.fixedVectorLength?.(axis);const length=vectorLengthQ16(axis);
 if(length<=512)return false;
 const scale=divideQ16(65536,length),normalized=axis.map(value=>multiplyQ16(value,scale));
 body.angularMomentum=body.angularMomentum.map((value,index)=>add32(subtract32(value,value>>7),normalized[index]>>1));return true;
}
export function applyVehicleAssists(body,state,drive) {
 return {rest:clampVehicleAtRest(body,state,drive),airSpin:dampAirborneSpin(body,state),orientation:assistAirborneOrientation(body,state)};
}
