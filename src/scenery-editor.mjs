import {parseGFXM} from './gfxm.mjs';
import {parsePlacements} from './placements.mjs';
import {parseModelCollision, readPlacementCollision} from './model-collision.mjs';
import {readModelMaterials} from './model-materials.mjs';
import {parseBTP} from './btp.mjs';
import {parseSpatialIndex} from './spatial-index.mjs';
import {parseStaticModelLinks} from './model-links.mjs';

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

// 44c2b0 / 48ee80: class 7 with no group or attachments is the plain,
// non-destructible constructor path. Class 0 alone does NOT mean static scenery.
export function inspectScenery(data,texture) {
  const gfxm = parseGFXM(data), placements = parsePlacements(texture,gfxm.models);
  return placements.records.filter(p => p.type === 0 && (p.flags & 0x400)).map(p => {
    let reason = '';
    try {
      if (p.raw[31] !== 7) throw Error('Destructible or special object class; editing is locked.');
      if (p.raw.readUInt16LE(6) !== 65535 || p.raw[22] || p.raw[23]) throw Error('Linked object group; editing is locked.');
      if (p.flags !== 0x400 || p.raw[28] || p.raw[29] || p.raw[38] || p.raw.subarray(46).some(n => n)) throw Error('Attached effects or special flags; editing is locked.');
      if (p.angles[0] || p.angles[2]) throw Error('Authored tilt requires an unsupported rotation path.');
      const model = gfxm.models[p.modelIndex], collision = parseModelCollision(data,model);
      if (!collision.available) throw Error('Collision representation is not supported for editing.');
      readPlacementCollision(data,p,collision);
      for (const [slot,part] of modelParts(data,model).entries()) {
        const materials = readModelMaterials(data,part,p.uvStarts[slot]);
        if (materials.some(face => face.animation)) throw Error('Animated materials; editing is locked.');
        // 44c2b0 also ORs bit 6 into texture packet words. Retain that
        // native marker; other packed effects need separate reconstruction.
        if(materials.some(face=>face.pageWord&~0x7f))throw Error('Unsupported packed texture mode; editing is locked.');
      }
    } catch (error) {reason = error.message;}
    return {index:p.index,modelIndex:p.modelIndex,position:[...p.position],yaw:p.angles[1],editable:!reason,reason};
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
  let output=Buffer.from(destination), btp=parseBTP(output); const from=parseBTP(source), mapping=new Map();
  const pixels = (b,t) => b.data.subarray(t.pixelOffset,t.pixelOffset+t.width*t.height);
  const palette = (b,t) => b.data.subarray(t.paletteOffset,t.paletteOffset+1024);
  for (const page of [...pages].sort((a,b)=>a-b)) {
    const t=from.textures[page]; if (!t || t.empty || page===63) throw Error('Donor texture uses an unavailable or reserved page.');
    const match=btp.textures.find(d => d.index<63 && !d.empty && d.width===t.width && d.height===t.height && d.unknown6===t.unknown6 && d.transparentBlack===t.transparentBlack && equal(pixels(btp,d),pixels(from,t)) && equal(palette(btp,d),palette(from,t)));
    if (match) {mapping.set(page,match.index); continue;}
    // Native page words have six base-page bits. Never wrap a HIGH page, reuse
    // reserved ID63, or overwrite an active destination texture to force a fit.
    let target=btp.textures.find(d => d.index<63 && d.empty && d.transparentBlack===t.transparentBlack)?.index;
    if (target===undefined && btp.textureCount<63 && !t.transparentBlack && !(btp.textureCount>=btp.transparentStart && btp.textureCount<btp.transparentStart+btp.transparentCount)) target=btp.textureCount;
    if (target===undefined) throw Error('No compatible native texture slot in this track/quality. Choose another model or library.');
    const count=Math.max(btp.textureCount,target+1), descriptors=Buffer.alloc(count*12);
    descriptors.set(output.subarray(btp.textureTable,btp.textureTable+btp.textureCount*12));
    let added=append(output,palette(from,t)); output=added.data; const palOffset=added.offset;
    const palettes=join(output.subarray(btp.paletteBase,btp.paletteBase+btp.paletteCount*1024),output.subarray(palOffset,palOffset+1024));
    added=append(output,palettes); output=added.data; output.writeUInt32LE(added.offset,0x3c); output.writeUInt16LE(checkedWord(btp.paletteCount+1,'Palette count'),0x36);
    added=append(output,pixels(from,t)); output=added.data;
    const p=target*12; descriptors.writeUInt16LE(t.width,p); descriptors.writeUInt16LE(t.height,p+2); descriptors.writeUInt16LE(btp.paletteCount,p+4); descriptors.writeUInt16LE(t.unknown6,p+6); descriptors.writeUInt32LE(added.offset-btp.imageBase,p+8);
    added=append(output,descriptors); output=added.data; output.writeUInt32LE(added.offset,0x38); output.writeUInt16LE(count,0x34);
    mapping.set(page,target); btp=parseBTP(output);
  }
  return {texture:output,mapping};
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

export function compileSceneryEdits(source,rows,{level,quality='LOW',donors=new Map()}={}) {
  return compileScenery(source,rows,{level,quality,donors},true);
}

// Validate placement-independent asset/reference limits before offering a ghost.
// No partially indexed resources escape this boundary or enter export/preview.
export function validateSceneryImport(source,rows,options) {
  compileScenery(source,rows,options,false);
}

function compileScenery(source,rows,{level,quality='LOW',donors=new Map()}={},withSpatial) {
  const draft=validateSceneryRows(rows), original=createSceneryDraft(source.geometry,source.texture,level);
  if (same(draft,original)) return {geometry:Buffer.from(source.geometry),texture:Buffer.from(source.texture),indices:Object.fromEntries(original.map(p=>[p.id,p.templateIndex]))};
  const info=inspectScenery(source.geometry,source.texture), byId=new Map(draft.map(p=>[p.id,p]));
  for (const p of original) {
    const edited=byId.get(p.id);
    if (!info.find(i=>i.index===p.templateIndex).editable && !same(p,edited)) throw Error('A locked placement cannot be changed or removed.');
    if (edited && (edited.sourceLevel!==level || edited.templateIndex!==p.templateIndex)) throw Error('Original placement identity cannot change.');
  }
  if (draft.some(p=>p.id.startsWith('original-') && !original.some(o=>o.id===p.id))) throw Error('Unknown original placement identity.');
  let data=Buffer.from(source.geometry), texture=Buffer.from(source.texture);
  const gfxm=parseGFXM(data), placements=parsePlacements(texture,gfxm.models), records=placements.records.map(p=>Buffer.from(p.raw));
  let uv=table(data,0xcc,0xd8,'UV index table'), materials=table(data,0xd8,0xac,'material table'), configurations=table(data,0x88,0x8c,'collision configuration table'), geometry=table(data,0x1c,0x84,'placement geometry table');
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
    const raw=Buffer.from(placement.raw); let modelIndex=placement.modelIndex;
    if (row.sourceLevel!==level) {
      const key=`${row.sourceLevel}:${row.templateIndex}`;
      let importedRow=imported.get(key);
      if (!importedRow) {
        const model=donorModels.models[placement.modelIndex], parts=modelParts(donor.geometry,model);
        const faces=parts.map((part,i)=>readModelMaterials(donor.geometry,part,placement.uvStarts[i]));
        const pages=new Set(faces.flat().map(f=>f.page));
        const textures=importTextures(texture,donor.texture,pages); texture=textures.texture;
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
            descriptor.writeUInt16LE((face.pageWord&~63)|textures.mapping.get(face.page),6);
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
    changed.add(index); indices[row.id]=index;
  }
  if (records.length>SCENERY_PLACEMENT_LIMIT) throw Error('Track exceeds the conservative authored placement editor limit (256).');
  if (imported.size) {
    for(const [offset,bytes] of [[0xcc,uv],[0xd8,materials],[0x88,configurations],[0x1c,geometry]]) {const added=append(data,bytes);data=added.data;data.writeUInt32LE(added.offset,offset);}
    const models=Buffer.alloc(modelOffsets.length*4);modelOffsets.forEach((p,i)=>models.writeUInt32LE(p,i*4));const added=append(data,models);data=added.data;data.writeUInt32LE(added.offset,0x18);data.writeUInt16LE(modelOffsets.length,0x2c);
  }
  const bytes=Buffer.alloc(records.length*56); records.forEach((raw,i)=>bytes.set(raw,i*56));const added=append(texture,bytes);texture=added.data;texture.writeUInt32LE(added.offset,0x28);texture.writeUInt32LE(records.length,0x14);
  // Remove deleted references before parsing the new placement table: tombstones
  // retain indices of every special/linked original object and dispatch as skip
  // (>24) in 44c2b0. No unrelated authored reference is renumbered.
  // rebuildLinks reads original valid lists and filters tombstoned indices itself.
  if(withSpatial)data=rebuildSceneryLinks(data,texture,changed,deleted);
  const parsed=parsePlacements(texture,parseGFXM(data).models);
  if(withSpatial)parseStaticModelLinks(data,parseSpatialIndex(data),parsed);
  return {geometry:data,texture,indices};
}

function rebuildSceneryLinks(data,texture,changed,deleted) {
  // The parser deliberately rejects references to skipped placements. Supply a
  // temporary ordinary source table while obtaining the preserved old lists.
  const temp=Buffer.from(texture), offset=temp.readUInt32LE(0x28);
  for(const index of deleted) temp.writeUInt16LE(0x400,offset+index*56);
  return rebuildLinks(data,temp,changed,deleted);
}
