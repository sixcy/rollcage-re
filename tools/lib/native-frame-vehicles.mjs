// Bind observed participant records to reconstructed native vehicle consumers.
// This reads supplied spans; it does not initialize a car, material or pool.
import {createVehicleRuntimeViews} from '../../src/vehicle-runtime-views.mjs';
import {createVehicleCollisionFilter} from '../../src/vehicle-collision-filter.mjs';
import {populateRawVehicleTrackBasis} from '../../src/raw-track-basis.mjs';
import {emitRawVehicleRespawnRing} from '../../src/raw-respawn-state.mjs';
import {assertNativeMemorySpan} from '../../src/native-memory-spans.mjs';

export const nativeFrameVehicleGlobalRegions = Object.freeze([
  {id:'vehicle-sector-root',preferredAddress:0x909240,length:4,comparison:'read-only',evidence:'41c6c0 uses909240, independently of the90b98c root'},
  {id:'vehicle-surface-threshold',preferredAddress:0x90929c,length:2,comparison:'read-only',evidence:'41c6c0 loader-published WORD threshold'},
  {id:'vehicle-route-root',preferredAddress:0x9092b0,length:4,comparison:'read-only',evidence:'449cd0 route-vector pointer; runtime pack+70'},
  {id:'vehicle-surface-effect-threshold',preferredAddress:0x5dc97c,length:4,comparison:'read-only',evidence:'42c590 binary32 effect-level threshold'},
  {id:'vehicle-effect-rng',preferredAddress:0x5ec958,length:4,comparison:'mutable',evidence:'436630/42c590/47d900 shared effect RNG'},
  {id:'vehicle-skid-color-first',preferredAddress:0x5ed2b8,length:4,comparison:'read-only',evidence:'475c30 debris color scale'},
  {id:'vehicle-skid-color-second',preferredAddress:0x5ed2c0,length:4,comparison:'read-only',evidence:'475c30 debris color scale'},
  {id:'vehicle-skid-cursors',preferredAddress:0x8495d0,length:12,comparison:'mutable',evidence:'483b90 ring current/begin/end; backing allocation must be captured separately'},
  {id:'vehicle-rear-effect-frame',preferredAddress:0x919004,length:4,comparison:'mutable',evidence:'436630 material/frame byte publication'},
  {id:'vehicle-active-effect-lookup',preferredAddress:0x713180,length:4,comparison:'read-only',evidence:'482730 lookup root; reached64-byte backing must be captured separately'},
]);

//41c6c0. Read the actual registered grid vertex and native threshold. Unlike
//an authored-file adapter, no fake header or relative geometry offsets exist.
export function readNativeFrameSurfaceMode(body,{memory}) {
  const cell=memory.readInt32LE(body+0x11c);
  if(cell===-1)return 0;
  const sector=memory.readUInt32LE(memory.readUInt32LE(0x909240)+(cell&255)*4),width=memory.readInt32LE(sector+8);
  const row=cell>>16,column=cell<<16>>24,index=(Math.imul((width+1)|0,row)+column)|0;
  const vertex=(memory.readUInt32LE(sector+0x20)+(index<<3)+4)>>>0,code=memory.readUInt32LE(vertex)>>>22;
  if(code>=0x3f0)return 0;
  return code<memory.readUInt16LE(0x90929c)?0:code<0x3d0?1:2;
}

export function createNativeFrameVehicles({memory,views,geometry,scratchBase,moduleBaseAddress,roundingMode='nearest-even',x87PrecisionBits=24,sseRoundingMode='nearest-even',soundRuntime}={}) {
  if(!Buffer.isBuffer(memory)||views?.memory!==memory||typeof views.bodyAt!=='function'||!geometry?.grid?.sectors||!geometry.modelContext)throw Error('Native frame vehicles require coherent captured memory, physical views and native geometry.');
  if(!Number.isSafeInteger(scratchBase)||scratchBase<0x400||scratchBase>=0x100000000||!Number.isSafeInteger(moduleBaseAddress)||moduleBaseAddress<0||moduleBaseAddress+0x41e080-0x400000>=0x100000000)throw Error('Native frame vehicles require observed entry ESP and module base.');
  if(roundingMode!=='nearest-even'||x87PrecisionBits!==24||sseRoundingMode!=='nearest-even')throw Error('Native frame vehicle replay currently requires observed PC24 and nearest-even x87/SSE rounding.');
  if(soundRuntime&&soundRuntime.memory!==memory)throw Error('Vehicle sound runtime must share captured native memory.');
  const pointer=p=>memory.readUInt32LE(p),session=()=>pointer(0x5ecb1c);
  const participantCount=()=>{const count=memory[session()+0x54d];if(count>6)throw Error('Native frame participant count exceeds six records.');return count;};
  const vehicleViews=createVehicleRuntimeViews({memory,bodyAt:views.bodyAt,materialAddressFor:geometry.materialAddressFor});
  const bound=new WeakSet();
  function bindVehicle(address) {
    if(!Number.isInteger(address)||address<=0)throw Error('Native participant record contains a null or invalid body pointer.');
    assertNativeMemorySpan(memory,address,0x3e78);
    const vehicle=vehicleViews.vehicleFor(address);
    if(!bound.has(vehicle)){
      //44a1c0/449cd0 select progression from the body's participant index,
      //which need not equal a loop slot after a live pointer replacement.
      Object.defineProperty(vehicle,'trackContext',{enumerable:true,get:()=>{
        const index=memory.readUInt16LE(address+0x65e);
        if(index>=6)throw Error('Vehicle progression index exceeds six participant records.');
        const record=0x909300+index*0x30c;
        return {mode:memory[session()+0x579],progressStage:memory[record+0x20],routeIndex:memory[record+0x22]};
      }});
      bound.add(vehicle);
    }
    return vehicle;
  }
  const indexFor=key=>typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)?Number(key):null;
  //47ab30 reloads session+54d and each record's first DWORD between calls.
  const vehicles=new Proxy(Array(6).fill(undefined),{
    get(target,key,receiver){if(key==='length')return participantCount();const index=indexFor(key);if(index!==null)return index<participantCount()?bindVehicle(pointer(0x909300+index*0x30c)):undefined;return Reflect.get(target,key,receiver);},
    has(target,key){const index=indexFor(key);return index===null?Reflect.has(target,key):index<participantCount();},
    set(){throw Error('Captured vehicle list is a read-only view of native participant records.');},
    deleteProperty(){throw Error('Captured vehicle participant slots cannot be deleted.');}
  });
  //Fail during binding for an incomplete observed initial participant record.
  for(const vehicle of vehicles)if(views.bodyAt(vehicle.body.address)!==vehicle.body)throw Error('Vehicle body identity differs from the supplied physical view.');
  const childEntry=scratchBase-56,filterRuntime={memory,scratchBase:scratchBase-52,roundingMode,x87PrecisionBits,...(soundRuntime?{soundRuntime}:{})};
  const environment={
    grid:geometry.grid,modelContext:geometry.modelContext,
    wheelRuntime:{memory,views,grid:geometry.grid,scratchBase:childEntry,roundingMode,x87PrecisionBits,...(soundRuntime?{soundRuntime}:{})},
    effectRuntime:{views:vehicleViews,driveScratchBase:childEntry,forceScratchBase:childEntry},
    surfaceModeFor:vehicle=>readNativeFrameSurfaceMode(vehicle.body.address,{memory}),
    trackBasisFor:vehicle=>{
      //41e510 enters at S-38h, then417210 writes its two vectors at
      //that child's -24h/-18h: original4749e0 S-5ch/S-50h.
      const tangent=scratchBase-0x5c,normal=scratchBase-0x50;
      if(!populateRawVehicleTrackBasis(vehicle.body.address,tangent,normal,{memory}))return null;
      return {tangentQ16:[0,4,8].map(o=>memory.readInt32LE(tangent+o)),normalQ16:[0,4,8].map(o=>memory.readInt32LE(normal+o))};
    }
  };
  const handlers={onSpecialEvent:({body,code})=>{
    if(vehicleViews.bodyAt(body.address)!==body)throw Error('Special vehicle event has a foreign body identity.');
    //41e510 SUB38/PUSH ESI/CALL47d900 gives original S-78h.
    return emitRawVehicleRespawnRing(body.address,code,{memory,scratchBase:scratchBase-0x78});
  }};
  const collisionFilters=new Map([[moduleBaseAddress+0x41e080-0x400000,createVehicleCollisionFilter(filterRuntime)]]);
  const vehiclePreparationStateFor=body=>vehicleViews.stateFor(body);
  return {vehicles,vehicleViews,environment,handlers,vehiclePreparationStateFor,filterRuntime,collisionFilters,
    participantCount,context:{environment,handlers,vehiclePreparationStateFor,nativeCollisionFilterRuntimes:[filterRuntime]},
    evidence:{wheelParent:'ev_7be621efae5e293719c5887bca0633fc222bf5144d4541298aac13b0d015f19b',surface:'ev_2afaa47e5cde4e646ed9486020f73c2c7d6d236d323110e32418ca72d43448fe',basis:'ev_a664cc791495c71c3507198885a6d663baa5afb7abf626290fa6a5a673490eec',routeSign:'ev_d1f50cdad1c86493681cac5e5c03bfb48b370a8aa1815f282cfb14c5473231f0',specialStage:'ev_2b15fe383e6bc702a96a7bd4ead7803fa7899fa56360f96c16b90e43f730088a'},
    unresolvedDependencies:['All reached terrain/model/material/spatial bytes must be captured; geometry bindings are caller-owned.','Particle, debris, skid, active-effect state/lookup and sound-bank descendants must be captured when reached; no callbacks are suppressed.','Existing fixed integer/trig implementation domains and original tables must be validated separately.','Listed child stack offsets follow retained parents; this is not a proof that the complete reached call graph fits a particular captured stack bound.','These bindings alone do not establish a whole native physics frame match.']};
}

//Root replay orchestration names the observed entry/context explicitly.
export function createNativeFrameVehicleBindings({memory,physicsViews,geometry,grid,modelContext,entryEsp,moduleBaseAddress,numericalContext,soundRuntime}={}) {
  if(numericalContext?.x87?.precisionBits!==24||numericalContext.x87.roundingMode!=='nearest-even'||numericalContext.sse?.roundingMode!=='nearest-even'||numericalContext.sse.flushToZero||numericalContext.sse.denormalsAreZero)throw Error('Native vehicle bindings require captured PC24/nearest context without SSE flush modes.');
  return createNativeFrameVehicles({memory,views:physicsViews,geometry:geometry??{grid,modelContext},scratchBase:entryEsp,moduleBaseAddress,
    roundingMode:numericalContext.x87.roundingMode,x87PrecisionBits:numericalContext.x87.precisionBits,sseRoundingMode:numericalContext.sse.roundingMode,soundRuntime});
}
