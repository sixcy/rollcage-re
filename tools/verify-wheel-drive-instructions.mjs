import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {updateWheelDrive} from '../src/wheel-drive.mjs';
const readEvidence=async name=>{const reply=JSON.parse(await readFile(`analysis/scene/results/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);};
const evidence=await Promise.all(['218-wheel-drive-stage-assembly.json','214-wheel-drive-inputs-assembly.json','144-wheel-traction-assembly.json','223-wheel-spin-assembly.json','152-vector-length-assembly.json','220-wheel-drive-dot-assembly.json','217-wheel-capacity-curve-assembly.json','221-fixed-sqrt-assembly.json','219-wheel-surface-override-assembly.json','230-wheel-effect-selector-assembly.json'].map(readEvidence));
const tables=await Promise.all(['228-wheel-drive-switch-bytes.json','229-wheel-effect-threshold.json','232-wheel-effect-switch-bytes.json'].map(readEvidence));
const instructions=evidence.flatMap(value=>value.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};}));
const vehicle=0x1000,wheelBase=vehicle+0x324,effectBase=vehicle+0x3dc8,bodyBytes=0x4000;
const vector=(bytes,p)=>[0,1,2].map(axis=>bytes.readInt32LE(p+axis*4));
const putVector=(bytes,p,value)=>value.forEach((n,axis)=>bytes.writeInt32LE(n|0,p+axis*4));
let nativeEvents=[];
// Deliberately visible, deterministic mock effects mutate both wheel/effect
// state and the shared vectors. These are contract probes, not native effects.
const externalCalls=new Map([[0x483b90,m=>{
 const p=m.r.ECX,index=(p-wheelBase)/200,speed=m.r.EDX,reduction=m.bytes.readInt32LE(m.r.ESP);
 nativeEvents.push(['traction',index,speed,reduction]);m.bytes.writeInt32LE(speed>0x40000&&(reduction>>>0)<=2?speed:0,p+0xc4);
 m.bytes.writeInt32LE(m.bytes.readInt32LE(p+0xa8)^0x2000,p+0xa8);m.bytes.writeInt32LE((m.bytes.readInt32LE(p+0x58)+17)|0,p+0x58);
}],[0x436630,m=>{
 const vectorPtr=m.bytes.readUInt32LE(m.r.ESP),color=m.bytes.readInt32LE(m.r.ESP+4),parameter=m.bytes.readInt32LE(m.r.ESP+8),record=m.bytes.readUInt32LE(m.r.ESP+12),position=vector(m.bytes,m.r.EDX),v=vector(m.bytes,vectorPtr),slot=(record-effectBase)/28;
 nativeEvents.push(['emit',slot,color,parameter,position.slice(),v.slice()]);m.bytes.writeInt32LE(0x11,record);[color,parameter,...position,v[0]].forEach((value,index)=>m.bytes.writeInt32LE(value,record+4+index*4));
 m.bytes.writeInt32LE((v[0]+11)|0,vectorPtr);m.bytes.writeInt32LE((position[1]+13)|0,m.r.EDX+4);
}]]);
const machine=new BoundedX86(instructions,{tables:tables.map(value=>value.normalized_result),externalCalls});
const shortFields=[['counter658',0x658],['counter65a',0x65a],['counter65c',0x65c],['scaleQ12',0x2f3a],['effectParameter',0x668]];
const wordFields=[['reductionQ16',0x6b0],['multiplierQ16',0x650],['capacityOffset',0x3cf8],['capacityOverride',0x3d04],['frontDrive',0x6a8],['rearDrive',0x3cf4],['spinThreshold',0x3cfc]];
function encodeState(bytes,base,body,state,drive) {
 putVector(bytes,base+0x34,body.position);putVector(bytes,base+0x68,body.linearVelocity);body.rotation.forEach((value,i)=>bytes.writeInt16LE(value,base+0xc4+i*2));bytes[base+0x64e]=drive.inputByte;
 shortFields.forEach(([key,p])=>bytes.writeInt16LE(drive[key],base+p));wordFields.forEach(([key,p])=>bytes.writeInt32LE(drive[key],base+p));
 state.wheels.forEach((wheel,index)=>{
  const p=base+0x324+index*200;bytes[p]=wheel.flags;
  for(const [key,offset]of [['spin',0x58],['angle',0x78],['slipSpeed',0x7c],['effectFlags',0xa8],['effectSpeed',0xc4]])bytes.writeInt32LE(wheel[key],p+offset);
  for(const [key,offset]of [['slipVector',0x10],['relativeHit',0x1c],['leverArm',0x28],['driveDirection',0x34],['tractionCorrection',0x4c],['slipWithSpin',0x60]])putVector(bytes,p+offset,wheel[key]);
 });
 state.driveEffects.forEach((record,index)=>{const p=base+0x3dc8+index*28;bytes.writeInt32LE(record.status,p);record.payload.forEach((value,i)=>bytes.writeInt32LE(value,p+4+i*4));});
}
export function verifyWheelDrive(body,inputState,inputDrive,context,{timeOptions={}}={}) {
 machine.reset();nativeEvents=[];const bytes=machine.bytes,config=0x6000,level=0x7000,table=0x11000,sector=0x12000,vertices=0x13000;
 const state=structuredClone(inputState),drive=structuredClone(inputDrive),events=[];bytes.fill(0xa5,vehicle,vehicle+bodyBytes);encodeState(bytes,vehicle,body,state,drive);
 bytes.writeUInt32LE(config,0x5ecb1c);bytes.writeInt32LE(context.gameMode,config+0x57c);bytes[config+0x553]=context.modeFlags;bytes[config+0x587]=context.specialMode?1:0;bytes[config+0x579]=context.effectMode;
 bytes.writeUInt32LE(level,0x5ecefc);bytes.writeFloatLE(context.effectLevel,level+0x68);
 bytes.writeInt32LE(0,vehicle+0x11c);bytes.writeUInt32LE(table,0x909240);bytes.writeUInt32LE(sector,table);bytes.writeInt32LE(1,sector+8);bytes.writeUInt32LE(vertices,sector+0x20);bytes.writeUInt16LE(400,0x90929c);bytes.writeUInt32LE(([0,900,980][context.surfaceMode]<<22)>>>0,vertices+4);
 state.descriptors.forEach((descriptor,index)=>{const p=0x10000+index*32,surface=descriptor.surface;bytes.writeUInt32LE(surface?p:0,vehicle+0x198+index*28);if(surface)bytes.writeUInt32LE(((surface.gripReduction<<8)|surface.category)>>>0,p+12);});
 bytes.writeInt32LE(timeOptions.timeScaleActive?1:0,0x811180);bytes.writeInt32LE(17,0x811184);bytes.writeInt32LE(timeOptions.timeScaleExempt?17:19,0x909300);bytes.writeInt32LE(timeOptions.timeScaleQ16??65536,0x81118c);state.wheels.forEach((wheel,index)=>{bytes[wheelBase+index*200+0x9c]=0;});
 const expected=Buffer.from(bytes.subarray(vehicle,vehicle+bodyBytes));
 const result=updateWheelDrive(body,state,drive,context,{timeOptions,onTractionEffects:({index,wheel,measuredSpeed,surfaceReduction})=>{
  events.push(['traction',index,measuredSpeed,surfaceReduction]);wheel.effectSpeed=measuredSpeed>0x40000&&(surfaceReduction>>>0)<=2?measuredSpeed:0;wheel.effectFlags^=0x2000;wheel.spin=(wheel.spin+17)|0;
 },onEmitEffect:({record,color,parameter,positionQ16,vectorQ16})=>{
  events.push(['emit',state.driveEffects.indexOf(record),color,parameter,positionQ16.slice(),vectorQ16.slice()]);record.status=0x11;record.payload=[color,parameter,...positionQ16,vectorQ16[0]];vectorQ16[0]=(vectorQ16[0]+11)|0;positionQ16[1]=(positionQ16[1]+13)|0;
 }});
 encodeState(expected,0,body,state,drive);machine.r.ECX=vehicle;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);const steps=machine.run();
 if(!bytes.subarray(vehicle,vehicle+bodyBytes).equals(expected)||JSON.stringify(nativeEvents)!==JSON.stringify(events)) {
  const differences=[];for(let i=0;i<bodyBytes&&differences.length<16;i++)if(expected[i]!==bytes[vehicle+i])differences.push({offset:i.toString(16),native:bytes[vehicle+i],port:expected[i]});
  throw Error(`Wheel drive mismatch: ${JSON.stringify({body,drive:inputDrive,context,differences,nativeEvents,events,result})}`);
 }
 return {steps,events,result};
}
export async function checkWheelDrive() {
 let seed=0x41c080ab;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
 const fixtures=3000,histogram={active:0,airborne:0,tractionCalls:0,emissions:0,special:0,surfaceOverride:0};let instructionSteps=0;
 for(let fixture=0;fixture<fixtures;fixture++) {
  const body={position:[0,1,2].map(()=>((random(2000)-1000)<<16)|0),linearVelocity:[0,1,2].map(()=>random(128*65536)-64*65536),rotation:[4096,0,0,0,4096,0,0,0,4096]};
  const state={wheels:Array.from({length:4},(_,index)=>({flags:(fixture>>index&1)|8,spin:random(10000001)-5000000,angle:random(0xffffffff)|0,slipVector:[0,1,2].map(()=>random(40*65536)-20*65536),driveDirection:[[65536,0,0],[0,0,65536],[46340,0,46340]][random(3)],relativeHit:[0,1,2].map(()=>random(80*65536)-40*65536),leverArm:[0,1,2].map(()=>random(80*65536)-40*65536),slipSpeed:123,effectFlags:random(0xffff),effectSpeed:456,tractionCorrection:[777,888,999],slipWithSpin:[111,222,333]})),descriptors:Array.from({length:4},()=>({surface:random(5)?{category:[0,5,6,7,8,9,14][random(7)],gripReduction:random(27)}:null})),driveEffects:Array.from({length:6},(_,index)=>({status:index+100,payload:[1,2,3,4,5,6]}))};
  const drive={inputByte:[0,128,129,255][random(4)],counter658:random(31),counter65a:random(31),counter65c:random(31),scaleQ12:[256,2048,4096,-4096][random(4)],reductionQ16:random(65537),multiplierQ16:random(65537),capacityOffset:random(4000)-2000,capacityOverride:random(3),frontDrive:random(80000),rearDrive:random(80000),spinThreshold:[1,500000,1000000,3000000][random(4)],effectParameter:random(65536)-32768};
  const context={gameMode:random(8),modeFlags:random(8),specialMode:!!random(2),surfaceMode:random(3),effectLevel:[NaN,-1,3.199,3.2,4,Infinity][random(6)],effectMode:random(13)},timeOptions={timeScaleActive:!!random(2),timeScaleExempt:!!random(2),timeScaleQ16:random(2*65536)};
  const check=verifyWheelDrive(body,state,drive,context,{timeOptions});instructionSteps+=check.steps;
  check.events.forEach(event=>histogram[event[0]==='traction'?'tractionCalls':'emissions']++);state.wheels.forEach(wheel=>histogram[wheel.flags&1?'active':'airborne']++);if(context.specialMode)histogram.special++;if(context.surfaceMode===1)histogram.surfaceOverride++;
 }
 const report={method:'Bounded interpretation of the complete retained per-wheel drive caller and arithmetic/classifier/color-selector callees. All 16384 vehicle bytes and ordered callback events match. Destruction/effects are not executed: traction and emission callees are explicit deterministic mocks that mutate wheel/effect records and shared argument vectors. Synthetic registered vertex codes supply requested surface modes. No original process execution.',evidence:evidence.map(value=>value.evidence_id),tableEvidence:tables.map(value=>value.evidence_id),instructions:instructions.length,fixtures,instructionSteps,histogram,matched:true};
 await writeFile('analysis/wheel-drive-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkWheelDrive();
