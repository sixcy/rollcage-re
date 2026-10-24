import {queryPlacedModelSphere} from './placed-model-sphere-query.mjs';
import {damagePlacedObject} from './placed-object-damage.mjs';
import {breakClassOneModel,breakClassTwoModel} from './model-contact-effects.mjs';
import {releaseBodyAttachments} from './body-attachment-release.mjs';

//423ab0 raw storage bridge. Geometry identities are supplied by the relocated
//model mapping; all cache/output/temporary writes use their native addresses.
export function queryRawPlacedModelSphere(bodyAddress,recordAddress,outputAddress,parameter,{memory,views,scratchBase,roundingMode,handlers={},...runtime}) {
 if(!Buffer.isBuffer(memory)||views?.memory!==memory||!Number.isInteger(scratchBase))throw Error('Raw model query requires shared native memory/views and entry ESP.');
 const get=p=>memory.readInt32LE(p),ptr=p=>memory.readUInt32LE(p),put=(p,x)=>memory.writeInt32LE(x|0,p),word=(p,x)=>memory.writeUInt16LE(x&65535,p),vector=p=>[0,4,8].map(o=>get(p+o)),writeVector=(p,v)=>v.forEach((x,i)=>put(p+i*4,x));
 //423ad3..423af8: only native vehicle type3 has the extended6bc
 //controller field. Camera/common-body clones must not read that field.
 const vehicleFlags=get(bodyAddress);let specialType4=false;
 if((vehicleFlags&511)===3){const controller=ptr(bodyAddress+0x6bc);specialType4=controller!==0xffffffff&&memory[controller]!==0;}
 const base=ptr(bodyAddress+0x158),count=memory.readUInt16LE(bodyAddress+0x15e),candidates=Array.from({length:count},(_,i)=>{
  const candidate=views.candidateAt(base+i*16),settings=new Proxy(candidate.settings,{get:(target,key)=>{
   const object=ptr(candidate.address+8);
   if(key==='class')return memory[object+0x19a];if(key==='yaw')return memory[object+0x199];if(key==='stateByte198')return memory[object+0x198];
   if(key==='configurations')return new Proxy(target.configurations,{get:(array,index)=>typeof index==='string'&&/^(0|[1-9][0-9]*)$/.test(index)?{get type(){return memory[ptr(object+0x194)+Number(index)*4+3]&15;},get flags(){return ptr(ptr(object+0x194)+Number(index)*4);}}:Reflect.get(array,index)});
   return Reflect.get(target,key);
  }});
  return new Proxy(candidate,{get:(target,key)=>key==='settings'?settings:Reflect.get(target,key)});
 });
 const output=views.outputAt(outputAddress),localOutput=views.outputAt(scratchBase-0x2c),query={get originQ8(){return vector(recordAddress+8);},get deltaQ8(){return vector(recordAddress+20);},get radiusQ8(){return get(recordAddress+64);},get tag(){return memory.readUInt16LE(recordAddress+70);}};
 if(!Object.hasOwn(output,'cellRef'))Object.defineProperty(output,'cellRef',{get:()=>output.contactTime,set:value=>{output.contactTime=value;}});
 Object.defineProperty(query,'surfaceRef',{enumerable:true,get:()=>get(recordAddress+56),set:value=>put(recordAddress+56,value)});
 let original;const velocity=scratchBase-0x38;
 const nativeState={localOutput,
  positionQ16:candidate=>vector(ptr(candidate.address+8)+0x34),
  beforeShape:(candidate,localQuery)=>{
   original=[8,16,20,28].map(o=>get(recordAddress+o));
   put(recordAddress+8,localQuery.originQ8[0]);put(recordAddress+16,localQuery.originQ8[2]);put(recordAddress+20,localQuery.deltaQ8[0]);put(recordAddress+28,localQuery.deltaQ8[2]);
   Object.defineProperty(localQuery,'surfaceRef',{enumerable:true,get:()=>get(recordAddress+56),set:value=>put(recordAddress+56,value)});
  },
  afterShape:()=>[8,16,20,28].forEach((o,i)=>put(recordAddress+o,original[i])),
  rotateResult:(point,normal)=>{put(localOutput.address+8,point[2]);put(localOutput.address,point[0]);put(localOutput.address+12,normal[0]);put(localOutput.address+20,normal[2]);},
  modelVertices:vertices=>vertices.forEach((vertex,i)=>vertex.forEach((value,axis)=>word(scratchBase-0xe0+i*8+axis*2,value))),
  polygonCross:(a,b,cross)=>{a.forEach((x,i)=>word(0x91d360+i*8,x));b.forEach((x,i)=>word(0x91d408+i*4,x));writeVector(0x91d448,cross);},
  primitiveCross:(a,b,cross)=>{a.forEach((x,i)=>put(0x91d360+i*8,x));b.forEach((x,i)=>word(0x91d408+i*4,x));writeVector(0x91d448,cross);},
  sqrtLookup:value=>{const absolute=value<0?-value|0:value;put(0x91d45c,absolute);put(0x91d460,Math.clz32(absolute));},
  normalizeReduction:(bits,leading)=>{put(0x91d45c,bits);put(0x91d460,leading);}
 };
 const effectRuntime={...runtime,memory,handlers,scratchBase:scratchBase-0x98},objectFor=payload=>ptr(payload.candidate.address+8);
 const effects={...handlers.modelEffects,
 onClass1Contact:handlers.modelEffects?.onClass1Contact??(payload=>breakClassOneModel(objectFor(payload),effectRuntime)),
 onClass2Contact:handlers.modelEffects?.onClass2Contact??(payload=>{
  const object=objectFor(payload);word(0x920800+memory[object+0x19b]*16+6,0);return breakClassTwoModel(object,effectRuntime);
 }),
 onClass4Break:handlers.modelEffects?.onClass4Break??(payload=>releaseBodyAttachments(objectFor(payload),effectRuntime)),
 onObjectContact:handlers.modelEffects?.onObjectContact??(payload=>{
  writeVector(velocity,payload.velocityQ16);
  const object=ptr(payload.candidate.address+8);
  return damagePlacedObject(object,bodyAddress,payload.shapeSlot,velocity,{...runtime,memory,handlers,scratchBase:scratchBase-0xa0});
 })};
 return queryPlacedModelSphere(candidates,query,output,{maxFractionQ16:parameter|0,vehicleFlags,activeTag:memory.readInt8(bodyAddress+0x10c),specialType4,roundingMode,effects,nativeState});
}
