import {SCENERY_LEVELS, validateSceneryRows, compileSceneryEdits, createSceneryDraft, inspectScenery} from './scenery-editor.mjs';
import {validatePickupDraft, compilePickupEdits} from './pickup-editor.mjs';
import {compileTerrainEdits,emptyTerrainDraft} from './terrain-editor.mjs';
import {compileRaceLayoutEdits,emptyRaceLayoutDraft} from './race-layout-editor.mjs';

const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
function fields(value,keys,label) {
  if (!value || Array.isArray(value) || typeof value!=='object' || ![Object.prototype,null].includes(Object.getPrototypeOf(value)) || Object.keys(value).sort().join(',')!==[...keys].sort().join(',')) throw Error(`Invalid ${label} fields.`);
}
export function parseTrackProject(value) {
  const project=typeof value==='string'?JSON.parse(value):value;
  fields(project,['schemaVersion','game','indexSha256','sources','levels'],'track project');
  if(![2,3,4].includes(project.schemaVersion) || project.game!=='rollcage' || !hash(project.indexSha256)) throw Error('Unsupported track project or archive hash.');
  if(!Array.isArray(project.sources)||project.sources.length>SCENERY_LEVELS.length||!Array.isArray(project.levels)||project.levels.length>SCENERY_LEVELS.length) throw Error('Invalid project level list.');
  const seen=new Set(), sources=project.sources.map(source=>{
    fields(source,['level','hashes'],'source');
    if(!SCENERY_LEVELS.includes(source.level)||seen.has(source.level)) throw Error('Unsupported or duplicate source level.'); seen.add(source.level);
    fields(source.hashes,['LOW','HIGH'],'source hashes');
    for(const quality of ['LOW','HIGH']) {fields(source.hashes[quality],['geometry','texture'],'resource hashes');if(!Object.values(source.hashes[quality]).every(hash))throw Error('Invalid source resource hash.');}
    return structuredClone(source);
  });
  seen.clear();
  const levels=project.levels.map(row=>{
    fields(row,project.schemaVersion===4?['level','pickups','models','terrain','layout']:project.schemaVersion===3?['level','pickups','models','terrain']:['level','pickups','models'],'edited level');
    if(!SCENERY_LEVELS.includes(row.level)||seen.has(row.level)||!sources.some(s=>s.level===row.level)) throw Error('Unsupported, duplicate or missing project source.');seen.add(row.level);
    // Template existence and locked objects are validated against original bytes
    // at compile time. Never accept raw patches or caller-supplied model bytes.
    if(!Array.isArray(row.pickups)||row.pickups.length>16)throw Error('Invalid pickup draft.');
    const models=validateSceneryRows(row.models);
    if(models.some(m=>!sources.some(s=>s.level===m.sourceLevel)))throw Error('Missing donor source hash.');
    let terrain;if(project.schemaVersion>=3){
      fields(row.terrain,['heights','surfaces'],'terrain');
      if(!Array.isArray(row.terrain.heights)||!Array.isArray(row.terrain.surfaces)||row.terrain.heights.length>1000000||row.terrain.surfaces.length>1000000)throw Error('Invalid terrain edit list.');
      for(const r of row.terrain.heights){fields(r,['sector','vertex','height'],'height');if(Object.values(r).some(n=>!Number.isInteger(n))||r.sector<0||r.vertex<0||r.height< -32768||r.height>32767)throw Error('Invalid terrain height.');}
      for(const r of row.terrain.surfaces){fields(r,['sector','cell','sourceSector','sourceCell'],'surface');if(Object.values(r).some(n=>!Number.isInteger(n)||n<0))throw Error('Invalid surface edit.');}
      terrain=structuredClone(row.terrain);
    }
    let layout;if(project.schemaVersion===4){
      fields(row.layout,['routes','checkpoints','starts'],'race layout');
      const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isInteger(n)&&n>=-32768&&n<=32767);
      for(const kind of ['routes','checkpoints','starts']){
        const entries=row.layout[kind];if(!Array.isArray(entries)||entries.length>1000000)throw Error('Invalid race-layout edit list.');
        const seen=new Set();for(const r of entries){
          fields(r,kind==='routes'?['group','point','position','minSpeed','targetSpeed']:kind==='checkpoints'?['id','position','direction']:['index','position'],'race layout row');
          if(!vector(r.position)||kind==='checkpoints'&&(!vector(r.direction)||r.direction.every(n=>n===0)))throw Error('Invalid race-layout coordinates.');
          const ids=kind==='routes'?[r.group,r.point]:[kind==='checkpoints'?r.id:r.index],id=ids.join(':');
          if(ids.some(n=>!Number.isInteger(n)||n<0)||seen.has(id))throw Error('Missing or duplicate race-layout identity.');seen.add(id);
          if(kind==='routes'&&[r.minSpeed,r.targetSpeed].some(n=>!Number.isInteger(n)||n<0||n>255))throw Error('Route speeds require unsigned bytes.');
        }
      }
      layout=structuredClone(row.layout);
    }
    return {level:row.level,pickups:structuredClone(row.pickups),models,...(terrain?{terrain}:{}),...(layout?{layout}:{})};
  });
  return {schemaVersion:project.schemaVersion,game:'rollcage',indexSha256:project.indexSha256,sources,levels};
}

export function compileTrackDraft(pair,{level,pickups,models,terrain=emptyTerrainDraft(),layout=emptyRaceLayoutDraft()},donors) {
  const result={};
  for(const quality of ['LOW','HIGH']) {
    validatePickupDraft(pair[quality].geometry,pickups);
    const geometry=compileTerrainEdits(pair[quality].geometry,terrain);
    const compiled=compileSceneryEdits({...pair[quality],geometry},models,{level,quality,donors});
    result[quality]={...compiled,geometry:compileRaceLayoutEdits(compilePickupEdits(compiled.geometry,pickups),layout)};
  }
  return result;
}

export function validateTrackProject(value,{indexSha256,sources,hashes}) {
  const project=parseTrackProject(value);
  if(project.indexSha256!==indexSha256)throw Error('Project archive index hash mismatch.');
  for(const source of project.sources)for(const quality of ['LOW','HIGH'])for(const kind of ['geometry','texture'])if(source.hashes[quality][kind]!==hashes.get(source.level)?.[quality]?.[kind])throw Error('Project source geometry/texture hash mismatch.');
  const compiled=new Map();
  for(const row of project.levels) {
    const pair=sources.get(row.level);if(!pair)throw Error('Missing original project source.');
    // Earlier versions inventoried ordinary type-zero models only. Their
    // absent script-owned rows mean "unchanged", never deletion of those bodies.
    if(project.schemaVersion<=3){
      const info=inspectScenery(pair.LOW.geometry,pair.LOW.texture),extra=new Set(info.filter(p=>p.kind&&p.kind!=='ordinary').map(p=>p.index));
      for(const original of createSceneryDraft(pair.LOW.geometry,pair.LOW.texture,row.level))if(extra.has(original.templateIndex)&&!row.models.some(p=>p.id===original.id))row.models.push(original);
      const isOriginal=p=>p.sourceLevel===row.level&&p.id===`original-${p.templateIndex}`;
      row.models=[...row.models.filter(isOriginal).sort((a,b)=>a.templateIndex-b.templateIndex),...row.models.filter(p=>!isOriginal(p))];
    }
    compiled.set(row.level,compileTrackDraft(pair,row,sources));
  }
  return {project,compiled};
}
