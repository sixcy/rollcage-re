import {add32,subtract32,lookupSqrt,signedShort} from './fixed-integer.mjs';
import {unpackCollisionNormal} from './collision-grid.mjs';
const dot32=(a,b)=>a.reduce((sum,value,i)=>add32(sum,Math.imul(value,b[i])),0);
const cellId=(sector,row,column)=>(sector|(column<<8)|(row<<16))>>>0;
// FUN_004292a0, with Q8 probe coordinates/radius and signed Q8 normals.
export function acceptsCollisionPlane(query,packedNormal,point,flags=0x10000) {
 const normal=unpackCollisionNormal(packedNormal),relative=point.slice(0,3).map((value,i)=>subtract32(query.originQ8[i],value<<8));
 const distance=subtract32(dot32(relative,normal)>>8,query.radiusQ8);
 if(distance<0)return !!(flags&0x80000000)||Math.imul(query.radiusQ8,-2)<=distance;
 const approach=dot32(query.deltaQ8,normal);
 return approach<0&&add32(approach>>8,distance)<1;
}
function vertexMetric(vertex,center) {
 const delta=vertex.slice(0,3).map((value,i)=>subtract32(value,center[i])),metric=dot32(delta,delta)>>6;
 return metric&0xffff0000?65535:metric;
}
function cornerPruned(sector,top,corner,center) {
 const x=corner&1,y=corner>>1,offset=x+y*(sector.columns+1),vertex=sector.vertices[top+offset];
 const relative=center.map((value,i)=>subtract32(value,vertex[i]));
 const first=((y-1)&1)+(x?sector.columns+1:0),second=y+(x?0:sector.columns+1);
 const edge=index=>sector.vertices[top+index].slice(0,3).map((value,i)=>subtract32(value,vertex[i]));
 return dot32(edge(first),relative)<0&&dot32(edge(second),relative)<0;
}
function candidate(grid,sector,row,column,type,normalIndex,vertexBase,pointOffset) {
 const normal=grid.normals[normalIndex];
 return {id:cellId(sector.index,row,column),sector:sector.index,row,column,type,columns:sector.columns,
  normalIndex,packedNormal:normal.packed,normalQ8:normal.components.slice(),vertexBase,pointOffset};
}
// One native six-byte region call, preserving row-major order, previous-call
// duplicate checks, normal-filter caching, border append order and the 64 cap.
export function appendRegionCandidates(grid,region,query,center,radiusSquared,state) {
 if(!region.rows||!region.columns)throw Error('Empty collision regions have no established closest-vertex output.');
 const sector=grid.sectors[region.sector],previousCount=state.candidates.length,previous=state.candidates.slice();
 const threshold=add32(Math.imul(region.padding,region.padding),radiusSquared)>>6;
 let closestMetric=0x7fffffff,closest=null,lastAccepted=false;
 const metrics=Array.from({length:region.rows+1},(_,r)=>Array.from({length:region.columns+1},(_,c)=>
  vertexMetric(sector.vertices[(region.row+r)*(sector.columns+1)+region.column+c],center)));
 for(let r=0;r<region.rows;r++) {
  let lastPacked=0xffffffff;
  for(let c=0;c<region.columns;c++) {
   const row=region.row+r,column=region.column+c,top=row*(sector.columns+1)+column;
   const distances=[metrics[r][c],metrics[r][c+1],metrics[r+1][c],metrics[r+1][c+1]];
   let nearest=0;for(let i=1;i<4;i++)if(distances[i]<distances[nearest])nearest=i;
   const metric=distances[nearest];
   if(metric<closestMetric){closestMetric=metric;closest={sector:sector.index,row:row+(nearest>>1),column:column+(nearest&1)};}
   if(metric>threshold)continue;
   const cell=sector.cells[row*sector.columns+column];
   for(const form of cell.forms) {
    const packed=grid.normals[form.normal].packed;
    if(packed!==lastPacked)lastAccepted=acceptsCollisionPlane(query,packed,sector.vertices[form.point??top]);
    lastPacked=packed;
    if(!lastAccepted)continue;
    const id=cellId(sector.index,row,column);
    if(previousCount&&previous.some(entry=>entry.id===id&&entry.type===form.type))continue;
    if(metric>(radiusSquared>>6)&&cornerPruned(sector,top,nearest,center))continue;
    const pointOffset=form.point===null?(nearest&1)+(nearest>>1)*(sector.columns+1):form.point-top;
    state.candidates.push(candidate(grid,sector,row,column,form.type,form.normal,top,pointOffset));
   }
  }
 }
 if(!(sector.flags&1))for(const side of ['left','right']) {
  if(side==='left'?region.column!==sector.left:region.column+region.columns!==sector.right)continue;
  for(let row=region.row;row<region.row+region.rows;row++) {
   const border=sector.borders[row][side];if(border.normal===null)continue;
   const vertexBase=(row+(side==='left'?1:0))*(sector.columns+1)+border.column,point=sector.vertices[vertexBase],difference=subtract32(center[1],point[1]);
   if(difference>0&&(Math.imul(difference,difference)>>6)>threshold)continue;
   if(acceptsCollisionPlane(query,grid.normals[border.normal].packed,point))state.candidates.push(candidate(grid,sector,row,border.column,border.type,border.normal,vertexBase,0));
  }
 }
 if(state.candidates.length>64){state.dropped+=(state.candidates.length-64);state.candidates.length=64;}
 const distanceSquared=Math.imul(closestMetric,64);
 if(distanceSquared<state.closestDistanceSquared){state.closestDistanceSquared=distanceSquared;state.closest=closest;}
 return state;
}
// FUN_004287f0's terrain stage. Per-object collision-cache lifecycle and model
// candidates are separate; callers can supply the previous spatial registration.
export function buildTerrainCandidates(grid,body,{radiusQ8,spatialState,closestDistanceSquared=0x7fffffff}={}) {
 if(!grid.available)throw Error('Resource has no collision spatial data.');
 if(!Number.isInteger(radiusQ8)||radiusQ8<0||radiusQ8>0x7fffffff)throw Error('A nonnegative signed Q8 body radius is required.');
 const result={candidates:[],closest:null,closestDistanceSquared,dropped:0,skipped:null};
 if((body.flags&0x200)||body.sleeping){result.skipped='object_filter';return result;}
 const originQ8=body.position.map(value=>value>>8),deltaQ8=body.linearVelocity.map(value=>value>>8),half=deltaQ8.map(value=>value>>1);
 const midpoint=originQ8.map((value,i)=>add32(value,half[i])),lookup=grid.spatial.lookup(midpoint.map(value=>value<<8));
 const prior=spatialState??grid.spatial.lookup(body.position);
 let node=lookup.node;
 if(!lookup.found){result.skipped='no_spatial_cell';return result;}
 if(lookup.outside){if(prior.outside){result.skipped='outside_stays_outside';return result;}if(!prior.node)throw Error('Previous spatial registration lacks its node.');node=prior.node;}
 result.spatial={lookup,usedNode:node.index};
 const speedSquared=dot32(half,half)>>16;
 const radius=add32(speedSquared?lookupSqrt(speedSquared):0,radiusQ8>>8),radiusSquared=Math.imul(radius,radius);
 const center=midpoint.map(value=>signedShort(value>>8)),query={originQ8,deltaQ8,radiusQ8};
 result.query=query;result.center=center;result.radiusSquared=radiusSquared;
 const zone=grid.zones.find(zone=>zone.root===node.zone);if(!zone)throw Error('Spatial node zone is unavailable.');
 const regions=new Map(grid.regions.map(region=>[region.index,region]));
 for(const index of zone.regions)appendRegionCandidates(grid,regions.get(index),query,center,radiusSquared,result);
 return result;
}
