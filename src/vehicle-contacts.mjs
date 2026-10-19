import template from './vehicle-contact-template.json' with {type:'json'};
import {decodeWheelDescriptor,prepareWheelContactSides} from './wheel-physics.mjs';
import {lookupSqrt,add32,signedShort} from './fixed-integer.mjs';
import {buildTerrainCandidates} from './terrain-candidates.mjs';
import {buildModelCandidates} from './model-candidates.mjs';
import {queryTerrainRay} from './terrain-query.mjs';
import {queryPlacedModelRay,selectWheelHits} from './placed-model-query.mjs';
import {readTerrainSurface} from './terrain-surfaces.mjs';
const productShift8=(a,b)=>Number(BigInt.asIntN(32,(BigInt(a|0)*BigInt(b|0))>>8n));
const lengthQ8=vector=>lookupSqrt(vector.reduce((sum,value)=>add32(sum,productShift8(value,value)),0))<<4;
// Constructor 0x41dbb0 registers five shape records at 0x5ead60, then
// 0x488220 installs the common four-wheel geometry from 0x5eac60.
export function initializeVehicleContacts() {
 const wheelBytes=Buffer.from(template.wheels.hex,'hex'),shapeBytes=Buffer.from(template.shapes.hex,'hex'),wheelRangeQ8=0x2c00;
 const descriptors=Array.from({length:4},(_,index)=>({...decodeWheelDescriptor(wheelBytes,index*28),tag:index}));
 const collisionShapes=Array.from({length:5},(_,index)=>{const p=index*20;return {index,centerQ8:[0,4,8].map(delta=>signedShort(shapeBytes.readInt32LE(p+delta))),radiusQ8:shapeBytes.readInt32LE(p+12),flags:shapeBytes.readUInt16LE(p+16),tag:index};});
 let baseRadiusQ8=0,wheelRadiusQ8=0;
 for(const shape of collisionShapes)baseRadiusQ8=Math.max(baseRadiusQ8,add32(lengthQ8(shape.centerQ8),shape.radiusQ8));
 for(const descriptor of descriptors){const end=descriptor.positionQ8.map((value,i)=>add32(value,Math.imul(descriptor.directionQ8[i],wheelRangeQ8)>>8));wheelRadiusQ8=Math.max(wheelRadiusQ8,lengthQ8(end));}
 return {descriptors,collisionShapes,bodyRadiusQ8:Math.max(baseRadiusQ8,wheelRadiusQ8),baseRadiusQ8,wheelRadiusQ8,wheelRangeQ8,activeTag:5,side:0,wheels:Array.from({length:4},()=>({flags:0})),contacts:Array.from({length:4},()=>({}))};
}
// Connect the recovered candidate stages, native query ordering and remembered
// wheel-side attempts. Frame scheduling, movement and damage state are external.
export function updateVehicleContacts(data,grid,modelContext,body,state,{spatialState,specialType4=false,onBreakableContact}={}) {
 const options={radiusQ8:state.bodyRadiusQ8,spatialState},terrain=buildTerrainCandidates(grid,body,options),models=buildModelCandidates(modelContext,body,options);
 const preparation=prepareWheelContactSides(body,state,probes=>selectWheelHits(probes,{
  terrainQuery:query=>queryTerrainRay(grid,terrain.candidates,query,{bodyFlags:body.flags}),
  modelQuery:query=>queryPlacedModelRay(models.candidates,query,{vehicleFlags:body.flags,activeTag:state.activeTag,specialType4,onBreakableContact})
 }),{resolveSurface:cellRef=>readTerrainSurface(data,grid.scene,cellRef)});
 return {terrain,models,preparation};
}
