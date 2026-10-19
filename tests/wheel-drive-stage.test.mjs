import test from 'node:test';
import assert from 'node:assert/strict';
import {updateWheelDrive,wheelDriveEffectColor,prepareWheelDriveDirections} from '../src/wheel-drive.mjs';
const body=()=>({position:[10*65536,20*65536,30*65536],linearVelocity:[0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096]});
const drive=()=>({inputByte:0,counter658:0,counter65a:0,counter65c:0,scaleQ12:4096,reductionQ16:0,multiplierQ16:65536,capacityOffset:0,capacityOverride:0,frontDrive:10000,rearDrive:20000,spinThreshold:1000000,effectParameter:119});
const context=()=>({gameMode:0,modeFlags:0,specialMode:false,surfaceMode:0,effectLevel:0,effectMode:0});
const state=()=>({wheels:Array.from({length:4},()=>({flags:0,spin:0,angle:0,slipVector:[0,0,0],driveDirection:[0,0,65536],relativeHit:[999,999,999],leverArm:[65536,0,-65536],effectFlags:0xffff,effectSpeed:100,slipSpeed:100,tractionCorrection:[1,2,3]})),descriptors:Array.from({length:4},()=>({surface:null})),driveEffects:Array.from({length:6},()=>({status:42}))});
const noEffects={onTractionEffects:()=>{}};
test('front drive directions follow steering and reverse while rear direction follows the body',()=>{
 const b=body(),s=state(),forward=prepareWheelDriveDirections(b,s.wheels,0);
 assert.deepEqual(forward.rear,[0,0,65536]);assert.ok(Math.abs(forward.front[0])<128);assert.ok(forward.front[2]>65000);
 const left=prepareWheelDriveDirections(b,s.wheels,0x10000),right=prepareWheelDriveDirections(b,s.wheels,0x10000,{reverseSteering:true});
 assert.ok(left.front[0]>0);assert.ok(right.front[0]<0);assert.deepEqual(right.rear,forward.rear);assert.notEqual(s.wheels[0].driveDirection,s.wheels[1].driveDirection);
});
test('drive gates on the opposite wheel and uses separate front/rear terms',()=>{
 const b=body(),s=state(),d=drive();s.wheels[1].flags=1;s.wheels[2].flags=1;
 const result=updateWheelDrive(b,s,d,context(),noEffects);
 assert.deepEqual(result.wheels.map(wheel=>wheel.baseDrive),[10000,0,0,30000]);
 assert.deepEqual(s.wheels[0].tractionCorrection,[1,2,3]);assert.equal(s.wheels[0].slipSpeed,0);assert.equal(s.wheels[0].effectSpeed,0);assert.equal(s.wheels[0].effectFlags&0x8000,0);
});
test('special drive scaling enters only through the spin-threshold quotient',()=>{
 const run=(spin,specialMode)=>{const s=state();s.wheels[1].flags=1;s.wheels[0].spin=spin;return updateWheelDrive(body(),s,drive(),{...context(),specialMode},noEffects).wheels[0].baseDrive;};
 assert.equal(run(999999,false),10000);assert.equal(run(999999,true),10000);
 assert.ok(run(1000000,true)>run(1000000,false));
});
test('rear effects use probe lever arm, preserve slot aliases and share mutable arguments',()=>{
 const b=body(),s=state(),d=drive(),calls=[];s.wheels[2].flags=1;s.wheels[2].slipVector=[20*65536,0,0];s.descriptors[2].surface={category:3,gripReduction:0};
 const result=updateWheelDrive(b,s,d,{...context(),effectLevel:3.2,effectMode:1},{...noEffects,onEmitEffect:args=>{calls.push({slot:s.driveEffects.indexOf(args.record),position:args.positionQ16.slice(),vector:args.vectorQ16.slice(),color:args.color,parameter:args.parameter});args.vectorQ16[0]=17;args.positionQ16[1]+=23;}});
 assert.equal(result.wheels[2].traction.skidding,true);assert.deepEqual(calls.map(call=>call.slot),[2,4]);
 assert.deepEqual(calls[0].position,[11*65536,20*65536,29*65536]);assert.deepEqual(calls[1].vector,[17,0,0]);assert.equal(calls[1].position[1],calls[0].position[1]+23);assert.equal(calls[0].parameter,11);assert.equal(calls[1].color,0x704040);
});
test('surface override reaches traction and rear excluded categories reset both effect slots',()=>{
 const s=state(),reductions=[];s.wheels[2].flags=1;s.descriptors[2].surface={category:5,gripReduction:15};
 updateWheelDrive(body(),s,drive(),{...context(),surfaceMode:1},{onTractionEffects:args=>reductions.push(args.surfaceReduction)});
 assert.deepEqual(reductions,[26]);assert.equal(s.driveEffects[2].status,1);assert.equal(s.driveEffects[4].status,1);assert.equal(s.driveEffects[0].status,42);
});
test('active effects require explicit handlers and packed effect colors retain native cases',()=>{
 const s=state();s.wheels[0].flags=1;assert.throws(()=>updateWheelDrive(body(),s,drive(),context()),/traction-effect handler/);
 assert.deepEqual(Array.from({length:13},(_,index)=>wheelDriveEffectColor(index)),[0,0x404040,0x1b1bbf,0,0,0x1b1bbf,0,0x1b1bbf,0x404040,0,0x404040,0x1b1bbf,0]);
});
