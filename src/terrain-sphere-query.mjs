// Full nonzero-radius path of0x424ff0, including the exterior-edge pass425f10.
import {unpackCollisionNormal} from './collision-grid.mjs';
import {terrainPolygon,terrainOutsideEdges,terrainEdgeCode} from './terrain-query.mjs';
import {resolveTerrainSphereEdge} from './terrain-sphere-edge.mjs';
import {initializeTerrainQueryState} from './terrain-query-state.mjs';
const signedByte=value=>value<<24>>24,signedShort=value=>value<<16>>16;
const dot32=(a,b)=>a.reduce((sum,value,axis)=>(sum+Math.imul(value,b[axis]))|0,0);
export function queryTerrainSphere(grid,candidates,query,{parameter=65536,bodyFlags=3,roundingMode,output={},scratch={},frameCounter=0,nativeState,maxCandidates=64}={}) {
 const radius=query.radiusQ8??query.radius??0;if(!radius)throw Error('Terrain sphere query requires nonzero radius; use queryTerrainRay for wheel rays.');
 if(!Number.isInteger(maxCandidates)||maxCandidates<0||maxCandidates>65535||candidates.length>maxCandidates)throw Error('Terrain query exceeds the declared native candidate bound.');
 const state=initializeTerrainQueryState(candidates,parameter,scratch,nativeState),{visited,edges,planes}=state;let remaining=visited.filter(value=>!value).length;
 output.flags=0;output.fractionQ16=parameter|0;if(!remaining){nativeState?.finish(0);return output;}
 query=nativeState?.captureQuery()??query;
 const limit=parameter&0x7fffff;output.fractionQ16=limit;
 let sequence=0,packed=-1,planeType=0,lastBase=null,lastId=0,normal=[0,0,0],distance=0x7fffffff,classification=0,fraction=limit,point=[0,0,0],outsideCount=0;
 for(;remaining;){
  while(state.isVisited(sequence))sequence++;const index=sequence++,candidate=candidates[index],type=candidate.type&15,sector=grid.sectors[candidate.sector],base=sector.vertices[candidate.vertexBase];state.markVisited(index);remaining--;
  const neighboring=Math.abs(signedByte(lastId>>>8)-signedByte(candidate.id>>>8))<=1&&Math.abs(signedShort(lastId>>>16)-signedShort(candidate.id>>>16))<=1;
  const samePlane=packed===(candidate.packedNormal|0)&&planeType<6&&(neighboring||dot32(base.slice(0,3).map((value,axis)=>(value-lastBase[axis])|0),normal)===0);
  if(!samePlane){
   packed=candidate.packedNormal|0;normal=unpackCollisionNormal(packed);planeType=type;lastBase=base;classification=0;
   const anchor=sector.vertices[candidate.vertexBase+((type===2||type===6||type===7)?0:candidate.pointOffset)],relative=query.originQ8.map((value,axis)=>(value-(anchor[axis]<<8))|0),centerDistance=dot32(relative,normal)>>8;
   distance=(centerDistance-radius)|0;let endpoint=1;
   if(distance>0)endpoint=((dot32(relative.map((value,axis)=>(value+query.deltaQ8[axis])|0),normal)>>8)-radius)|0;
   if(distance<=0||endpoint>=0){
    if((distance<=0||endpoint<256)&&distance<256){
     if(distance<=0&&distance!==endpoint){classification=2;fraction=0;}else if(((nativeState?nativeState.bodyFlags():bodyFlags)&0x1ff)!==4)classification=0x80000;
     if(classification)point=normal.map(value=>(-Math.imul(centerDistance,value))>>8);
    }
   }else{
    fraction=Math.trunc((distance<<16)/((distance-endpoint)|0))|0;
    if(fraction===0)classification=2;else if(fraction<output.fractionQ16)classification=1;
    if(classification)point=query.deltaQ8.map((value,axis)=>((Math.imul(fraction>>8,value)-Math.imul(radius,normal[axis]))|0)>>8);
   }
   if(classification)point=point.map((value,axis)=>(value+query.originQ8[axis])|0);
  }
  const eligible=classification!==0&&(!(classification&0x80000)||limit<=output.fractionQ16)&&(classification!==2||output.fractionQ16!==0||distance<=output.distanceQ8);
  if(eligible){
   const plane={pointQ8:point.slice(),normalQ8:normal.slice(),distanceQ8:distance,fractionQ16:fraction};if(nativeState)nativeState.writePlane(index,plane);else planes[index]=plane;
   const vertices=terrainPolygon(grid,candidate),outside=terrainOutsideEdges(vertices,point,normal,nativeState),accept=outside===-1||(type===6?outside===3:type>5&&outside===1);
   if(accept){
    const result={pointQ8:point.slice(),normalQ16:normal.map(value=>value<<8),distanceQ8:distance,fractionQ16:fraction,flags:classification,cellRef:candidate.id>>>0};if(nativeState){nativeState.writeContact(result);output.fractionQ16=fraction;output.flags=classification;}else Object.assign(output,result);
    if(type>5&&((nativeState?nativeState.bodyFlags():bodyFlags)&0x1ff)!==4){if(nativeState)nativeState.writeBorder(point,base);else scratch.borderContact={pointQ8:point.slice(),normalQ16:output.normalQ16.slice(),anchorS16:base.slice(0,3).map(signedShort),frameCounter};}
   }else{outsideCount++;state.setEdge(index,terrainEdgeCode(outside,type,vertices.length===3));}
  }
  lastId=candidate.id;
 }
 for(let index=0;index<candidates.length&&outsideCount;index++){
  const code=state.edgeAt(index);if(code<0)continue;outsideCount--;if(code>=6)continue;
  const candidate=candidates[index],type=candidate.type&15;
  let column=signedByte(candidate.id>>>8),row=signedShort(candidate.id>>>16),opposite;
  switch(code){
   case 1:opposite=3;if(type<6)column++;break;
   case 2:opposite=0;row++;break;
   case 3:opposite=1;if(type<6)column--;break;
   case 4:opposite=5;break;
   case 5:opposite=4;break;
   default:opposite=2;row--;break;
  }
  let neighborIndex=-1,run=false;
  if(type<6&&(row<0||grid.sectors[candidate.sector].rows<=row))run=true;
  else if(type<6||(code!==0&&code!==2)){
   const id=((candidate.id&255)|((column&255)<<8)|((row&65535)<<16))>>>0;
   for(let other=0;other<candidates.length;other++)if(other!==index&&candidates[other].id===id){const edge=state.edgeAt(other);if((edge>15&&(edge>>4)===opposite)||(edge&15)===opposite){neighborIndex=other;run=true;break;}}
  }
  if(run){resolveTerrainSphereEdge(grid,{...candidate,edgeCode:code},neighborIndex<0?null:{...candidates[neighborIndex],edgeCode:state.edgeAt(neighborIndex)},planes[index],planes[neighborIndex],query,output,{roundingMode,nativeState});}
 }
 nativeState?.finish(output.flags);return output;
}
