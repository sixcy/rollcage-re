import {parseGFXM} from './gfxm.mjs';
import {parsePlacements} from './placements.mjs';
import {parseModelCollision, readPlacementCollision} from './model-collision.mjs';
import {readModelMaterials} from './model-materials.mjs';
import {parseBTP} from './btp.mjs';
import {parseSpatialIndex} from './spatial-index.mjs';
import {parseStaticModelLinks} from './model-links.mjs';
import {sceneryLinkedIndices,sceneryAttachmentTargets,validateSceneryTransforms,transformSceneryAttachments} from './scenery-transforms.mjs';
import {inspectScriptedScenery,scriptedSceneryPreview,compileScriptedSceneryTransforms} from './scripted-scenery-editor.mjs';
import {inspectSceneryAssemblies,validateSceneryAssemblies,compileSceneryAssemblies} from './scenery-assemblies.mjs';
import {encodeTexturePageWord,isSupportedStaticTextureWord,trackTextureCapacity} from './texture-page-word.mjs';
export {applySceneryTransform} from './scenery-transforms.mjs';
export {instantiateSceneryAssembly,validateSceneryAssemblies} from './scenery-assemblies.mjs';

export const SCENERY_LEVELS = Object.freeze(Array.from({length:20}, (_, i) => i + 1));
// Leave half the recovered 512-body registry for vehicles, pickups and effects.
// This is an editor bound, not a recovered maximum authored placement count.
export const SCENERY_PLACEMENT_LIMIT = 256;
const equal = (a,b) => a.length === b.length && a.every((n,i) => n === b[i]);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const range = (data,p,n,label) => {if (!Number.isSafeInteger(p) || !Number.isSafeInteger(n) || p < 0 || n < 0 || p+n > data.length) throw Error(`${label} exceeds resource bounds.`);};
const i16 = n => Number.isInteger(n) && n >= -32768 && n <= 32767;
const checkedWord = (n,label) => {if (!Number.isInteger(n) || n < 0 || n > 65535) throw Error(`${label} exceeds the native 16-bit limit.`); return n;};
const append = (data,extra) => {const offset = Math.ceil(data.length/4)*4, out = Buffer.alloc(offset+extra.length); if (out.length > 128*1024*1024) throw Error('Edited resource exceeds the 128 MB resource limit.'); out.set(data); out.set(extra,offset); return {data:out,offset};};
const join = (a,b) => {const out = Buffer.alloc(a.length+b.length); out.set(a); out.set(b,a.length); return out;};

// 44c2b0 constructs ordinary classes through one position/quaternion producer.
// Existing special objects keep their authored behavior and identities. Import,
// duplication and deletion remain narrower than original-object transforms.
export function inspectScenery(data,texture) {
  const gfxm = parseGFXM(data), placements = parsePlacements(texture,gfxm.models), linked=sceneryLinkedIndices(placements),assemblies=inspectSceneryAssemblies(data,texture,{gfxm,placements,linked}),scripted=inspectScriptedScenery(data,placements),adjacency=new Map(),attachmentOwners=new Map();
  for(const p of placements.records.filter(p=>p.type===0||p.type===24))for(let slot=0;slot<5;slot++){const handle=p.raw.readUInt16LE(46+slot*2),type=handle>>>12;if(!type)break;if([1,3,4].includes(type)){const key=`${type}:${handle&4095}`;if(!attachmentOwners.has(key))attachmentOwners.set(key,[]);attachmentOwners.get(key).push(p.index);}}
  for(const members of [...linked.values(),...scripted.linked.values(),...attachmentOwners.values()])for(const index of members){if(!adjacency.has(index))adjacency.set(index,new Set());for(const other of members)adjacency.get(index).add(other);}
  const connected=index=>{const queue=[index],found=new Set();while(queue.length){const n=queue.pop();if(found.has(n))continue;found.add(n);for(const other of adjacency.get(n)??[])queue.push(other);}return [...found].sort((a,b)=>typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b)));};
  return placements.records.filter(p => (p.type === 0 && (p.flags & 0x400))||[2,13,24].includes(p.type)).map(p => {
    if(p.type===2||p.type===13)return {index:p.index,modelIndex:null,position:[...p.position],yaw:p.angles[1],editable:true,reason:'',importable:false,duplicable:false,removable:false,yawEditable:false,importReason:'Original particle emitters support translation only; preserve shared attachment numbering.',linkedIndices:[p.index],special:true,animated:false,class:null,kind:'particle',bodyType:p.type,preview:{modelIndex:null,position:[...p.position],angles:[...p.angles],uvStarts:null,bodyType:p.type},script:null};
    if(p.type===24){
      const info=scripted.rows.get(p.index),members=connected(p.index);let reason=info?.reason??'';
      try{sceneryAttachmentTargets(data,p);}catch(error){reason=error.message;}
      if(info?.modelIndex!==null&&!gfxm.models[info?.modelIndex])reason='Animated object references a missing model.';
      const sharedLightIds=members.filter(n=>typeof n==='string'&&n.startsWith('light-')).map(n=>Number(n.slice(6)));
      return {index:p.index,modelIndex:info?.modelIndex??null,position:[...p.position],yaw:p.angles[1],editable:!reason,reason,importable:false,duplicable:false,removable:false,yawEditable:false,importReason:'Animated objects preserve original script ownership; duplication/import/removal is unsupported.',linkedIndices:members.filter(n=>typeof n==='number'),sharedLightIds,operationNotice:sharedLightIds.length?'Shared standalone light paths and coverage move with this object.':'',special:true,animated:true,class:p.raw[31],kind:info?.kind??'animated',bodyType:info?.bodyType,preview:info?scriptedSceneryPreview(data,p,info):null,script:info?.script?{index:p.raw[38],spawn:p.raw[39],commands:info.script.commands.map(c=>({...c})),path:info.script.coordinates.map(o=>[0,4,8].map(a=>data.readInt32LE(o+a)/65536))}:null};
    }
    let reason = '',importReason='',animated=false,packed=false;
    try {
      if (![0,1,2,3,4,7].includes(p.raw[31])) throw Error('Unrecognized authored object class; editing is locked.');
      if (p.flags !== 0x400) throw Error('Unsupported ordinary object flags; editing is locked.');
      const group=p.raw.readUInt16LE(6);if(group!==65535){const base=data.readUInt32LE(0x80);if(base<0x120)throw Error('Destruction group table is unavailable.');range(data,base+group*16,16,'Destruction group configuration');}
      sceneryAttachmentTargets(data,p);
      const model = gfxm.models[p.modelIndex], collision = parseModelCollision(data,model);
      if (!collision.available) throw Error('Collision representation is not supported for editing.');
      readPlacementCollision(data,p,collision);
      for (const [slot,part] of modelParts(data,model).entries()) {
        const materials = readModelMaterials(data,part,p.uvStarts[slot]);
        if (materials.some(face => face.animation)) animated=true;
        // 44c2b0 also ORs bit 6 into texture packet words. Retain that
        // native marker; other packed effects need separate reconstruction.
        if(materials.some(face=>!isSupportedStaticTextureWord(face.pageWord)))packed=true;
      }
    } catch (error) {reason = error.message;}
    if(reason)importReason=reason;
    else if(p.raw[31]!==7)importReason='Special or destructible objects can be transformed in place; duplication/import/removal is unsupported.';
    else if(p.raw.readUInt16LE(6)!==65535||p.raw[22]||p.raw[23])importReason='Linked object metadata cannot be duplicated or imported.';
    else if(p.raw[28]||p.raw[29]||p.raw[38]||p.raw.subarray(46).some(n=>n))importReason='Attached effects cannot be duplicated or imported.';
    else if(p.angles[0]||p.angles[2])importReason='Authored tilt cannot be duplicated or imported.';
    else if(animated)importReason='Animated materials cannot be duplicated or imported.';
    else if(packed)importReason='Packed texture mode cannot be duplicated or imported.';
    const importable=!importReason,linkedIndices=connected(p.index),scriptLinked=scripted.uses.some(use=>linkedIndices.includes(use.owner))||linkedIndices.some(index=>typeof index!=='number'),yawEditable=!p.angles[0]&&!p.angles[2]&&!scriptLinked;
    const sharedLightIds=linkedIndices.filter(n=>typeof n==='string'&&n.startsWith('light-')).map(n=>Number(n.slice(6)));
    return {index:p.index,modelIndex:p.modelIndex,position:[...p.position],yaw:p.angles[1],editable:!reason,reason,importable,duplicable:importable,removable:importable,yawEditable,importReason,linkedIndices:linkedIndices.filter(n=>typeof n==='number'),sharedLightIds,operationNotice:sharedLightIds.length?'Shared standalone light paths and coverage move with this object.':'',special:!importable,animated,class:p.raw[31],kind:'ordinary',...assemblies.get(p.index)};
  });
}

function modelParts(data,model) {
  return [0,...model.lodOffsets].map((relative,slot) => {
    if (slot && !relative) return {...model,faceCount:0,faces:[]};
    if (!slot) return model;
    const offset = model.offset+relative; range(data,offset,0x50,'Auxiliary model');
    const faceCount = data.readUInt16LE(offset+6), base = offset+data.readUInt32LE(offset+12);
    range(data,base,faceCount*8,'Auxiliary faces');
    return {offset,faceCount,faces:Array.from({length:faceCount},(_,i) => ({indices:[...data.subarray(base+i*8,base+i*8+4)]}))};
  });
}

export function createSceneryDraft(data,texture,level) {
  if (!SCENERY_LEVELS.includes(level)) throw Error('Unsupported scenery level.');
  return inspectScenery(data,texture).map(p => ({id:`original-${p.index}`,sourceLevel:level,templateIndex:p.index,position:p.position,yaw:p.yaw}));
}

export function validateSceneryRows(rows) {
  if (!Array.isArray(rows) || rows.length > SCENERY_PLACEMENT_LIMIT) throw Error('Scenery draft exceeds the 256 placement editor limit.');
  const ids = new Set();
  return Array.from(rows,row => {
    if (!row || Object.keys(row).sort().join(',') !== 'id,position,sourceLevel,templateIndex,yaw') throw Error('Invalid scenery fields.');
    if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(row.id) || ids.has(row.id)) throw Error('Invalid or duplicate scenery identity.');
    ids.add(row.id);
    if (!SCENERY_LEVELS.includes(row.sourceLevel) || !Number.isInteger(row.templateIndex) || row.templateIndex < 0 || row.templateIndex >= 65536) throw Error('Invalid scenery donor reference.');
    if (!Array.isArray(row.position) || row.position.length !== 3 || !Array.from(row.position).every(i16) || !i16(row.yaw)) throw Error('Scenery transform requires signed 16-bit native values.');
    return {...row,position:[...row.position]};
  });
}

// Keep the original tables as prefixes, including unused records. These exact
// ordered table boundaries are checked on each source, rather than guessed by
// scanning arbitrary header words for plausible pointers.
function table(data,start,end,label) {
  const a=data.readUInt32LE(start), b=data.readUInt32LE(end);
  range(data,a,b-a,label); if (a < 0x120) throw Error(`Unsupported ${label} layout.`);
  return Buffer.from(data.subarray(a,b));
}

function importTextures(destination,source,pages) {
  let output=Buffer.from(destination), btp=parseBTP(output); const from=parseBTP(source), mapping=new Map(),allocations=[];
  const problem=(message,code)=>{const error=Error(message);error.code=code;error.requiredTexturePages=[...pages].sort((a,b)=>a-b);error.textureAllocations=allocations.map(a=>({...a}));return error;};
  const pixels = (b,t) => b.data.subarray(t.pixelOffset,t.pixelOffset+t.width*t.height);
  const palette = (b,t) => b.data.subarray(t.paletteOffset,t.paletteOffset+1024);
  for (const page of [...pages].sort((a,b)=>a-b)) {
    const t=from.textures[page]; if (!t || t.empty || page===63) throw Error('Donor texture uses an unavailable or reserved page.');
    const match=btp.textures.find(d => d.index!==63 && !d.empty && d.width===t.width && d.height===t.height && d.unknown6===t.unknown6 && d.transparentBlack===t.transparentBlack && equal(pixels(btp,d),pixels(from,t)) && equal(palette(btp,d),palette(from,t)));
    if (match) {mapping.set(page,match.index);allocations.push({sourcePage:page,targetPage:match.index,action:'reuse',transparentBlack:t.transparentBlack});continue;}
    // Texture IDs above63 use native bits8..10. Preserve the complete original
    // descriptor prefix and every active texture; ID63 remains a runtime sentinel.
    let target=btp.textures.find(d => d.index!==63 && d.empty && d.transparentBlack===t.transparentBlack)?.index;
    let transparentStart=btp.transparentStart,transparentCount=btp.transparentCount,action=target===undefined?'append':'fill-empty';
    if(target===undefined){
      target=btp.textureCount===63?64:btp.textureCount;
      if(t.transparentBlack){
        const end=transparentStart+transparentCount;
        if(!transparentCount){transparentStart=target;transparentCount=1;}
        else if(end===btp.textureCount&&target<=end+1)transparentCount=target-transparentStart+1;
        else throw problem(`No compatible native texture slot: transparent donor page ${page} needs the track’s contiguous transparency range, which cannot be extended without renumbering active textures.`,'transparent-range');
        if(transparentStart>255||transparentCount>255)throw problem('No compatible native texture slot: transparency range exceeds native byte fields.','transparent-range');
      }else if(target>=transparentStart&&target<transparentStart+transparentCount)throw problem('No compatible native texture slot: the append position belongs to the reserved transparency range.','transparent-range');
    }
    const count=Math.max(btp.textureCount,target+1), descriptors=Buffer.alloc(count*12);
    const budget=trackTextureCapacity(count);if(!budget.valid)throw problem(`No compatible native texture slot: ${count} authored entries plus ${budget.runtimeReserve} original-startup textures exceed the native ${budget.nativeSlots}-entry map.`,'texture-capacity');
    descriptors.set(output.subarray(btp.textureTable,btp.textureTable+btp.textureCount*12));
    let added=append(output,palette(from,t)); output=added.data; const palOffset=added.offset;
    const palettes=join(output.subarray(btp.paletteBase,btp.paletteBase+btp.paletteCount*1024),output.subarray(palOffset,palOffset+1024));
    added=append(output,palettes); output=added.data; output.writeUInt32LE(added.offset,0x3c); output.writeUInt16LE(checkedWord(btp.paletteCount+1,'Palette count'),0x36);
    added=append(output,pixels(from,t)); output=added.data;
    const p=target*12; descriptors.writeUInt16LE(t.width,p); descriptors.writeUInt16LE(t.height,p+2); descriptors.writeUInt16LE(btp.paletteCount,p+4); descriptors.writeUInt16LE(t.unknown6,p+6); descriptors.writeUInt32LE(added.offset-btp.imageBase,p+8);
    added=append(output,descriptors); output=added.data; output.writeUInt32LE(added.offset,0x38); output.writeUInt16LE(count,0x34);
    output[0x32]=transparentStart;output[0x33]=transparentCount;
    mapping.set(page,target);allocations.push({sourcePage:page,targetPage:target,action,transparentBlack:t.transparentBlack});btp=parseBTP(output);
  }
  return {texture:output,mapping,allocations,budget:trackTextureCapacity(btp.textureCount)};
}

// A safe broad phase may contain extra candidates: native shape/plane tests
// remain unchanged. Assign edited models to every height layer of intersecting
// XZ cells; preserve all memberships of unedited objects. Model bounding spheres
// include collision-only vertices and point-shape centers. One cell of padding
// covers the recovered vehicle query radius (well below 256 source units).
function rebuildLinks(data,texture,changed,deleted) {
  const spatial=parseSpatialIndex(data), placements=parsePlacements(texture,parseGFXM(data).models), links=parseStaticModelLinks(data,spatial,placements);
  if (!spatial.available) throw Error('Scenery changes require a supported spatial index.');
  const models=parseGFXM(data).models;
  const lists=links.nodes.map(n => n.placementIndices.filter(i => !changed.has(i) && !deleted.has(i)));
  for (const index of changed) {
    const p=placements.records[index], model=models[p.modelIndex], collision=parseModelCollision(data,model);
    const radius=Math.ceil(Math.max(0,...collision.vertices.map(v=>Math.hypot(v[0],v[2])),...collision.shapes.map(s=>Math.hypot(s.center[0],s.center[2]))));
    const minX=Math.floor((p.position[0]-radius-256)/256)+128,maxX=Math.floor((p.position[0]+radius+256)/256)+128;
    const minZ=Math.floor((p.position[2]-radius-256)/256)+128,maxZ=Math.floor((p.position[2]+radius+256)/256)+128;
    // Query origins outside populated terrain use 4746f0's nearest-cell fallback.
    // Include that exact mapping as well: many stock decorative origins already
    // lie outside populated spans. Wrap source-coordinate bins like signed Q16.
    const columns=new Set(),rows=new Set();
    for(let x=minX;x<=maxX;x++)columns.add((x%256+256)%256);
    for(let z=minZ;z<=maxZ;z++)rows.add((z%256+256)%256);
    if(columns.size*rows.size>16384)throw Error('Model footprint exceeds the conservative editor limit of 16384 collision cells.');
    let found=false;const registered=new Set();
    for(const z of rows)for(const x of columns){
      const query=spatial.lookup([((x-128)*256+128)*65536,0,((z-128)*256+128)*65536]);if(!query.found)continue;
      let node=data.readUInt16LE(query.selected.mapPointer)/12;
      do {if(!registered.has(node)){registered.add(node);if(!lists[node].includes(index))lists[node].push(index);}found=true;}while(spatial.nodes[node++].continues);
    }
    if (!found) throw Error('The model has no valid collision registration cells.');
  }
  const entries=[], starts=new Map(), words=[];
  for (const [nodeIndex,list] of lists.entries()) {
    if (list.length>7) throw Error('A spatial cell would exceed the native limit of 7 static models. Move the model elsewhere.');
    // The first word is NOT padding. 48da10 reads it as packed route-group /
    // point indices through pack+7c, while 429360 pre-increments past it to
    // read model pointers. Keep both consumers' shared start index intact.
    const route=links.entries[links.nodes[nodeIndex].start];
    const key=`${route}:${list.join(',')}`; let start=starts.get(key);
    if (start===undefined) {start=entries.length; starts.set(key,start); entries.push(route,...list);}
    if (start>1023) throw Error('Static collision lists exceed the native 10-bit table offset limit.');
    words.push((list.length<<19)|(start<<22));
  }
  const bytes=Buffer.alloc(entries.length*4); entries.forEach((n,i)=>bytes.writeUInt32LE(n,i*4));
  const added=append(data,bytes), output=added.data; output.writeUInt32LE(added.offset,0xac); output.writeUInt16LE(checkedWord(entries.length,'Static reference count'),0x96);
  words.forEach((word,i)=>output.writeUInt32LE(((spatial.nodes[i].boundsWord&0x7ffff)|word)>>>0,spatial.nodes[i].offset));
  return output;
}

export function compileSceneryEdits(source,rows,{level,quality='LOW',donors=new Map(),assemblies=[]}={}) {
  return compileScenery(source,rows,{level,quality,donors,assemblies},true);
}

// Validate placement-independent asset/reference limits before offering a ghost.
// No partially indexed resources escape this boundary or enter export/preview.
export function validateSceneryImport(source,rows,options) {
  compileScenery(source,rows,options,false);
}

// Asset-only report for the library: no compiled resource bytes escape this API.
export function inspectSceneryImport(source,rows,options) {
  const initialTextureCount=parseBTP(source.texture).textureCount;
  try{const compiled=compileScenery(source,rows,options,false),finalTextureCount=parseBTP(compiled.texture).textureCount;return {compatible:true,initialTextureCount,finalTextureCount,textureAllocations:compiled.textureAllocations??[],capacity:trackTextureCapacity(finalTextureCount),reason:'',code:null};}
  catch(error){return {compatible:false,initialTextureCount,finalTextureCount:initialTextureCount,textureAllocations:error.textureAllocations??[],requiredTexturePages:error.requiredTexturePages??[],capacity:trackTextureCapacity(initialTextureCount),reason:error.message,code:error.code??'unsupported-dependency'};}
}

function compileScenery(source,rows,{level,quality='LOW',donors=new Map(),assemblies=[]}={},withSpatial) {
  const draft=validateSceneryRows(rows), assemblyDraft=validateSceneryAssemblies(assemblies), original=createSceneryDraft(source.geometry,source.texture,level);
  if (same(draft,original)&&!assemblyDraft.length) return {geometry:Buffer.from(source.geometry),texture:Buffer.from(source.texture),indices:Object.fromEntries(original.map(p=>[p.id,p.templateIndex])),assemblies:[]};
  const memberIds=new Set(draft.map(r=>r.id));for(const command of assemblyDraft){if(memberIds.has(command.id))throw Error('Assembly and model identities must be distinct.');memberIds.add(command.id);}
  const info=inspectScenery(source.geometry,source.texture), byId=new Map(draft.map(p=>[p.id,p]));
  validateSceneryTransforms(original,draft,info);
  for (const p of original) {
    const edited=byId.get(p.id);
    if (!info.find(i=>i.index===p.templateIndex).editable && !same(p,edited)) throw Error('A locked placement cannot be changed or removed.');
    if (edited && (edited.sourceLevel!==level || edited.templateIndex!==p.templateIndex)) throw Error('Original placement identity cannot change.');
  }
  if (draft.some(p=>p.id.startsWith('original-') && !original.some(o=>o.id===p.id))) throw Error('Unknown original placement identity.');
  let data=Buffer.from(source.geometry), texture=Buffer.from(source.texture);const textureAllocations=[];
  const gfxm=parseGFXM(data), placements=parsePlacements(texture,gfxm.models), records=placements.records.map(p=>Buffer.from(p.raw));
  let uv=table(data,0xcc,0xd8,'UV index table'), configurations=table(data,0x88,0x8c,'collision configuration table'), geometry=table(data,0x1c,0x84,'placement geometry table');
  // 46d0e0 addresses 12-byte descriptors through the UV key >> 2.
  // The next authored table (0xac) is independently relocated by terrain and
  // spatial rebuilds, so its new address cannot delimit this material table.
  // The UV table itself is padded to four bytes; its last halfword may contain
  // arbitrary padding. Only ordinary instances consume these indexed UVs;
  // script-owned models use their embedded packets instead.
  let usedUVBytes=0;for(const p of placements.records)if(p.type===0)for(const [slot,part]of modelParts(data,gfxm.models[p.modelIndex]).entries())if(part.faceCount)usedUVBytes=Math.max(usedUVBytes,(p.uvStarts[slot]+part.faceCount)*2);
  range(uv,0,usedUVBytes,'used UV indices');
  let materialBytes=0;for(let p=0;p<usedUVBytes;p+=2)materialBytes=Math.max(materialBytes,(uv.readUInt16LE(p)>>>2)+12);
  const materialBase=data.readUInt32LE(0xd8),authoredExtent=data.readUInt32LE(0xac)-materialBase;
  if(authoredExtent>=materialBytes&&authoredExtent<=16384)materialBytes=authoredExtent;
  range(data,materialBase,materialBytes,'material table');let materials=Buffer.from(data.subarray(materialBase,materialBase+materialBytes));
  const modelOffsets=gfxm.models.map(m=>m?.offset??0), imported=new Map(), changed=new Set(), deleted=new Set(), indices=Object.create(null);
  const importedModels=new Map(), importedGeometry=new Map(), materialOffsets=new Map();
  for(let p=0;p+2<=uv.length;p+=2){const offset=uv.readUInt16LE(p)>>>2;if(offset+12<=materials.length){const key=materials.subarray(offset,offset+12).toString('hex');if(!materialOffsets.has(key))materialOffsets.set(key,offset);}}
  for (const p of original) if (!byId.has(p.id)) {records[p.templateIndex].writeUInt16LE(25,0); deleted.add(p.templateIndex);}
  for (const row of draft) {
    const existing=original.find(p=>p.id===row.id);
    if (existing && same(row,existing)) {indices[row.id]=existing.templateIndex; continue;}
    const donor=row.sourceLevel===level?source:donors.get(row.sourceLevel)?.[quality];
    if (!donor) throw Error('The original donor library is missing.');
    const donorModels=parseGFXM(donor.geometry), placement=parsePlacements(donor.texture,donorModels.models).records[row.templateIndex];
    const eligibility=inspectScenery(donor.geometry,donor.texture).find(p=>p.index===row.templateIndex);
    if (!eligibility?.editable) throw Error(eligibility?.reason??'Unsupported scenery template.');
    if(!existing&&!eligibility.importable)throw Error(eligibility.importReason||'Special object cannot be duplicated or imported.');
    const raw=Buffer.from(placement.raw); let modelIndex=placement.modelIndex;
    if (row.sourceLevel!==level) {
      const key=`${row.sourceLevel}:${row.templateIndex}`;
      let importedRow=imported.get(key);
      if (!importedRow) {
        const model=donorModels.models[placement.modelIndex], parts=modelParts(donor.geometry,model);
        const faces=parts.map((part,i)=>readModelMaterials(donor.geometry,part,placement.uvStarts[i]));
        const pages=new Set(faces.flat().map(f=>f.page));
        const textures=importTextures(texture,donor.texture,pages); texture=textures.texture;textureAllocations.push(...textures.allocations.map(a=>({...a,sourceLevel:row.sourceLevel,modelIndex:model.index})));
        // Copy an isolated donor resource, preserving every model-relative
        // collision/LOD offset and unknown byte. Only the selected model is
        // exposed in the destination model table; unrelated donor data is inert.
        // Ordinary placements pass authored+28 as the nonzero mode argument
        // to 4741c0; their materials come from instance UV keys, not the car's
        // embedded packet path. Do not reinterpret or patch unknown model bytes.
        const modelKey=`${row.sourceLevel}:${model.index}`;
        modelIndex=importedModels.get(modelKey);
        if(modelIndex===undefined){const clone=Buffer.from(donor.geometry),added=append(data,clone);data=added.data;modelIndex=modelOffsets.length;if(modelIndex>255)throw Error('Model index exceeds the native byte limit.');modelOffsets.push(added.offset+model.offset);importedModels.set(modelKey,modelIndex);}
        raw[3]=modelIndex;
        for (let slot=0;slot<3;slot++) {
          raw.writeUInt16LE(checkedWord(uv.length/2,'UV start'),40+slot*2);
          const keys=Buffer.alloc(faces[slot].length*2);
          faces[slot].forEach((face,i)=>{
            const descriptor=Buffer.from(donor.geometry.subarray(face.descriptor,face.descriptor+12));
            descriptor.writeUInt16LE(encodeTexturePageWord(textures.mapping.get(face.page),face.pageWord),6);
            const key=descriptor.toString('hex');let offset=materialOffsets.get(key);
            if(offset===undefined){const padding=(4-materials.length%4)%4;if(padding)materials=join(materials,Buffer.alloc(padding));offset=materials.length;materialOffsets.set(key,offset);materials=join(materials,descriptor);}
            keys.writeUInt16LE(checkedWord(offset*4+(face.key&3),'Material key'),i*2);
          });
          uv=join(uv,keys);
        }
        const collision=parseModelCollision(donor.geometry,model), settings=readPlacementCollision(donor.geometry,placement,collision);
        raw.writeUInt16LE(checkedWord(configurations.length/4,'Collision configuration start'),20);
        for(const c of settings.configurations) configurations=join(configurations,c.raw);
        const donorGeometry=table(donor.geometry,0x1c,0x84,'donor placement geometry');let geometryStart=importedGeometry.get(row.sourceLevel);
        if(geometryStart===undefined){geometryStart=geometry.length;importedGeometry.set(row.sourceLevel,geometryStart);geometry=join(geometry,donorGeometry);}
        for(const offset of [32,34,36]) {const value=raw.readUInt16LE(offset);range(donorGeometry,value,0,'Placement geometry reference');raw.writeUInt16LE(checkedWord(geometryStart+value,'Placement geometry reference'),offset);}
        importedRow=Buffer.from(raw); imported.set(key,importedRow);
      }
      raw.set(importedRow);
    }
    row.position.forEach((n,i)=>raw.writeInt16LE(n,8+i*2)); raw.writeInt16LE(row.yaw,16);
    const index=existing?existing.templateIndex:records.length; if (!existing) records.push(raw); else records[index]=raw;
    if(placement.type===0)changed.add(index); indices[row.id]=index;
  }
  if (records.length>SCENERY_PLACEMENT_LIMIT) throw Error('Track exceeds the conservative authored placement editor limit (256).');
  data=transformSceneryAttachments(source.geometry,data,placements,original,draft);
  data=compileScriptedSceneryTransforms(source.geometry,data,placements,original,draft);
  const assembled=compileSceneryAssemblies(source,assemblyDraft,{level,geometry:data,configurations,firstIndex:records.length});data=assembled.geometry;configurations=assembled.configurations;
  for(const [id,index]of Object.entries(assembled.indices)){if(memberIds.has(id))throw Error('Assembly member identity conflicts with another model or assembly.');memberIds.add(id);indices[id]=index;changed.add(index);}records.push(...assembled.records);
  if(records.length>SCENERY_PLACEMENT_LIMIT)throw Error('Track exceeds the conservative authored placement editor limit (256).');
  if (imported.size) {
    for(const [offset,bytes] of [[0xcc,uv],[0xd8,materials],[0x88,configurations],[0x1c,geometry]]) {const added=append(data,bytes);data=added.data;data.writeUInt32LE(added.offset,offset);}
    const models=Buffer.alloc(modelOffsets.length*4);modelOffsets.forEach((p,i)=>models.writeUInt32LE(p,i*4));const added=append(data,models);data=added.data;data.writeUInt32LE(added.offset,0x18);data.writeUInt16LE(modelOffsets.length,0x2c);
  }
  else if(assemblyDraft.length){const added=append(data,configurations);data=added.data;data.writeUInt32LE(added.offset,0x88);}
  const bytes=Buffer.alloc(records.length*56); records.forEach((raw,i)=>bytes.set(raw,i*56));const added=append(texture,bytes);texture=added.data;texture.writeUInt32LE(added.offset,0x28);texture.writeUInt32LE(records.length,0x14);
  // Remove deleted references before parsing the new placement table: tombstones
  // retain indices of every special/linked original object and dispatch as skip
  // (>24) in 44c2b0. No unrelated authored reference is renumbered.
  // rebuildLinks reads original valid lists and filters tombstoned indices itself.
  if(withSpatial&&(changed.size||deleted.size))data=rebuildSceneryLinks(data,texture,changed,deleted);
  const parsed=parsePlacements(texture,parseGFXM(data).models);
  if(withSpatial)parseStaticModelLinks(data,parseSpatialIndex(data),parsed);
  return {geometry:data,texture,indices,assemblies:assembled.assemblies,textureAllocations};
}

function rebuildSceneryLinks(data,texture,changed,deleted) {
  // The parser deliberately rejects references to skipped placements. Supply a
  // temporary ordinary source table while obtaining the preserved old lists.
  const temp=Buffer.from(texture), offset=temp.readUInt32LE(0x28);
  for(const index of deleted) temp.writeUInt16LE(0x400,offset+index*56);
  return rebuildLinks(data,temp,changed,deleted);
}
