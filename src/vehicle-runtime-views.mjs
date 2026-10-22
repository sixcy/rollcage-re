// Live native-storage views, not constructors or synchronization snapshots.
// Layout anchors: 488220/488370/41c080/499e90 and 483b90/436630/42c590.
import {updateWheelTractionEffects,emitWheelRearParticle,emitWheelSurfaceParticles} from './wheel-effects.mjs';

const indexFor=key=>typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)?Number(key):null;
export function createVehicleRuntimeViews({memory,bodyAt:bodyFactory,vehicleStateFor:stateFactory,materialAt:materialFactory,materialAddressFor}={}){
 if(!Buffer.isBuffer(memory)||typeof bodyFactory!=='function')throw Error('Vehicle views require supplied native memory and bodyAt factory.');
 const range=(p,n)=>{if(!Number.isInteger(p)||p<0||!Number.isInteger(n)||n<0||p+n>memory.length)throw Error('Vehicle view exceeds supplied native storage.');};
 const width=type=>type==='u8'?1:type==='s16'||type==='u16'?2:4;
 const read=(p,type)=>{range(p,width(type));return type==='u8'?memory[p]:type==='s16'?memory.readInt16LE(p):type==='u16'?memory.readUInt16LE(p):type==='u32'?memory.readUInt32LE(p):type==='f32'?memory.readFloatLE(p):memory.readInt32LE(p);};
 const write=(p,type,value)=>{range(p,width(type));if(type!=='f32'&&!Number.isInteger(value))throw Error('Vehicle native field requires an integer.');if(type==='u8')memory[p]=value&255;else if(type==='s16'||type==='u16')memory.writeUInt16LE(value&65535,p);else if(type==='u32')memory.writeUInt32LE(value>>>0,p);else if(type==='f32')memory.writeFloatLE(value,p);else memory.writeInt32LE(value|0,p);};
 const define=(object,name,descriptor)=>{
  const old=Object.getOwnPropertyDescriptor(object,name);
  if(old&&!old.configurable){if(typeof old.get!=='function'||typeof old.set!=='function')throw Error(`Vehicle ${name} cannot be bound to native storage.`);return;}
  Object.defineProperty(object,name,{enumerable:true,...descriptor});
 };
 const scalar=(object,name,p,type='s32')=>define(object,name,{get:()=>read(typeof p==='function'?p():p,type),set:value=>write(typeof p==='function'?p():p,type,value)});
 const arrays=new Map();
 function arrayAt(p,length,type='s32'){
  range(p,length*width(type));const key=`${p}:${length}:${type}`;if(arrays.has(key))return arrays.get(key);
  const array=new Proxy(Array(length).fill(0),{
   get:(target,key,receiver)=>{const i=indexFor(key);return i!==null?i<length?read(p+i*width(type),type):undefined:Reflect.get(target,key,receiver);},
   set:(target,key,value,receiver)=>{const i=indexFor(key);if(i!==null){if(i>=length)throw Error('Vehicle native array index exceeds its fixed span.');write(p+i*width(type),type,value);return true;}if(key==='length'&&value!==length)throw Error('Vehicle native arrays have fixed spans.');return Reflect.set(target,key,value,receiver);},
   deleteProperty:()=>{throw Error('Vehicle native array lanes cannot be deleted.');}
  });arrays.set(key,array);return array;
 }
 const vector=(object,name,p,length=3,type='s32')=>define(object,name,{get:()=>arrayAt(p,length,type),set:values=>{if(!Array.isArray(values)||values.length!==length)throw Error(`Vehicle ${name} requires ${length} native lanes.`);for(let i=0;i<length;i++)write(p+i*width(type),type,values[i]);}});
 const attach=(object,p,length)=>{
  range(p,length);if(object.address!==undefined&&object.address!==p)throw Error('Vehicle object native address disagrees with its supplied identity.');object.address=p;
  if(object.bytes!==undefined&&(!Buffer.isBuffer(object.bytes)||object.bytes.buffer!==memory.buffer||object.bytes.byteOffset!==memory.byteOffset+p||object.bytes.length<length))throw Error('Vehicle object bytes must alias the supplied native memory.');
  if(object.bytes===undefined)object.bytes=memory.subarray(p,p+length);return object;
 };
 const bodies=new Map(),states=new Map(),drives=new Map(),materials=new Map(),contexts=new Map(),vehicles=new Map();
 const addressOf=value=>Number.isInteger(value)?value:value?.address;
 function bodyAt(value){
  const p=addressOf(value);if(bodies.has(p))return bodies.get(p);const body=attach(bodyFactory(p),p,0x3e70);
  for(const[name,offset,type]of[['flags',0,'s32'],['mass',0xa8,'s32'],['inverseMass',0xac,'s32'],['coefficient7c',0xb0,'s32'],['integrationFlags',0x108,'s32'],['speed664',0x664,'s32'],['speed668',0x668,'s16'],['steeringAngleQ16',0x644,'s32'],['reverseByte64f',0x64f,'u8'],['vehicleIndex65e',0x65e,'u16']])scalar(body,name,p+offset,type);
  for(const[name,offset,length,type]of[['position',0x34,3,'s32'],['momentum',0x40,3,'s32'],['angularMomentum',0x4c,3,'s32'],['quaternion',0x58,4,'s32'],['linearVelocity',0x68,3,'s32'],['force',0x74,3,'s32'],['torque',0x80,3,'s32'],['quaternionDerivative',0x8c,4,'s32'],['inverseInertia',0x9c,3,'s32'],['angularVelocity',0xb8,3,'s32'],['rotation',0xc4,9,'s16'],['worldInverseInertia',0xe4,9,'s32']])vector(body,name,p+offset,length,type);
  bodies.set(p,body);return body;
 }
 function materialAt(p){
  if(!p)return null;if(materials.has(p))return materials.get(p);const material=attach(materialFactory?.(p)??{},p,16);
  scalar(material,'flags',p+12,'u32');scalar(material,'category',p+12,'u8');define(material,'gripReduction',{get:()=>read(p+12,'u32')>>>8&31,set:value=>write(p+12,'u32',(read(p+12,'u32')&~0x1f00)|((value&31)<<8))});materials.set(p,material);return material;
 }
 function surfacePointer(value){
  if(value===null)return 0;const address=materialAddressFor?materialAddressFor(value):addressOf(value);range(address,16);if(!address)throw Error('Nonnull terrain metadata requires a supplied native material address.');return address;
 }
 function stateFor(value){
  const body=bodyAt(value),p=body.address;if(states.has(p))return states.get(p);const state=stateFactory?.(body)??{};
  state.wheels??=Array.from({length:4},()=>({}));state.descriptors??=Array.from({length:4},()=>({}));state.contacts??=Array.from({length:4},()=>({}));state.driveEffects??=Array.from({length:6},()=>({}));
  if(state.wheels.length!==4||state.descriptors.length!==4||state.contacts.length!==4||state.driveEffects.length!==6)throw Error('Vehicle native views require four wheels/descriptors/contacts and six gates.');
  state.wheels.forEach((wheel,i)=>{
   const w=p+0x324+i*200;attach(wheel,w,200);
   for(const[name,offset,type]of[['flags',0,'u8'],['spin',0x58,'s32'],['angle',0x78,'s32'],['slipSpeed',0x7c,'s32'],['distance',0x80,'s32'],['registryIndex9c',0x9c,'u8'],['continuation9e',0x9e,'u8'],['effectFlags',0xa8,'s32'],['skidRecordB8',0xb8,'s32'],['torqueScaleQ16',0xbc,'s32'],['correctionScaleQ16',0xc0,'s32'],['effectSpeed',0xc4,'s32']])scalar(wheel,name,w+offset,type);
   for(const[name,offset]of[['supportProjection',4],['slipVector',0x10],['relativeHit',0x1c],['leverArm',0x28],['driveDirection',0x34],['normal',0x40],['tractionCorrection',0x4c],['slipWithSpin',0x60],['cachedSlipAC',0xac]])vector(wheel,name,w+offset);
   vector(wheel,'skidEndpointA0',w+0xa0,3,'s16');
  });
  state.descriptors.forEach((descriptor,i)=>{
   const d=p+0x180+i*28;attach(descriptor,d,28);descriptor.raw=descriptor.bytes;vector(descriptor,'positionQ8',d,3,'s16');vector(descriptor,'directionQ8',d+8,3,'s16');scalar(descriptor,'tag',d+16);scalar(descriptor,'cellRef',d+20);
   define(descriptor,'surface',{get:()=>materialAt(read(d+24,'u32')),set:value=>write(d+24,'u32',surfacePointer(value))});
  });
  state.contacts.forEach((contact,i)=>{
   const c=p+0x1f0+i*0x4c;attach(contact,c,0x4c);for(const[name,offset]of[['directionQ12',0],['probeVelocity',0xc],['leverArm',0x18],['contactVelocity',0x24],['relativeHit',0x30],['normal',0x3c]])vector(contact,name,c+offset);scalar(contact,'distance',c+0x48);
  });
  state.driveEffects.forEach((gate,i)=>{const g=p+0x3dc8+i*28;attach(gate,g,28);scalar(gate,'status',g);scalar(gate,'distanceThreshold',g+4);scalar(gate,'clockInterval',g+8,'u32');scalar(gate,'lastClock',g+12,'u32');vector(gate,'lastPosition',g+16);vector(gate,'payload',g+4,6);});
  for(const[name,offset,type]of[['side',0x64f,'u8'],['reverseByte64f',0x64f,'u8'],['rememberedSide654',0x654,'u8'],['airCounter655',0x655,'u8'],['speed664',0x664,'s32'],['airSpinCounter',0x66e,'u8'],['field650',0x650,'s32'],['wheelRangeQ8',0x320,'s32'],['activeTag',0x10c,'u8']])scalar(state,name,p+offset,type);
  define(state,'bodyRadiusQ8',{get:()=>read((read(0x91e79c,'u32')+read(p+0x145,'u8')*0x48+0x40)>>>0,'s32'),set:value=>write((read(0x91e79c,'u32')+read(p+0x145,'u8')*0x48+0x40)>>>0,'s32',value)});
  states.set(p,state);return state;
 }
 function driveFor(value){
  const p=bodyAt(value).address;if(drives.has(p))return drives.get(p);const drive={address:p};
  for(const[name,offset,type]of[['inputByte',0x64e,'u8'],['counter658',0x658,'s16'],['counter65a',0x65a,'s16'],['counter65c',0x65c,'s16'],['scaleQ12',0x2f3a,'s16'],['effectParameter',0x668,'s16'],['reductionQ16',0x6b0,'s32'],['multiplierQ16',0x650,'s32'],['capacityOffset',0x3cf8,'s32'],['capacityOverride',0x3d04,'s32'],['frontDrive',0x6a8,'s32'],['rearDrive',0x3cf4,'s32'],['spinThreshold',0x3cfc,'s32'],['field3d00',0x3d00,'s32'],['specialTimer',0x3d08,'s32']])scalar(drive,name,p+offset,type);drives.set(p,drive);return drive;
 }
 const session=offset=>(read(0x5ecb1c,'u32')+offset)>>>0,config=offset=>(read(0x5ecefc,'u32')+offset)>>>0;
 function driveContextFor(value){
  const p=bodyAt(value).address;if(contexts.has(p))return contexts.get(p);const context={};
  scalar(context,'gameMode',()=>session(0x57c));scalar(context,'modeFlags',()=>session(0x553),'u8');scalar(context,'effectMode',()=>session(0x579),'u8');scalar(context,'effectLevel',()=>config(0x68),'f32');define(context,'specialMode',{get:()=>read(session(0x587),'u8')!==0,set:value=>write(session(0x587),'u8',value?1:0)});contexts.set(p,context);return context;
 }
 function timeOptionsFor(value){const body=bodyAt(value);return {timeScaleActive:read(0x811180,'s32')!==0,timeScaleQ16:read(0x81118c,'s32'),timeScaleExempt:body.address===read(0x811184,'u32')};}
 function vehicleFor(value){
  const body=bodyAt(value),p=body.address;if(vehicles.has(p))return vehicles.get(p);const vehicle={body,state:stateFor(body),drive:driveFor(body),driveContext:driveContextFor(body)};
  scalar(vehicle,'steeringAngleQ16',p+0x644);scalar(vehicle,'registeredCellRef',p+0x11c);define(vehicle,'reverseSteering',{get:()=>read(p+0x64f,'u8')!==0,set:value=>write(p+0x64f,'u8',value?1:0)});Object.defineProperty(vehicle,'timeOptions',{enumerable:true,get:()=>timeOptionsFor(body)});vehicles.set(p,vehicle);return vehicle;
 }
 function effectHandlers({body:owner,scratchBase,tractionScratchBase=scratchBase,rearScratchBase=scratchBase,surfaceScratchBase=scratchBase,positionAddress,directionAddress}={}){
  for(const p of[tractionScratchBase,rearScratchBase,surfaceScratchBase])range(p-256,320);range(positionAddress,12);range(directionAddress,12);
  return {
   onTractionEffects:({wheel,measuredSpeed,surfaceReduction})=>updateWheelTractionEffects(wheel.address,measuredSpeed,surfaceReduction,{memory,scratchBase:tractionScratchBase}),
   onEmitEffect:({vehicle,body,record,positionQ16,vectorQ16,color,parameter})=>{
    for(let i=0;i<3;i++){write(positionAddress+i*4,'s32',positionQ16[i]);write(directionAddress+i*4,'s32',vectorQ16[i]);}
    const p=bodyAt(body??vehicle?.body??owner).address;return emitWheelRearParticle(p,positionAddress,directionAddress,color,parameter,record.address,{memory,scratchBase:rearScratchBase});
   },
   onSurfaceParticles:({vehicle,body}={})=>emitWheelSurfaceParticles(bodyAt(body??vehicle?.body??owner).address,{memory,scratchBase:surfaceScratchBase})
  };
 }
 return {memory,bodyAt,stateFor,driveFor,materialAt,driveContextFor,timeOptionsFor,vehicleFor,effectHandlers};
}
