import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../tools/track-viewer/renderer.mjs';

const image={width:1,height:1,rgba:new Uint8Array([255,255,255,255])},identity=[1,0,0,0,1,0,0,0,1];
const group=(instance,page=0)=>({instance,page,vertices:3,buffer:Buffer.alloc(96).toString('base64')});
function fixture(t){
  const old=globalThis.devicePixelRatio;globalThis.devicePixelRatio=1;t.after(()=>{if(old===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=old;});
  let next=0,buffer,texture,matrix;const calls={draws:[],deletedBuffers:[],deletedTextures:[],error:0};
  const gl=new Proxy({NO_ERROR:0,createShader:()=>++next,createProgram:()=>++next,createBuffer:()=>({buffer:++next}),createTexture:()=>({texture:++next}),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:(_,key)=>key,getUniformLocation:(_,key)=>key,getError:()=>{const result=calls.error;calls.error=0;return result;},bindBuffer:(_,value)=>{buffer=value;},bindTexture:(_,value)=>{texture=value;},uniformMatrix4fv:(key,_,value)=>{if(key==='model')matrix=[...value];},drawArrays:()=>calls.draws.push({buffer,texture,matrix}),deleteBuffer:value=>calls.deletedBuffers.push(value),deleteTexture:value=>calls.deletedTextures.push(value)},{get:(object,key)=>key in object?object[key]:/^[A-Z_]+$/.test(key)?key:()=>{}});
  const renderer=new Renderer({getContext:()=>gl,clientWidth:320,clientHeight:240});
  const cars=Array.from({length:6},(_,index)=>({index,vehicleType:index,groups:[...Array.from({length:5},(_,part)=>group(part)),...(index%2?[group(0,1)]:[])],textures:new Map([[0,image],...(index%2?[[1,image]]:[])])}));
  renderer.setCar({...cars[0],cars});
  const snapshots=cars.map(({index,vehicleType})=>({index,vehicleType,parts:Array.from({length:5},(_,part)=>({position:[index*100+part,part+3,-index*2],rotation:identity}))}));
  const options={textures:true,lighting:true,objects:false,sector:-1,paths:false,car:{...snapshots[0],cars:snapshots}};
  const draw=()=>{calls.draws=[];renderer.render({matrix:()=>new Float32Array(16)},options);return calls.draws;};
  return {renderer,calls,cars,snapshots,options,draw};
}

test('six uploaded car meshes use all thirty independent native part poses and preserve shared archive textures',t=>{
  const {renderer,snapshots,draw,options}=fixture(t),draws=draw();
  assert.equal(renderer.carInstances.length,6);assert.deepEqual(renderer.carInstances.map(car=>car.groups.length),[5,6,5,6,5,6]);assert.equal(renderer.carGroups.length,33);assert.equal(renderer.carTextures.size,2);assert.deepEqual(renderer.carDraws,{cars:6,groups:33});
  for(const car of renderer.carInstances)for(const group of car.groups){const call=draws.find(row=>row.buffer===group.buffer),p=snapshots[car.index].parts[group.instance].position;assert.deepEqual(call.matrix.slice(12),[p[0],-p[1],-p[2],1]);assert.equal(call.texture,renderer.carTextures.get(group.page));}
  snapshots[5].parts[0]={position:[999,-12,33],rotation:[0,0,1,0,1,0,-1,0,0]};
  const changed=draw(),last=changed.find(row=>row.buffer===renderer.carInstances[5].groups[0].buffer);
  assert.deepEqual(last.matrix,[0,-0,1,0,-0,1,0,0,-1,0,0,0,999,12,-33,1]);assert.deepEqual(renderer.carDraws,{cars:6,groups:33});
  options.car=null;assert.equal(draw().length,0);assert.deepEqual(renderer.carDraws,{cars:0,groups:0});
});

test('roster replacement, GPU failure and clearing release every mesh and shared texture exactly once',t=>{
  const {renderer,calls,cars,options,draw}=fixture(t),buffers=renderer.carGroups.map(row=>row.buffer),textures=[...renderer.carTextures.values()];
  renderer.setCar(cars[0]);options.car={parts:options.car.parts};draw();assert.equal(renderer.carInstances.length,1);assert.deepEqual(renderer.carDraws,{cars:1,groups:5});
  assert.ok(buffers.every(buffer=>calls.deletedBuffers.filter(value=>value===buffer).length===1));assert.ok(textures.every(texture=>calls.deletedTextures.filter(value=>value===texture).length===1));
  calls.error=1285;assert.throws(()=>renderer.setCar({...cars[0],cars}),/GPU/);assert.equal(renderer.carInstances.length,0);assert.equal(renderer.carGroups.length,0);assert.equal(renderer.carTextures.size,0);assert.deepEqual(renderer.carDraws,{cars:0,groups:0});
  renderer.setCar({...cars[0],cars});const finalBuffers=renderer.carGroups.map(row=>row.buffer),finalTextures=[...renderer.carTextures.values()];renderer.clear();renderer.clear();
  assert.ok(finalBuffers.every(buffer=>calls.deletedBuffers.filter(value=>value===buffer).length===1));assert.ok(finalTextures.every(texture=>calls.deletedTextures.filter(value=>value===texture).length===1));assert.equal(renderer.carInstances.length,0);assert.deepEqual(renderer.carDraws,{cars:0,groups:0});
});
