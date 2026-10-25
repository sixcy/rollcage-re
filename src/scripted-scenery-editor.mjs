import objectTables from './race-object-startup-tables.json' with {type:'json'};
import {readDefaultModelMaterials} from './model-materials.mjs';
import {placementMatrix,transformPlacedVertex} from './fixed-math.mjs';
import {updateSceneryLightRanges} from './scenery-transforms.mjs';
const dispatch=Buffer.from(objectTables.find(t=>Number(t.address)===0x429d30).bytesHex,'hex');
const kinds=new Map([[0x429cb2,25],[0x429cc6,29],[0x429cd5,31],[0x429ce9,20],[0x429cfd,32],[0x429d0c,35],[0x429d20,24]]);
const range=(data,p,n,label)=>{if(!Number.isSafeInteger(p)||p<0x120||!Number.isSafeInteger(n)||n<0||p+n>data.length)throw Error(`${label} exceeds resource bounds.`);};
const delta=(a,b)=>a.map((n,i)=>n-b[i]);
const unchanged=values=>values.every(n=>n===0);
const same=(a,b)=>a.every((n,i)=>n===b[i]);

// 429c90 maps authored subtype to its original constructor. Empty type32 has
// no model pointer, whereas the optional-route fallback is native type24.
export function scriptedSceneryKind(placement){
  const selected=(placement.raw[31]-3)>>>0,target=selected<=8?dispatch.readUInt32LE(selected*4):0x429d20;
  const kind=kinds.get(target);if(kind===undefined)throw Error('Unknown authored object constructor.');return kind;
}

// Decode only the linear command progression used by 476550. Stop/restart
// opcodes keep their exact native semantics; unknown command words are not
// guessed as lengths. Coordinate offsets identify authored absolute Q16 words.
export function inspectSceneryScript(data,index){
  const table=data.readUInt32LE(0xa4);range(data,table+index*2,2,'Script index');const start=table+data.readUInt16LE(table+index*2),coordinates=[],commands=[];let offset=start;
  for(let count=0;count<1024;count++){
    range(data,offset,2,'Script command');const opcode=data.readInt16LE(offset);let length;
    if(opcode===0)length=8;
    else if(opcode===1)length=12;
    else if(opcode===2){length=16;coordinates.push(offset+4);}
    else if(opcode===3||opcode===7){range(data,offset,4,'Curve command');const segments=data.readInt16LE(offset+2);if(segments<0||segments>255)throw Error('Unsupported scenery curve segment count.');length=segments*16+52;for(let i=0;i<segments+3;i++)coordinates.push(offset+8+i*16);}
    else if(opcode===6)length=8;
    else if([4,5,8].includes(opcode)){commands.push({offset,opcode,length:2});return {index,start,end:offset+2,coordinates,commands,restarts:opcode===4};}
    else throw Error('Unknown scenery script opcode; path transform is locked.');
    range(data,offset,length,'Script command');commands.push({offset,opcode,length});offset+=length;
  }
  throw Error('Scenery script exceeds the bounded decoder.');
}

// Each use remains distinct even when script indices or inline tails alias.
// Dynamic lights without an owning BTP attachment are explicit external owners
// and prevent moving a shared path through an unrelated model control.
export function inspectScriptedScenery(data,placements){
  const rows=new Map(),uses=[],owners=new Map(),scriptCache=new Map(),lightOwners=new Map();
  const script=index=>{if(!scriptCache.has(index))scriptCache.set(index,inspectSceneryScript(data,index));return scriptCache.get(index);};
  const addUse=(owner,index,spawn,startsAtSpawn=false)=>{
    const info=script(index),use={owner,index,spawn,startsAtSpawn,info};uses.push(use);
    const keys=info.coordinates.map(offset=>`script:${offset}`);if(info.restarts||startsAtSpawn)keys.push(`spawn:${spawn}`);
    for(const key of keys){if(!owners.has(key))owners.set(key,new Set());owners.get(key).add(owner);}return info;
  };
  for(const p of placements.records.filter(p=>p.type===0||p.type===24))for(let slot=0;slot<5;slot++){
    const handle=p.raw.readUInt16LE(46+slot*2),type=handle>>>12;if(!type)break;
    if(type===1){const id=handle&4095;if(!lightOwners.has(id))lightOwners.set(id,[]);lightOwners.get(id).push(p.index);}
  }
  for(const p of placements.records.filter(p=>p.type===24)){
    let reason='',bodyType=null,scriptInfo=null;
    try{bodyType=scriptedSceneryKind(p);if(bodyType!==32&&(bodyType!==24||p.raw[38]))scriptInfo=addUse(p.index,p.raw[38],p.raw[39]);}
    catch(error){reason=error.message;}
    rows.set(p.index,{index:p.index,bodyType,modelIndex:bodyType===32?null:p.raw[3],kind:bodyType===32?'emitter':'animated',script:scriptInfo,reason});
  }
  const lightCount=data.readUInt32LE(0x48),lightBase=data.readUInt32LE(0x44);
  if(lightCount)range(data,lightBase,lightCount*32,'Authored light rows');
  for(let id=0;id<lightCount;id++)if(data[lightBase+id*32+14]){
    const p=lightBase+id*32,indices=lightOwners.get(id)??[`light-${id}`];
    for(const owner of indices){try{addUse(owner,data[p+14],data[p+15],true);}catch(error){const row=rows.get(owner);if(row)row.reason=error.message;else rows.set(owner,{index:owner,reason:error.message,kind:'light'});}}
  }
  const adjacency=new Map();for(const group of owners.values())for(const a of group){if(!adjacency.has(a))adjacency.set(a,new Set());for(const b of group)adjacency.get(a).add(b);}
  const linked=new Map();for(const index of adjacency.keys()){
    const found=new Set(),queue=[index];while(queue.length){const n=queue.pop();if(found.has(n))continue;found.add(n);for(const other of adjacency.get(n)??[])queue.push(other);}linked.set(index,[...found]);
  }
  return {rows,uses,linked};
}

export function scriptedSceneryPreview(data,placement,info){
  let position=[...placement.position];
  // 476550 executes immediate op2 before the first velocity/curve update. This
  // editor preview represents that initial pose; the saved row keeps its real
  // BTP origin so a UI translation moves both representations by the same delta.
  for(const command of info?.script?.commands??[]){
    if(command.opcode===2)position=[0,4,8].map(o=>data.readInt32LE(command.offset+4+o)/65536);
    else if(command.opcode!==6)break;
  }
  return {modelIndex:info.modelIndex,position,angles:[...placement.angles],uvStarts:null,bodyType:info.bodyType};
}

export function buildScriptedEditorMeshes(data,gfxm,placements){
  const inspected=inspectScriptedScenery(data,placements),meshes=[];
  for(const p of placements.records.filter(p=>p.type===24)){
    const info=inspected.rows.get(p.index);if(info?.modelIndex===null||info?.modelIndex===undefined)continue;
    const model=gfxm.models[info.modelIndex];if(!model)throw Error('Scripted editor preview references a missing model.');
    const preview=scriptedSceneryPreview(data,p,info),matrix=placementMatrix(preview.angles);
    meshes.push({index:p.index,modelIndex:info.modelIndex,vertices:model.vertices.map(v=>transformPlacedVertex(v,matrix,preview.position)),faces:readDefaultModelMaterials(data,model).map(face=>({...face,uv:face.uv.slice(0,face.indices.length)}))});
  }
  return meshes;
}

export function compileScriptedSceneryTransforms(source,data,placements,original,draft,inspection=inspectScriptedScenery(source,placements)){
  const old=new Map(original.map(r=>[r.templateIndex,r])),next=new Map(draft.filter(r=>r.id.startsWith('original-')).map(r=>[r.templateIndex,r])),requests=new Map();
  const ownerDelta=owner=>{const a=old.get(owner),b=next.get(owner);return a&&b?delta(b.position,a.position):[0,0,0];},externalLights=new Map();
  for(const [owner,component]of inspection.linked)if(typeof owner==='string'&&owner.startsWith('light-')){
    const numeric=component.filter(n=>typeof n==='number');let translation=null;
    for(const index of numeric){const current=ownerDelta(index);if(translation&&!same(current,translation))throw Error('A shared standalone light requires every linked object to translate together.');translation??=current;}
    externalLights.set(owner,translation??[0,0,0]);
  }
  const request=(offset,position,owner,format='q16')=>{
    const previous=requests.get(offset);if(previous&&(previous.format!==format||!same(previous.position,position)))throw Error('Shared scenery scripts or restart points require every owner to translate together.');requests.set(offset,{position,owner,format});
  };
  for(const use of inspection.uses){
    const a=old.get(use.owner),b=next.get(use.owner),translation=externalLights.get(use.owner)??ownerDelta(use.owner);
    if(a&&b&&a.yaw!==b.yaw)throw Error('Scripted objects support complete-path translation only.');
    for(const offset of use.info.coordinates){range(source,offset,12,'Script point');const position=[0,4,8].map((o,i)=>source.readInt32LE(offset+o)+translation[i]*65536);if(position.some(n=>!Number.isInteger(n)||n< -2147483648||n>2147483647))throw Error('Scripted scenery point exceeds signed Q16 storage.');request(offset,position,use.owner);}
    if(use.info.restarts||use.startsAtSpawn){const offset=source.readUInt32LE(0xa8)+use.spawn*8;range(source,offset,8,'Script restart point');const position=[0,2,4].map((o,i)=>source.readInt16LE(offset+o)+translation[i]);if(position.some(n=>n< -32768||n>32767))throw Error('Scripted scenery restart point exceeds signed 16-bit storage.');request(offset,position.map(n=>n*65536),use.owner,'short');}
  }
  const writes=new Map(),put=(offset,bytes)=>{for(let i=0;i<bytes.length;i++){const p=offset+i;if(writes.has(p)&&writes.get(p)!==bytes[i])throw Error('Aliased scenery script, restart or control bytes have conflicting edits.');writes.set(p,bytes[i]);}};
  for(const [offset,{position,format}]of requests){const bytes=Buffer.alloc(format==='short'?6:12);position.forEach((n,i)=>format==='short'?bytes.writeInt16LE(n/65536,i*2):bytes.writeInt32LE(n,i*4));put(offset,bytes);}
  for(const use of inspection.uses){
    const coordinates=new Set(use.info.coordinates.flatMap(offset=>Array.from({length:12},(_,i)=>offset+i)));
    for(const command of use.info.commands)for(let i=0;i<command.length;i++){const p=command.offset+i;if(!coordinates.has(p))put(p,source.subarray(p,p+1));}
  }
  for(const [offset,value]of writes)if(data[offset]!==source[offset]&&data[offset]!==value)throw Error('Authored attachment data aliases scenery script/control bytes.');
  for(const [offset,value]of writes)data[offset]=value;
  const lightPositions=new Map();
  for(const [owner,translation]of externalLights)if(!unchanged(translation)){
    const id=Number(owner.slice(6)),offset=source.readUInt32LE(0x44)+id*32;range(source,offset,32,'Shared standalone light');
    for(let i=0;i<3;i++){const value=source.readInt16LE(offset+6+i*2)+translation[i];if(value< -32768||value>32767)throw Error('Standalone light origin exceeds signed 16-bit storage.');data.writeInt16LE(value,offset+6+i*2);}
    const spawn=source.readUInt32LE(0xa8)+source[offset+15]*8;range(source,spawn,8,'Shared standalone light spawn');lightPositions.set(id,[0,2,4].map(o=>data.readInt16LE(spawn+o)));
  }
  return updateSceneryLightRanges(data,lightPositions);
}
