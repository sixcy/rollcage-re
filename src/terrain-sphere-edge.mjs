// 0x425f10: an exterior terrain edge, including the smooth-neighbor shortcut.
import {unpackCollisionNormal} from './collision-grid.mjs';
import {normalizeUnreducedCollisionVector} from './sphere-collision.mjs';
import {queryEdgeSphereContact} from './static-sphere-primitives.mjs';
const dot32=(a,b)=>a.reduce((sum,value,axis)=>(sum+Math.imul(value,b[axis]))|0,0);
export function resolveTerrainSphereEdge(grid,candidate,neighbor,plane,neighborPlane,record,result,{roundingMode,queryEdge=queryEdgeSphereContact}={}) {
 const type=candidate.type&15,normal=unpackCollisionNormal(candidate.packedNormal);
 if(type>=6&&!neighbor)throw Error('Native border-edge path requires a neighbor before its null test.');
 if(neighbor){const otherNormal=unpackCollisionNormal(neighbor.packedNormal);
  if(dot32(normal,otherNormal)>63000||(type>=6&&(neighbor.type&15)>=6)){
   if(!plane||!neighborPlane)throw Error('Smooth terrain edge requires both retained plane-cache entries.');
   result.pointQ8=plane.pointQ8.map((value,axis)=>((value+neighborPlane.pointQ8[axis])|0)>>1);
   result.normalQ16=normal.map((value,axis)=>(value+otherNormal[axis])<<7);result.distanceQ8=plane.distanceQ8;result.fractionQ16=plane.fractionQ16;
   result.cellRef=(plane.distanceQ8<neighborPlane.distanceQ8?candidate.id:neighbor.id)>>>0;result.flags=plane.fractionQ16===0?2:1;return result;
  }
 }
 let base=candidate.vertexBase;const stride=candidate.columns+1;
 if(type===6&&(neighbor.type&15)<6)base-=stride;
 let first,second,gated=false;
 const vertices=grid.sectors[candidate.sector].vertices;
 switch(candidate.edgeCode<<24>>24){
  case 0:first=base;second=base+1;gated=!!(vertices[second][3]&0x10);break;
  case 1:first=base+1;second=base+stride+1;gated=!!(vertices[second][3]&0x20);break;
  case 2:first=base+stride;second=first+1;gated=!!(vertices[first][3]&0x10);break;
  case 3:first=base;second=base+stride;gated=!!(vertices[first][3]&0x20);break;
  case 4:first=base;second=base+stride+1;break;
  case 5:first=base+1;second=base+stride;break;
  default:return result;
 }
 if(type===0&&gated)return result;
 const a=vertices[first].slice(0,3),b=vertices[second].slice(0,3),direction=normalizeUnreducedCollisionVector(b.map((value,axis)=>(value-a[axis])|0),roundingMode).vector.map(value=>value>>4),output={point:[0,0,0],normal:[0,0,0],scalar:0,flags:0};
 const time=queryEdge(record,a,b,direction,output,result.fractionQ16,{roundingMode});
 if(output.flags&255){result.flags=output.flags;result.normalQ16=output.normal.map(value=>value<<8);result.pointQ8=output.point.slice();result.fractionQ16=time;result.cellRef=candidate.id>>>0;result.distanceQ8=output.scalar;}
 return result;
}
