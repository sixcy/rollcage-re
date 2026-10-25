import {parseGFXM} from './gfxm.mjs';
import {parsePlacements} from './placements.mjs';
import {parseModelCollision,readPlacementCollision} from './model-collision.mjs';
import {sceneryLinkedIndices,sceneryAttachmentTargets,updateSceneryLightRanges} from './scenery-transforms.mjs';
import {placementMatrix,transformPlacedVertex} from './fixed-math.mjs';

const range=(data,p,n,label)=>{if(!Number.isSafeInteger(p)||p<0x120||!Number.isSafeInteger(n)||n<0||p+n>data.length)throw Error(`${label} exceeds resource bounds.`);};
const short=(n,label)=>{if(!Number.isInteger(n)||n< -32768||n>32767)throw Error(`${label} exceeds signed 16-bit values.`);return n;};
const word=(n,label)=>{if(!Number.isInteger(n)||n<0||n>65535)throw Error(`${label} exceeds unsigned 16-bit values.`);return n;};
const append=(data,bytes)=>{const offset=(data.length+3)&~3;if(offset+bytes.length>128*1024*1024)throw Error('Edited resource exceeds the 128 MB resource limit.');const output=Buffer.alloc(offset+bytes.length);output.set(data);output.set(bytes,offset);return {geometry:output,offset};};
const concat=parts=>{const output=Buffer.alloc(parts.reduce((sum,p)=>sum+p.length,0));let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length;}return output;};
const table=(data,a,b,stride,label)=>{const start=data.readUInt32LE(a),end=data.readUInt32LE(b);range(data,start,end-start,label);if((end-start)%stride)throw Error(`Unsupported ${label} extent.`);return Buffer.from(data.subarray(start,end));};
const handles=p=>Array.from({length:5},(_,slot)=>({slot,handle:p.raw.readUInt16LE(46+slot*2)})).filter(h=>h.handle>>>12);
const difference=(a,b)=>((a-b+2048)%4096+4096)%4096-2048;
const moved=(point,from,to)=>transformPlacedVertex(point.map((n,i)=>n-from.position[i]),placementMatrix([0,difference(to.yaw,from.yaw),0]),[0,0,0]).map((n,i)=>short(Math.round(n)+to.position[i],'Assembly transform'));

function context(geometry,texture,provided={}) {
  const gfxm=provided.gfxm??parseGFXM(geometry),placements=provided.placements??parsePlacements(texture,gfxm.models),linked=provided.linked??sceneryLinkedIndices(placements),owners=new Map();
  for(const p of placements.records.filter(p=>[0,24].includes(p.type)))for(const {handle}of handles(p)){const type=handle>>>12;if(![1,3,4].includes(type))continue;const key=`${type}:${handle&4095}`;if(!owners.has(key))owners.set(key,[]);owners.get(key).push(p.index);}
  return {gfxm,placements,linked,owners};
}

function dependencyPlan(geometry,index,c) {
  const pending=[index],members=new Set(),attachments=new Map();
  while(pending.length){const n=pending.pop();if(members.has(n))continue;const p=c.placements.records[n];if(!p)throw Error('Assembly template is missing.');members.add(n);
    for(const other of c.linked.get(n)??[n])if(!members.has(other))pending.push(other);
    for(const {handle}of handles(p)){const type=handle>>>12,id=handle&4095;if([1,3,4].includes(type))for(const owner of c.owners.get(`${type}:${id}`)??[])if(!members.has(owner))pending.push(owner);}
  }
  const indices=[...members].sort((a,b)=>a-b),groups=new Set();let yawEditable=true;
  for(const n of indices){const p=c.placements.records[n];
    if(p.type!==0||p.flags!==0x400||![0,1,2,7].includes(p.raw[31]))throw Error('This assembly includes a scripted, moving, or unsupported object class.');
    if(p.raw[38]||p.raw[39])throw Error('This assembly owns an unsupported scripted behavior.');
    if(p.angles[0]||p.angles[2])yawEditable=false;
    const group=p.raw.readUInt16LE(6);if(group!==65535){range(geometry,geometry.readUInt32LE(0x80)+group*16,16,'Assembly destruction configuration');groups.add(group);}
    else if(p.raw[22])throw Error('Ungrouped assembly has inconsistent linkage metadata.');
    const model=c.gfxm.models[p.modelIndex],collision=parseModelCollision(geometry,model);if(!collision.available)throw Error('Assembly collision representation is unsupported.');readPlacementCollision(geometry,p,collision);
    let ended=false;for(let slot=0;slot<5;slot++){const type=p.raw.readUInt16LE(46+slot*2)>>>12;if(!type)ended=true;else if(ended)throw Error('Assembly has noncontiguous attachment handles.');}
    sceneryAttachmentTargets(geometry,p);
    for(const h of handles(p)){const type=h.handle>>>12,id=h.handle&4095;
      if(![1,2,3,4].includes(type))throw Error('Script-trigger attachments cannot be duplicated.');
      if(type===2){const point=model.offset+geometry.readUInt16LE(model.offset+0x4c)+h.slot*8;range(geometry,point,8,'Assembly local attachment point');range(geometry,geometry.readUInt32LE(0xd0)+geometry[point+7]*8,8,'Assembly local effect definition');}
      else {const target=sceneryAttachmentTargets(geometry,p).find(t=>t.type===type&&t.id===id);if(type===1&&target.scripted)throw Error('Scripted light paths cannot be duplicated.');attachments.set(`${type}:${id}`,{type,id});}
    }
    for(const id of [p.raw[28],p.raw[29]])if(id){if(id>=geometry[0x79])throw Error('Assembly route blocker references a missing group.');range(geometry,geometry.readUInt32LE(0x8c)+id*12,12,'Assembly route blocker');}
  }
  if(!groups.size)throw Error('This object has no destruction or linkage group; use ordinary model duplication.');
  return {memberIndices:indices,groupIds:[...groups].sort((a,b)=>a-b),attachments:[...attachments.values()],localEffectCount:indices.reduce((sum,n)=>sum+handles(c.placements.records[n]).filter(h=>h.handle>>>12===2).length,0),yawEditable};
}

// The ownership closure follows native +22 placement chains, not equal group
// configuration IDs. World-space effects add all their owners to the closure.
export function inspectSceneryAssemblies(geometry,texture,provided={}) {
  const c=context(geometry,texture,provided),result=new Map(),cache=new Map();
  for(const p of c.placements.records.filter(p=>p.type===0&&(p.flags&0x400))){
    try{let plan=cache.get(p.index);if(!plan){plan=dependencyPlan(geometry,p.index,c);for(const index of plan.memberIndices)cache.set(index,plan);}
      result.set(p.index,{assemblyDuplicable:true,assemblyReason:'',assemblyMemberIndices:[...plan.memberIndices],assemblyYawEditable:plan.yawEditable,assemblyDependencyPlan:plan});
    }catch(error){result.set(p.index,{assemblyDuplicable:false,assemblyReason:error.message,assemblyMemberIndices:[p.index],assemblyYawEditable:false});}
  }
  return result;
}

export function validateSceneryAssemblies(commands=[]) {
  if(!Array.isArray(commands)||commands.length>256)throw Error('Assembly draft exceeds the 256 command limit.');const ids=new Set();
  return Array.from(commands,row=>{
    if(!row||Object.keys(row).sort().join(',')!=='id,position,sourceLevel,templateIndex,yaw')throw Error('Invalid assembly fields.');
    if(typeof row.id!=='string'||!/^[A-Za-z0-9_-]{1,55}$/.test(row.id)||row.id.startsWith('original-')||ids.has(row.id))throw Error('Invalid or duplicate assembly identity.');ids.add(row.id);
    if(!Number.isInteger(row.sourceLevel)||row.sourceLevel<1||row.sourceLevel>20||!Number.isInteger(row.templateIndex)||row.templateIndex<0||row.templateIndex>65535)throw Error('Invalid assembly source reference.');
    if(!Array.isArray(row.position)||row.position.length!==3)throw Error('Invalid assembly position.');return {...row,position:row.position.map(n=>short(n,'Assembly position')),yaw:short(row.yaw,'Assembly yaw')};
  });
}

// Rows are a preview convenience, never additional project model rows. Saving
// one command makes partial group deletion or incoherent member edits impossible.
export function instantiateSceneryAssembly(source,selectedIndex,{id,level,position,yaw}={}) {
  const c=context(source.geometry,source.texture),plan=dependencyPlan(source.geometry,selectedIndex,c),selected=c.placements.records[selectedIndex],command=validateSceneryAssemblies([{id,sourceLevel:level,templateIndex:selectedIndex,position:position??selected.position,yaw:yaw??selected.angles[1]}])[0];
  if(!plan.yawEditable&&difference(command.yaw,selected.angles[1]))throw Error('This tilted assembly supports translation only.');
  const from={position:selected.position,yaw:selected.angles[1]},members=plan.memberIndices.map(index=>{const p=c.placements.records[index];return {id:`${id}-member-${index}`,sourceLevel:level,templateIndex:index,position:moved(p.position,from,command),yaw:short(p.angles[1]+difference(command.yaw,from.yaw),'Assembly member yaw')};});
  return {command,members,dependencyPlan:plan};
}

// Internal compiler stage. Original models/UVs are immutable definitions; the
// +194 shape states, authored emitters and light rows are independent copies.
// 44ccbc resets chain ownership at +22=0. 44ee60 allocates every type2 particle
// and rewrites its low12 handle bits from the track-local allocation counter.
export function compileSceneryAssemblies(source,commands,{level,geometry=source.geometry,configurations,firstIndex}={}) {
  const validated=validateSceneryAssemblies(commands);if(!validated.length)return {geometry,configurations,records:[],indices:{},assemblies:[]};
  let data=Buffer.from(geometry),configs=Buffer.from(configurations),groupTable=table(source.geometry,0x80,0x7c,16,'destruction group table'),lightTable=null,emitters=new Map();
  const c=context(source.geometry,source.texture),records=[],indices=Object.create(null),assemblies=[],changedLights=new Map(),blockers=new Map();
  const copyTable=(type)=>{const bytes=type===1?source.geometry.readUInt32LE(0x48)*32:table(source.geometry,type===3?0x108:0x10c,type===3?0xd0:0x108,12,'attachment emitter table').length,start=data.readUInt32LE(type===1?0x44:type===3?0x108:0x10c);range(data,start,bytes,'Current assembly attachment table');return Buffer.from(data.subarray(start,start+bytes));};
  for(const command of validated){if(command.sourceLevel!==level)throw Error('Destructible assemblies support same-track duplication only.');const instance=instantiateSceneryAssembly(source,command.templateIndex,{...command,level}),groupMap=new Map(),attachmentMap=new Map(),sourceAnchor=c.placements.records[command.templateIndex],from={position:sourceAnchor.position,yaw:sourceAnchor.angles[1]};
    for(const id of instance.dependencyPlan.groupIds){const start=source.geometry.readUInt32LE(0x80)+id*16;range(source.geometry,start,16,'Destruction group clone');const next=groupTable.length/16;if(next>=65535)throw Error('Destruction group configuration limit reached.');groupMap.set(id,next);groupTable=concat([groupTable,source.geometry.subarray(start,start+16)]);}
    for(const attachment of instance.dependencyPlan.attachments){const {type,id}=attachment;let bytes=type===1?(lightTable??=copyTable(type)):(emitters.get(type)??copyTable(type)),stride=type===1?32:12,next=bytes.length/stride;if(next>=4096||(type===1&&next>=70))throw Error('Assembly attachment identity capacity reached (70 authored lights or 4096 emitter handles).');
      const offset=source.geometry.readUInt32LE(type===1?0x44:type===3?0x108:0x10c)+id*stride;range(source.geometry,offset,stride,'Assembly attachment');const cloned=Buffer.from(source.geometry.subarray(offset,offset+stride)),p=type===1?6:0,position=moved([0,2,4].map(a=>cloned.readInt16LE(p+a)),from,command);position.forEach((n,i)=>cloned.writeInt16LE(n,p+i*2));bytes=concat([bytes,cloned]);if(type===1){lightTable=bytes;changedLights.set(next,position);}else emitters.set(type,bytes);attachmentMap.set(`${type}:${id}`,next);
    }
    const memberIndices=[];
    for(const row of instance.members){const p=c.placements.records[row.templateIndex],raw=Buffer.from(p.raw),collision=parseModelCollision(source.geometry,c.gfxm.models[p.modelIndex]),settings=readPlacementCollision(source.geometry,p,collision);raw.writeUInt16LE(word(configs.length/4,'Assembly collision configuration index'),20);configs=concat([configs,...settings.configurations.map(s=>s.raw)]);
      const group=raw.readUInt16LE(6);if(group!==65535)raw.writeUInt16LE(groupMap.get(group),6);
      row.position.forEach((n,i)=>raw.writeInt16LE(n,8+i*2));raw.writeInt16LE(row.yaw,16);
      for(const {slot,handle}of handles(p)){const type=handle>>>12,id=handle&4095;if(type!==2)raw.writeUInt16LE((type<<12)|attachmentMap.get(`${type}:${id}`),46+slot*2);}
      const index=firstIndex+records.length;indices[row.id]=index;memberIndices.push(index);records.push(raw);for(const id of [raw[28],raw[29]])if(id)blockers.set(id,(blockers.get(id)??0)+1);
    }
    assemblies.push({id:command.id,memberIds:instance.members.map(r=>r.id),memberIndices,sourceMemberIndices:instance.dependencyPlan.memberIndices,groupMapping:Object.fromEntries(groupMap),attachmentMapping:Object.fromEntries(attachmentMap),localEffectCount:instance.dependencyPlan.localEffectCount});
  }
  const added=append(data,groupTable);data=added.geometry;data.writeUInt32LE(added.offset,0x80);
  if(lightTable){const added=append(data,lightTable);data=added.geometry;data.writeUInt32LE(added.offset,0x44);data.writeUInt32LE(lightTable.length/32,0x48);data=updateSceneryLightRanges(data,changedLights);}
  for(const [type,bytes]of emitters){const added=append(data,bytes);data=added.geometry;data.writeUInt32LE(added.offset,type===3?0x108:0x10c);}
  for(const [id,count]of blockers){const address=data.readUInt32LE(0x8c)+id*12+3,next=data[address]+count;if(next>255)throw Error('Assembly route blocker count exceeds the native byte limit.');data[address]=next;}
  // 48ab50 writes one20-byte runtime row per destructible polygon on each
  // active chain tail. Allocate its full capacity away from neighboring data;
  // the table has no serialized count field and is filled at runtime.
  const all=[...c.placements.records.map(p=>p.raw),...records],tailCount=all.reduce((sum,raw)=>{if((raw.readUInt16LE(0)&1023)!==0||raw.readUInt16LE(6)===65535)return sum;const group=data.readUInt32LE(0x80)+raw.readUInt16LE(6)*16;if(!data[group+7])return sum;const model=c.gfxm.models[raw[3]],count=source.geometry[model.offset+0x27],base=raw.readUInt16LE(20)*4;return sum+Array.from({length:count},(_,i)=>configs[base+i*4+3]&15).filter(t=>t===4).length;},0);
  const oldRegistry=data.readUInt32LE(0xec),oldRegistryEnd=source.geometry.readUInt32LE(0x10c),oldBytes=oldRegistryEnd>=oldRegistry?Buffer.from(data.subarray(oldRegistry,oldRegistryEnd)):Buffer.alloc(0),registry=Buffer.alloc(Math.max(oldBytes.length,tailCount*20));registry.set(oldBytes);const registryAdded=append(data,registry);data=registryAdded.geometry;data.writeUInt32LE(registryAdded.offset,0xec);
  const localEffects=all.reduce((sum,raw)=>sum+((raw.readUInt16LE(0)&1023)===13?1:0)+([0,24].includes(raw.readUInt16LE(0)&1023)?Array.from({length:5},(_,i)=>raw.readUInt16LE(46+i*2)>>>12).filter(t=>t===2).length:0),0);if(localEffects>512)throw Error('Assembly local effects exceed the conservative 512-particle handle limit.');
  if(all.filter(raw=>(raw.readUInt16LE(0)&1023)===0&&raw[31]===2).length>51)throw Error('Assembly class2 lights exceed the native 51-row light registry.');
  return {geometry:data,configurations:configs,records,indices,assemblies};
}
