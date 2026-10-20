// FUN_00424ff0's zero-radius path, used by wheel probes. Sphere/edge contacts
// use the separate FUN_00425f10 path and are not admitted by this entry point.
import {add32,subtract32,signedShort} from './fixed-integer.mjs';
const dot32=(a,b)=>a.reduce((sum,value,i)=>add32(sum,Math.imul(value,b[i])),0);
const cross32=(a,b)=>[0,1,2].map(i=>subtract32(Math.imul(a[(i+1)%3],b[(i+2)%3]),Math.imul(a[(i+2)%3],b[(i+1)%3])));
const signedByte=value=>(value<<24)>>24;
function polygon(grid,candidate) {
 const sector=grid.sectors[candidate.sector],base=candidate.vertexBase,stride=candidate.columns+1;
 const vertex=offset=>sector.vertices[base+offset].slice(0,3);
 switch(candidate.type) {
  case 2:return [vertex(stride),vertex(0),vertex(1)];
  case 3:return [vertex(1),vertex(stride+1),vertex(stride)];
  case 4:return [vertex(stride+1),vertex(stride),vertex(0)];
  case 5:return [vertex(0),vertex(1),vertex(stride+1)];
  case 6:{const lower=vertex(0),upper=vertex(-stride);return [raised(upper),upper,lower,raised(lower)];}
  case 7:{const first=vertex(0),next=vertex(stride);return [first,raised(first),raised(next),next];}
  default:return [vertex(0),vertex(1),vertex(stride+1),vertex(stride)];
 }
}
// Native side-wall construction subtracts 0x01000000 from packed x/y, so
// subtracting 256 from the signed y short wraps without modifying x.
const raised=vertex=>[vertex[0],signedShort(vertex[1]-256),vertex[2]];
function outsideEdges(vertices,pointQ8,normal) {
 const point=pointQ8.map(value=>value>>8),relative=vertices.map(vertex=>vertex.map((value,i)=>signedShort(subtract32(value,point[i]))));
 let first=-1;
 for(let edge=0;edge<relative.length;edge++)if(dot32(cross32(relative[(edge+1)%relative.length],relative[edge]),normal)<0) {
  if(first!==-1)return first|(edge<<4);first=edge;
 }
 return first;
}
function edgeCode(raw,type,triangular) {
 const offset=type===2?3:type===3?1:type===4?2:0,second=raw>>4;
 if(!second)return raw===2&&triangular?(offset&1)+4:(raw+offset)&3;
 if(!triangular)return raw;
 return second===2?0x7f:(((second+offset)&3)<<4)|((raw+offset)&3);
}
function adjacentId(candidate,edge) {
 let column=signedByte(candidate.id>>>8),row=signedShort(candidate.id>>>16);
 switch(edge) {
  case 1:case 0x20:column++;break;
  case 4:case 5:case 0x7f:break;
  case 0x10:row--;column++;break;
  case 0x21:column++;row++;break;
  case 2:case 0x31:row++;break;
  case 0x30:row--;column--;break;
  case 3:column--;break;
  case 0x32:column--;row++;break;
  default:row--;break;
 }
 column=Math.max(0,Math.min(candidate.columns,column));
 if(candidate.type>5)column=signedByte(candidate.id>>>8);
 return ((candidate.id&255)|((column&255)<<8)|((row&65535)<<16))>>>0;
}
function sharedEdge(current,other) {
 if(current>15)return other<=3&&(((other-2)&3)===(current>>4)||((other-2)&3)===(current&15));
 if(current>3)return Math.abs(other-current)===1;
 const opposite=(current-2)&3;return opposite===(other>>4)||opposite===(other&15);
}
// Shared native polygon bookkeeping; the radius-bearing path keeps its own
// plane-selection and edge pass while using the same authored topology.
export {polygon as terrainPolygon,outsideEdges as terrainOutsideEdges,edgeCode as terrainEdgeCode};
export function queryTerrainRay(grid,candidates,query,{parameter=0x1010000,bodyFlags=3}={}) {
 if((query.radiusQ8??query.radius??0)!==0)throw Error('Terrain ray query requires zero radius; sphere edge contacts are not reconstructed.');
 if(candidates.length>64)throw Error('Native terrain query admits at most 64 candidates.');
 const visited=candidates.map(candidate=>!!(parameter>>24)&&candidate.type>5),edges=candidates.map(()=>-1);
 let remaining=visited.filter(value=>!value).length;
 if(!remaining)return {flags:0,fractionQ16:parameter|0};
 const initialLimit=parameter&0x7fffff,result={flags:0,fractionQ16:initialLimit};
 let sequence=0,next=-1,packed=-1,planeType=0,lastBase=null,lastId=0,normal=[0,0,0],distance=0x7fffffff;
 let classification=0,fraction=initialLimit,point=[0,0,0];
 while(remaining) {
  let index=next;next=-1;
  if(index<0){while(visited[sequence])sequence++;index=sequence++;}
  const candidate=candidates[index],sector=grid.sectors[candidate.sector],base=sector.vertices[candidate.vertexBase];
  visited[index]=true;remaining--;
  const neighboring=Math.abs(signedByte(lastId>>>8)-signedByte(candidate.id>>>8))<=1&&Math.abs(signedShort(lastId>>>16)-signedShort(candidate.id>>>16))<=1;
  const samePlane=packed===(candidate.packedNormal|0)&&planeType<6&&(neighboring||dot32(base.slice(0,3).map((value,i)=>subtract32(value,lastBase[i])),normal)===0);
  if(!samePlane) {
   packed=candidate.packedNormal|0;normal=candidate.normalQ8;planeType=candidate.type;lastBase=base;classification=0;
   const anchor=sector.vertices[candidate.vertexBase+((candidate.type===2||candidate.type===6||candidate.type===7)?0:candidate.pointOffset)];
   const relative=query.originQ8.map((value,i)=>subtract32(value,anchor[i]<<8));
   distance=dot32(relative,normal)>>8;
   let endpoint=1;
   if(distance>0)endpoint=dot32(relative.map((value,i)=>add32(value,query.deltaQ8[i])),normal)>>8;
   if(distance<=0||endpoint>=0) {
    if((distance<=0||endpoint<256)&&distance<256) {
     if(distance<=0&&distance!==endpoint){classification=2;fraction=0;}
     else if((bodyFlags&0x1ff)!==4)classification=0x80000;
     if(classification)point=normal.map(value=>(-Math.imul(distance,value))>>8);
    }
   }else {
    const denominator=subtract32(distance,endpoint);
    fraction=Math.trunc((distance<<16)/denominator)|0;
    if(fraction===0)classification=2;
    else if(fraction<result.fractionQ16)classification=1;
    if(classification)point=query.deltaQ8.map(value=>Math.imul(fraction>>8,value)>>8);
   }
   if(classification)point=point.map((value,i)=>add32(value,query.originQ8[i]));
  }
  let eligible=classification!==0;
  if(classification===0x80000&&initialLimit>result.fractionQ16)eligible=false;
  if(classification===2&&result.fractionQ16===0&&distance>result.distanceQ8)eligible=false;
  if(eligible) {
   const vertices=polygon(grid,candidate),outside=outsideEdges(vertices,point,normal);
   let accept=outside===-1||(candidate.type===6?outside===3:candidate.type>5&&outside===1);
   if(!accept) {
    const code=edgeCode(outside,candidate.type,vertices.length===3);edges[index]=code;
    if(!remaining)break;
    const id=adjacentId(candidate,code);
    for(let other=0;other<candidates.length;other++)if(candidates[other].id===id) {
     if(!visited[other]){next=other;break;}
     if(edges[other]>=0&&sharedEdge(code,edges[other])){accept=true;break;}
    }
   }
   if(accept)return {flags:classification,fractionQ16:fraction,pointQ8:point.slice(),normalQ16:normal.map(value=>value<<8),distanceQ8:distance,cellRef:candidate.id,candidateIndex:index};
  }
  lastId=candidate.id;
 }
 return result;
}
