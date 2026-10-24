import {SCENERY_LEVELS, validateSceneryRows, compileSceneryEdits} from './scenery-editor.mjs';
import {validatePickupDraft, compilePickupEdits} from './pickup-editor.mjs';

const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
function fields(value,keys,label) {
  if (!value || Array.isArray(value) || typeof value!=='object' || ![Object.prototype,null].includes(Object.getPrototypeOf(value)) || Object.keys(value).sort().join(',')!==[...keys].sort().join(',')) throw Error(`Invalid ${label} fields.`);
}
export function parseTrackProject(value) {
  const project=typeof value==='string'?JSON.parse(value):value;
  fields(project,['schemaVersion','game','indexSha256','sources','levels'],'track project');
  if(project.schemaVersion!==2 || project.game!=='rollcage' || !hash(project.indexSha256)) throw Error('Unsupported track project or archive hash.');
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
    fields(row,['level','pickups','models'],'edited level');
    if(!SCENERY_LEVELS.includes(row.level)||seen.has(row.level)||!sources.some(s=>s.level===row.level)) throw Error('Unsupported, duplicate or missing project source.');seen.add(row.level);
    // Template existence and locked objects are validated against original bytes
    // at compile time. Never accept raw patches or caller-supplied model bytes.
    if(!Array.isArray(row.pickups)||row.pickups.length>16)throw Error('Invalid pickup draft.');
    const models=validateSceneryRows(row.models);
    if(models.some(m=>!sources.some(s=>s.level===m.sourceLevel)))throw Error('Missing donor source hash.');
    return {level:row.level,pickups:structuredClone(row.pickups),models};
  });
  return {schemaVersion:2,game:'rollcage',indexSha256:project.indexSha256,sources,levels};
}

export function compileTrackDraft(pair,{level,pickups,models},donors) {
  const result={};
  for(const quality of ['LOW','HIGH']) {
    validatePickupDraft(pair[quality].geometry,pickups);
    const compiled=compileSceneryEdits(pair[quality],models,{level,quality,donors});
    result[quality]={...compiled,geometry:compilePickupEdits(compiled.geometry,pickups)};
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
    compiled.set(row.level,compileTrackDraft(pair,row,sources));
  }
  return {project,compiled};
}
