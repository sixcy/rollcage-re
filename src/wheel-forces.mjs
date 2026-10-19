// FUN_00499ff0 and the numeric accumulation in FUN_00499e90. Per-vehicle
// surface particles (0x42c590), rest/air assists and event scheduling are external.
import {add32,abs32,multiplyQ16,divideQ16,vectorLengthQ16,crossQ16,transformVectorQ16,sqrtQ16} from './fixed-integer.mjs';
// Numeric coefficient writes in FUN_0041caf0, independent of its render-object
// allocations. The descriptor geometry is already recovered from the PE.
export function initializeWheelForceCoefficients(body,state) {
 if(state.wheels.length!==4||state.descriptors.length!==4)throw Error('Wheel coefficients require four wheels/descriptors.');
 state.wheels.forEach((wheel,index)=>{const position=state.descriptors[index].positionQ8.map(value=>value<<8),squared=position.reduce((sum,value)=>add32(sum,multiplyQ16(value,value)),0);wheel.torqueScaleQ16=multiplyQ16(squared,body.mass);wheel.correctionScaleQ16=divideQ16(65536,sqrtQ16(squared));});
 return state.wheels;
}
// FUN_0049a2a0: reduce before root measurement using the OR of absolute lanes.
function scaleVector(vector,magnitude) {
 if(!vector.some(Boolean))return vector.slice();
 let bits=vector.reduce((mask,value)=>mask|abs32(value),0);if(bits<0)bits=(-bits)|0;
 const shift=10-Math.clz32(bits),reduced=shift>0?vector.map(value=>value>>shift):vector.slice(),length=vectorLengthQ16(reduced);
 if(length===0)return reduced;
 const scale=divideQ16(magnitude,length);return reduced.map(value=>multiplyQ16(value,scale));
}
export function correctWheelTraction(wheel,body) {
 let correction=wheel.tractionCorrection.slice(),angularImpulse=crossQ16(wheel.leverArm,correction);
 const length=vectorLengthQ16(angularImpulse);
 if(length<=1000)return {correction,angularImpulse:[0,0,0]};
 const target=multiplyQ16(length,wheel.correctionScaleQ16),adjustment=scaleVector(crossQ16(angularImpulse,wheel.leverArm),target);
 correction=correction.map((value,index)=>add32(value,adjustment[index]));
 const inverseLength=divideQ16(65536,length),unit=angularImpulse.map(value=>multiplyQ16(value,inverseLength));
 const transformed=transformVectorQ16(body.worldInverseInertia,unit),response=vectorLengthQ16(transformed)>>8;
 const scale=divideQ16(65536,add32(65536,multiplyQ16(wheel.torqueScaleQ16,response)));
 angularImpulse=angularImpulse.map(value=>multiplyQ16(value,scale));
 return {correction,angularImpulse};
}
export function applyWheelTractionForces(body,wheels) {
 if(wheels.length!==4)throw Error('Wheel traction forces require four wheel slots.');
 const total=[0,0,0],torque=[0,0,0],results=[];
 for(const wheel of wheels) {
  if(!(wheel.flags&1)){results.push(null);continue;}
  const result=correctWheelTraction(wheel,body);results.push(result);
  for(let axis=0;axis<3;axis++){total[axis]=add32(total[axis],result.correction[axis]);torque[axis]=add32(torque[axis],result.angularImpulse[axis]);}
 }
 body.momentum=body.momentum.map((value,index)=>add32(value,total[index]));body.angularMomentum=body.angularMomentum.map((value,index)=>add32(value,torque[index]));
 return results;
}
