// FUN_0041c460: stateful drive-input/capacity preparation. Counter names retain
// native offsets until their gameplay meanings have stronger evidence.
import {add32,subtract32,multiplyQ16,divideQ16,vectorLengthQ16,dotQ16,signedShort,abs32,transformShortQ12} from './fixed-integer.mjs';
import {fixedCos} from './fixed-math.mjs';
import {advanceWheelSpin,solveWheelTraction} from './wheel-physics.mjs';
import template from './vehicle-contact-template.json' with {type:'json'};
// Seven constructor records at 0x5eacd0, followed by special-mode record
// 0x5ead40. Runtime tuning and control input can subsequently alter this state.
export function readVehicleDriveConfiguration(variant,{specialMode=false}={}) {
 if(!Number.isInteger(variant)||variant<0||variant>=7)throw Error('Vehicle drive variant must be from 0 through 6.');
 const bytes=Buffer.from(template.drive.hex,'hex'),p=(specialMode?7:variant)*16;
 return {inputByte:0,counter658:0,counter65a:0,counter65c:0,scaleQ12:4096,reductionQ16:0,multiplierQ16:0,capacityOverride:0,specialTimer:0,frontDrive:0x60000,rearDrive:bytes.readInt32LE(p),capacityOffset:bytes.readInt32LE(p+4),spinThreshold:bytes.readInt32LE(p+8),field3d00:bytes.readInt32LE(p+12),effectParameter:0};
}
// FUN_0041d680's wheel-direction outputs. Native rendering scratch globals are
// not shared with this structured port; body rotation remains the source.
export function prepareWheelDriveDirections(body,wheels,steeringAngleQ16,{reverseSteering=false}={}) {
 if(wheels.length!==4)throw Error('Drive-direction preparation requires four wheels.');
 const angle=reverseSteering?(-steeringAngleQ16)|0:steeringAngleQ16|0;
 const local=[signedShort(fixedCos(subtract32(angle,0x19220))>>4),0,signedShort(fixedCos(angle)>>4)];
 const normalize=vector=>{const reduced=vector.some(value=>abs32(value)>0x230000)?vector.map(value=>value>>3):vector;const scale=divideQ16(65536,vectorLengthQ16(reduced));return reduced.map(value=>multiplyQ16(value,scale));};
 const front=normalize(transformShortQ12(body.rotation,local).map(value=>value<<4)),rear=normalize([2,5,8].map(index=>signedShort(body.rotation[index])<<4));
 wheels.forEach((wheel,index)=>{wheel.driveDirection=(index<2?front:rear).slice();});
 return {front,rear};
}
// FUN_0041c6c0 reads the vehicle's registered terrain cell, not a wheel's hit
// material. Loader 0x44caf4 supplies the lower bound from GFXM u16 +0x66.
export function readVehicleSurfaceMode(data,scene,cellRef) {
 if((cellRef>>>0)===0xffffffff)return 0;
 if(!Buffer.isBuffer(data)||data.length<0x68)throw Error('Vehicle surface mode requires a GFXM header.');
 const sector=scene.segments[cellRef&255],column=(cellRef<<16)>>24,row=signedShort(cellRef>>>16);
 if(!sector||column<0||column>sector.columns||row<0||row>sector.rows)throw Error('Vehicle surface registration exceeds its vertex grid.');
 const p=sector.verticesOffset+(row*(sector.columns+1)+column)*8+4;
 if(!Number.isSafeInteger(p)||p<0||p+4>data.length)throw Error('Vehicle surface vertex exceeds resource bounds.');
 const code=data.readUInt32LE(p)>>>22;
 return code>=data.readUInt16LE(0x66)&&code<0x3f0?(code<0x3d0?1:2):0;
}
export function prepareWheelDriveInputs(body,drive,{gameMode,modeFlags}={}) {
 if(!Number.isInteger(gameMode)||!Number.isInteger(modeFlags))throw Error('Drive preparation requires explicit game mode and mode flags.');
 if((drive.inputByte&255)>128)drive.counter65c=30;
 if(signedShort(drive.counter658)===0)drive.counter65c=Math.max(0,signedShort(drive.counter65c)-1);
 const velocity=body.linearVelocity.map(value=>value>>4),speedQ16=vectorLengthQ16(velocity);
 let alignmentQ16=65536,baseCapacity,activeCounter=false;
 if(speedQ16>0x8000) {
  const forward=[2,5,8].map(index=>signedShort(body.rotation[index])<<4);
  alignmentQ16=divideQ16(dotQ16(forward,velocity),speedQ16);
  if(alignmentQ16<0xec54&&signedShort(drive.counter65c)!==0) {
   drive.counter658=signedShort(drive.counter658+1);drive.counter65a=0;baseCapacity=0x3400;activeCounter=true;
  }
 }
 if(!activeCounter) {
  if(speedQ16<=0x8000||alignmentQ16>=0xec54) {
   if(signedShort(drive.counter65a)===0)drive.counter65a=signedShort(Math.min(0x3c0,signedShort(drive.counter658)*8));
   drive.counter658=0;
  }
  if(signedShort(drive.counter65a)!==0){baseCapacity=0x6000;drive.counter65a=signedShort(drive.counter65a-1);}
  else baseCapacity=0x4e00;
 }
 const driveShift=alignmentQ16>0xfa00&&signedShort(drive.counter65a)!==0?3:0;
 const inputScale=signedShort(drive.scaleQ12)<<4;
 let scale=add32(inputScale,Math.trunc(Math.imul(subtract32(inputScale,0x1000),3)/16));
 if(gameMode>=4&&drive.reductionQ16>0)scale=multiplyQ16(scale,subtract32(65536,drive.reductionQ16));
 if(modeFlags&1)scale=multiplyQ16(scale,0xd000);else if(modeFlags&2)scale=multiplyQ16(scale,0xb000);
 let capacity=Math.max(0xc00,add32(multiplyQ16(baseCapacity,scale),drive.capacityOffset));
 if(drive.multiplierQ16<30000)capacity=add32(capacity>>2,capacity);
 if(drive.capacityOverride===1)capacity=0xc00;
 return {capacity,driveShift,speedQ16,alignmentQ16};
}
// FUN_0041c030 selects a packed effect color from config byte +0x579.
export function wheelDriveEffectColor(mode) {
 switch(mode&255){case 1:case 8:case 10:return 0x404040;case 2:case 5:case 7:case 11:return 0x1b1bbf;default:return 0;}
}
// FUN_0041c080. The native effect callees can mutate wheel/effect state and
// must be supplied explicitly; no implicit audio/particle approximation.
export function updateWheelDrive(body,state,drive,context,{timeOptions={},onTractionEffects,onEmitEffect}={}) {
 const {wheels,descriptors,driveEffects}=state;
 if(wheels.length!==4||descriptors.length!==4||driveEffects?.length!==6)throw Error('Wheel drive requires four wheels/descriptors and six effect slots.');
 const {specialMode,surfaceMode,effectLevel,effectMode}=context;
 if(typeof specialMode!=='boolean'||![0,1,2].includes(surfaceMode)||typeof effectLevel!=='number'||!Number.isInteger(effectMode))throw Error('Wheel drive requires explicit special mode, surface mode and effect context.');
 const preparation=prepareWheelDriveInputs(body,drive,context),results=[];
 for(let index=0;index<4;index++) {
  const wheel=wheels[index];wheel.effectSpeed=0;
  const spinLimit=specialMode?4000000:3000000;
  if(abs32(wheel.spin)>spinLimit)wheel.spin=wheel.spin>0?spinLimit:-spinLimit;
  let baseDrive=0;
  if(wheels[index^1].flags&1) {
   baseDrive=index<2?drive.frontDrive:add32(drive.frontDrive,drive.rearDrive);
   // The 3/2 numerator is used only when the spin-threshold division runs.
   const numerator=specialMode?Math.imul(baseDrive,3)>>1:baseDrive;
   if(abs32(wheel.spin)>=drive.spinThreshold)baseDrive=abs32(divideQ16(numerator,wheel.spin));
   if(preparation.driveShift)baseDrive=add32(baseDrive,baseDrive>>preparation.driveShift);
  }
  const scaled=multiplyQ16(multiplyQ16(baseDrive,signedShort(drive.scaleQ12)<<4),drive.multiplierQ16);
  let resistance=0;
  if(wheel.spin!==0) {
   resistance=add32(add32(abs32(Math.trunc(wheel.spin/256)),0xd9a),index<2?(drive.inputByte&255)<<6:(drive.inputByte&255)<<10);
   if(wheel.spin>0)resistance=(-resistance)|0;
  }
  const driveInput=add32(scaled,resistance);wheel.slipSpeed=0;
  if(!(wheel.flags&1)) {
   advanceWheelSpin(wheel,driveInput,0,timeOptions);wheel.effectFlags=(wheel.effectFlags&~0x8000)|0;
   results.push({driveInput,baseDrive,resistance,traction:null});continue;
  }
  const spinContact=multiplyQ16(wheel.spin,-0x1b333),slip=wheel.slipVector.map((value,axis)=>add32(value,multiplyQ16(wheel.driveDirection[axis],spinContact)));
  wheel.slipWithSpin=slip.slice();
  const surface=descriptors[index].surface,reduction=surfaceMode===1?26:surface?.gripReduction??-1;
  if(!onTractionEffects)throw Error('Active wheel drive requires its traction-effect handler.');
  const traction=solveWheelTraction(wheel,slip,preparation.capacity,reduction,driveInput,timeOptions,args=>onTractionEffects({...args,index}));
  if(index>=2) {
   const first=driveEffects[index],second=driveEffects[index+2];
   if(!surface||[5,6,8,9].includes(surface.category)){first.status=1;second.status=1;}
   else {
    const positionQ16=wheel.leverArm.map((value,axis)=>add32(value,body.position[axis])),vectorQ16=[0,0,0],color=wheelDriveEffectColor(effectMode);
    const emit=(record,color,parameter)=>{if(!onEmitEffect)throw Error('Rear wheel drive requires its effect-emission handler.');onEmitEffect({index,record,positionQ16,vectorQ16,color,parameter});};
    if(Math.fround(effectLevel)>=Math.fround(3.2)&&color)emit(first,color,Math.trunc(signedShort(drive.effectParameter)/10));
    if(traction.skidding)emit(second,0x704040,-1);else second.status=1;
   }
  }
  wheel.tractionCorrection=traction.correction.slice();results.push({driveInput,baseDrive,resistance,traction});
 }
 return {preparation,wheels:results};
}
