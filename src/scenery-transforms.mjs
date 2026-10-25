import {placementMatrix,transformPlacedVertex} from './fixed-math.mjs';
import {parseSpatialIndex} from './spatial-index.mjs';
import {expandRawTerrainRanges} from './body-retirement-effects.mjs';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const range=(data,p,n,label)=>{if(!Number.isSafeInteger(p)||p<0x120||!Number.isSafeInteger(n)||n<0||p+n>data.length)throw Error(`${label} exceeds resource bounds.`);};
const short=(n,label)=>{if(!Number.isInteger(n)||n< -32768||n>32767)throw Error(`${label} exceeds signed 16-bit coordinates.`);return n;};
const yawDifference=(a,b)=>((a-b+2048)%4096+4096)%4096-2048;
const rotate=(point,angle)=>transformPlacedVertex(point,placementMatrix([0,angle,0]),[0,0,0]).map(Math.round);
const apply=(point,from,to)=>rotate(point.map((n,i)=>n-from.position[i]),yawDifference(to.yaw,from.yaw)).map((n,i)=>short(n+to.position[i],'Scenery attachment transform'));

// 44ccbc/44cd4f: +22 chains to the previous grouped ordinary placement,
// regardless of the shared group configuration number. Repeated group IDs
// with +22=0 are independent objects, not one destruction chain.
export function sceneryLinkedIndices(placements) {
  const groups=new Map(),byIndex=new Map();let previous=null;
  for(const p of placements.records.filter(p=>p.type===0)){
    if(p.raw.readUInt16LE(6)===65535){byIndex.set(p.index,[p.index]);continue;}
    if(p.raw[22]){
      if(previous===null)throw Error('Destruction chain has no preceding grouped object.');
      const group=byIndex.get(previous);group.push(p.index);byIndex.set(p.index,group);
    }else{const group=[p.index];groups.set(p.index,group);byIndex.set(p.index,group);}
    previous=p.index;
  }
  return byIndex;
}

// These authored locations are read by 44e220 and 44f3a0. Type2 lights use
// local model points at construction; type5 handles trigger scripts on release
// and carry no authored world position to move here.
export function sceneryAttachmentTargets(data,placement) {
  const result=[];
  for(let i=0;i<5;i++){
    const handle=placement.raw.readUInt16LE(46+i*2),type=handle>>>12,id=handle&4095;if(!type)break;
    if(![1,2,3,4,5].includes(type))throw Error('Unknown scenery attachment type.');
    if(type===1){
      if(id>=data.readUInt32LE(0x48))throw Error('Attached light index is unavailable.');
      const offset=data.readUInt32LE(0x44)+id*32;range(data,offset,32,'Attached light');
      const scripted=Boolean(data[offset+14]),positionOffset=scripted?data.readUInt32LE(0xa8)+data[offset+15]*8:offset+6;range(data,positionOffset,6,'Attached light origin');
      result.push({type,id,offset,scripted,positionOffset,position:[0,2,4].map(o=>data.readInt16LE(positionOffset+o))});
    }else if(type===3||type===4){
      const offset=data.readUInt32LE(type===3?0x108:0x10c)+id*12;range(data,offset,12,'Attached emitter');
      result.push({type,id,offset,positionOffset:offset,position:[0,2,4].map(o=>data.readInt16LE(offset+o))});
    }
  }
  return result;
}

// Editor operation, not a recovered engine helper. Native quantized yaw matrix
// rotates the whole linked object around the selected placement's origin.
export function applySceneryTransform(rows,{id,position,yaw},info=[]) {
  const selected=rows.find(r=>r.id===id);if(!selected)throw Error('Select a scenery placement first.');
  const eligibility=info.find(p=>p.index===selected.templateIndex),indices=id.startsWith('original-')?(eligibility?.linkedIndices??[selected.templateIndex]):[selected.templateIndex];
  const members=new Set(id.startsWith('original-')?indices.map(index=>`original-${index}`):[id]);
  const target={position:position??selected.position,yaw:yaw??selected.yaw},anchor=id.startsWith('original-')&&eligibility?eligibility:selected,delta=yawDifference(target.yaw,anchor.yaw);
  if(delta&&eligibility?.yawEditable===false)throw Error('This object supports translation only; preserve its authored orientation and complete path.');
  return rows.map(row=>{
    if(!members.has(row.id))return {...row,position:[...row.position]};
    const source=row.id.startsWith('original-')?info.find(p=>p.index===row.templateIndex)??row:row;
    const newPosition=apply(source.position,anchor,target),newYaw=short(source.yaw+delta,'Linked scenery yaw');
    return {...row,position:newPosition,yaw:newYaw};
  });
}

export function validateSceneryTransforms(original,draft,info) {
  const byId=new Map(draft.map(r=>[r.id,r])),visited=new Set();
  for(const p of original){
    const capability=info.find(i=>i.index===p.templateIndex),current=byId.get(p.id);
    if(!current){if(!capability.removable)throw Error('This special placement cannot be removed independently.');continue;}
    if(!capability.editable&&!same(p,current))throw Error('A locked placement cannot be changed or removed.');
    if(capability.yawEditable===false&&current.yaw!==p.yaw)throw Error('This object supports translation only; preserve its authored orientation and complete path.');
    const chain=capability.linkedIndices;if(chain.length<2||visited.has(chain[0]))continue;visited.add(chain[0]);
    const wanted=applySceneryTransform(original,{id:p.id,position:current.position,yaw:current.yaw},info);
    for(const index of chain){const id=`original-${index}`,expected=wanted.find(r=>r.id===id);if(!same(byId.get(id),expected))throw Error('Linked scenery objects must be transformed together.');}
  }
}

function lightRangeContext(data){
  // Reuse the recovered 44d230 range expansion over an isolated authored image;
  // only its three explicit table roots and sector pointer entries are relocated.
  const base=0x1000000,output=0x920000,memory=Buffer.alloc(base+data.length+16);data.copy(memory,base);
  memory.writeUInt32LE(base+data.readUInt32LE(0x28),0x9092c0);memory.writeUInt32LE(base+data.readUInt32LE(0x20),0x90924c);
  const table=data.readUInt32LE(0x14),count=data.readUInt32LE(0x10);range(data,table,count*4,'Light sector table');memory.writeUInt32LE(base+table,0x909240);
  for(let i=0;i<count;i++){const sector=data.readUInt32LE(table+i*4);range(data,sector,0x60,'Light sector');memory.writeUInt32LE(base+sector,base+table+i*4);}
  const spatial=parseSpatialIndex(data);
  return {ranges(position,mode){const found=spatial.lookup(position.map(n=>n*65536));if(!found.found)throw Error('Attached light has no spatial registration.');expandRawTerrainRanges(base+found.node.offset,output,mode,{memory});return Buffer.from(memory.subarray(output,output+16));}};
}

export function transformSceneryAttachments(source,data,placements,original,draft){
  const oldById=new Map(original.map(r=>[r.id,r])),newById=new Map(draft.map(r=>[r.id,r])),requests=new Map();
  for(const p of placements.records.filter(p=>(p.type===0&&(p.flags&0x400))||p.type===24)){
    const id=`original-${p.index}`,from=oldById.get(id),to=newById.get(id);if(!from||!to)continue;
    for(const target of sceneryAttachmentTargets(source,p)){
      const key=`${target.type}:${target.id}`,position=apply(target.position,from,to),previous=requests.get(key);
      if(previous&&!same(position,previous.position))throw Error('Shared attached lights or emitters must be transformed with every owning object.');
      requests.set(key,{...target,position});
    }
  }
  const changedLights=new Map();
  for(const target of requests.values()){
    if(target.position.every((n,i)=>n===source.readInt16LE(target.positionOffset+i*2)))continue;
    target.position.forEach((n,i)=>data.writeInt16LE(n,target.positionOffset+i*2));
    if(target.type===1)changedLights.set(target.id,target.position);
  }
  return updateSceneryLightRanges(data,changedLights);
}

export function updateSceneryLightRanges(data,changedLights){
  if(changedLights.size){
    const context=lightRangeContext(data),lightBase=data.readUInt32LE(0x44);
    for(const [id,position]of changedLights){const offset=lightBase+id*32;range(data,offset,32,'Moved light row');context.ranges(position,data[offset+12]).copy(data,offset+16);}
    const count=data.readUInt32LE(0x48),start=data.readUInt32LE(0x44),bands=new Map();range(data,start,count*32,'Authored light rows');
    for(let id=0;id<count;id++)for(let i=0;i<4;i++){
      const packed=data.readUInt32LE(start+id*32+16+i*4);if(!packed)break;const sector=packed&255,first=(packed>>>8)&4095,last=packed>>>20;
      for(let band=first>>>4;band<=last>>>4;band++){const key=`${sector}:${band}`;if(!bands.has(key))bands.set(key,[]);bands.get(key).push(id);}
    }
    for(const ids of bands.values())if(ids.length>8&&ids.some(id=>changedLights.has(id)))throw Error('Moving this attached light exceeds the native eight-light terrain-band limit.');
  }
  return data;
}
