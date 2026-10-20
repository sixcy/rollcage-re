import {boxCollision} from './model-query-fixtures.mjs';
import {normalizeCollisionVector} from '../../src/sphere-collision.mjs';
// Synthetic convex polyhedra with explicit shared-edge IDs and directions.
export function sphereBoxCollision(options={}) {
 const collision=boxCollision(options),edges=new Map();
 for(const record of collision.faceRecords) {
  const face=collision.faces[record.faceIndex],order=face.triangle?[face.indices[0],face.indices[2],face.indices[1]]:[face.indices[0],face.indices[2],face.indices[3],face.indices[1]];
  record.edgeIndices=[];
  for(let i=0;i<order.length;i++) {
   const indices=[order[i],order[(i+1)%order.length]].sort((a,b)=>a-b),key=indices.join(':');
   if(!edges.has(key)) {
    const delta=collision.vertices[indices[1]-1].slice(0,3).map((v,i)=>v-collision.vertices[indices[0]-1][i]),normalQ8=normalizeCollisionVector(delta,'nearest-even').vector.map(v=>v>>4),packedNormal=(((normalQ8[0]&1023)<<20)|((normalQ8[1]&1023)<<10)|(normalQ8[2]&1023))>>>0,raw=Buffer.alloc(8);
    raw.writeUInt32LE(packedNormal);raw[4]=indices[0];raw[5]=indices[1];edges.set(key,{index:edges.size,indices,normalQ8,packedNormal,raw});
   }
   const edge=edges.get(key);record.raw[i]=edge.index;record.edgeIndices.push(edge.index);
  }
 }
 collision.edges=[...edges.values()];return collision;
}
