import {parseCollisionGrid} from './collision-grid.mjs';
import {parseRespawnRoutes} from './respawn-routes.mjs';
import {inspectRaceLayoutFallback} from './race-layout-spatial.mjs';

// New road sectors are explicitly associated with their editable route group.
// Native48da10 reads the first sequence word; following model words belong to
// 429360 and are copied without reinterpretation, including aliased sequences.
export function assignGeneratedRoadFallback(source,topology,roads=[]) {
 if(!roads.length)return {data:source,changedNodes:[]};
 const active=roads.flatMap(road=>{const group=topology.groups.find(g=>g.roadId===road.roadId&&!g.retired&&g.points.length);return group?[{...road,group}]:[];});if(!active.length)return {data:source,changedNodes:[]};
 const grid=parseCollisionGrid(source),routes=parseRespawnRoutes(source),spatial=grid.spatial,fallback=inspectRaceLayoutFallback(source,spatial,routes.groups),sectorOwners=new Map();
 for(const road of active)for(const sector of road.sectors){if(sectorOwners.has(sector))throw Error('Generated terrain sector belongs to conflicting road routes.');sectorOwners.set(sector,road);}
 const zones=new Map(grid.zones.map(z=>[z.root,z])),regions=new Map(grid.regions.map(r=>[r.index,r])),replacements=new Map(),changedNodes=[];
 for(const row of fallback.nodes){const node=spatial.nodes[row.node],centers=new Map();
  for(const id of zones.get(node.zone)?.regions??[]){const region=regions.get(id),road=sectorOwners.get(region.sector);if(!road)continue;const s=grid.scene.segments[region.sector],ids=[region.row*(s.columns+1)+region.column,(region.row+region.rows)*(s.columns+1)+region.column,region.row*(s.columns+1)+region.column+region.columns,(region.row+region.rows)*(s.columns+1)+region.column+region.columns],center=[0,1,2].map(axis=>ids.reduce((sum,i)=>sum+s.vertices[i][axis],0)/4);if(!centers.has(road.roadId))centers.set(road.roadId,{road,values:[]});centers.get(road.roadId).values.push(center);}
  let best;for(const {road,values}of centers.values()){const center=[0,1,2].map(axis=>values.reduce((sum,p)=>sum+p[axis],0)/values.length);for(const [point,p]of road.group.points.entries()){const score=p.position.reduce((sum,n,axis)=>sum+(n-center[axis])**2,0);if(!best||score<best.score)best={score,group:road.group.index,point};}}
  if(best&&(row.group!==best.group||row.point!==best.point)){replacements.set(row.node,(best.group*65536+best.point)>>>0);changedNodes.push({node:row.node,previousGroup:row.group,previousPoint:row.point,group:best.group,point:best.point});}
 }
 if(!changedNodes.length)return {data:source,changedNodes};
 const words=[],sequences=new Map(),starts=[];for(const row of fallback.nodes){const values=[replacements.get(row.node)??row.word,...row.models],signature=values.join(',');let start=sequences.get(signature);if(start===undefined){start=words.length;sequences.set(signature,start);words.push(...values);}if(start>1023||words.length>65535)throw Error('Generated road route fallback exceeds native shared-table capacity.');starts.push(start);}
 const offset=Math.ceil(source.length/4)*4;if(offset+words.length*4>128*1024*1024)throw Error('Generated route resource exceeds128MiB.');const data=Buffer.alloc(offset+words.length*4);data.set(source);words.forEach((word,i)=>data.writeUInt32LE(word,offset+i*4));data.writeUInt32LE(offset,0xac);data.writeUInt16LE(words.length,0x96);for(const [i,start]of starts.entries())data.writeUInt32LE(((spatial.nodes[i].boundsWord&0x3fffff)|start<<22)>>>0,spatial.nodes[i].offset);return {data,changedNodes};
}
