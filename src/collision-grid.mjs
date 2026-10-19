import {parseScene} from './scene.mjs';
import {parseSpatialIndex} from './spatial-index.mjs';
// Packed signed ten-bit normal components used by FUN_004292a0 / 00424ff0.
export function unpackCollisionNormal(word) {return [(word<<2)>>22,(word<<12)>>22,(word<<22)>>22];}
export function parseCollisionGrid(data) {
 const scene=parseScene(data),spatial=parseSpatialIndex(data);
 if(!spatial.available)return {available:false,scene,spatial,normals:[],sectors:[],regions:[],zones:[]};
 const range=(p,n,label)=>{if(!Number.isSafeInteger(p)||!Number.isSafeInteger(n)||p<0||n<0||p+n>data.length)throw Error(`Collision ${label} exceeds resource bounds.`);};
 const normalBase=data.readUInt32LE(0x34),normalCount=data.readUInt32LE(0x38),zoneBase=data.readUInt32LE(0x28),borderBase=data.readUInt32LE(0x50);
 range(normalBase,normalCount*4,'normal table');
 const normals=Array.from({length:normalCount},(_,i)=>{const packed=data.readUInt32LE(normalBase+i*4);return {packed,components:unpackCollisionNormal(packed)};});
 const normal=(index,label='cell')=>{if(index>=normalCount)throw Error(`Collision ${label} normal index ${index} is unavailable.`);return index;};
 const regions=new Map(),zones=[];
 for(const root of new Set(spatial.nodes.map(node=>node.zone))) {
  range(zoneBase+root*6,6,'zone header');
  const count=(data.readUInt16LE(zoneBase+root*6+2)>>>9)+1,indices=[];
  range(zoneBase+root*6,count*6,'zone group');
  for(let i=0;i<count;i++) {
   const index=root+i,p=zoneBase+index*6,a=data.readUInt16LE(p),b=data.readUInt16LE(p+2),c=data.readUInt16LE(p+4);
   const region={index,offset:p,sector:b&127,row:a&1023,column:a>>>10,rows:c>>>8&15,columns:c>>>12,padding:c&255,control:b};
   const segment=scene.segments[region.sector];
   if(!segment||region.row+region.rows>segment.rows||region.column+region.columns>segment.columns)throw Error(`Collision zone region ${index} exceeds its sector grid.`);
   regions.set(index,region);indices.push(index);
  }
  zones.push({root,regions:indices});
 }
 const coverage=scene.segments.map(()=>new Set()),borderCoverage=scene.segments.map(()=>({left:new Set(),right:new Set()}));
 for(const region of regions.values()) {
  const segment=scene.segments[region.sector],left=data[segment.offset+0x26],right=segment.columns-data[segment.offset+0x27];
  for(let row=region.row;row<region.row+region.rows;row++) {
   for(let col=region.column;col<region.column+region.columns;col++)coverage[region.sector].add(row*segment.columns+col);
   if(region.column===left)borderCoverage[region.sector].left.add(row);
   if(region.column+region.columns===right)borderCoverage[region.sector].right.add(row);
  }
 }
 const sectors=scene.segments.map(segment=>{
  const cells=segment.faces.map(face=>{
   const index=face.index,row=Math.floor(index/segment.columns),column=index%segment.columns;
   const rawNormalIndex=data.readUInt16LE(segment.packetsOffset+index*8+2),covered=coverage[segment.index].has(index),[tl,tr,bl,br]=face.gridIndices;
   if(!covered)return {index,row,column,vertexFlags:face.vertexFlags,covered,rawNormalIndex,forms:[]};
   const plane=normal(rawNormalIndex);
   let forms;
   if(!(face.vertexFlags&2))forms=[{type:0,normal:plane,point:null,indices:[tl,tr,br,bl]}];
   else if(face.vertexFlags&4)forms=[{type:2,normal:plane,point:tl,indices:[tl,tr,bl]},{type:3,normal:normal(plane+1),point:br,indices:[tr,br,bl]}];
   else forms=[{type:5,normal:plane,point:tr,indices:[tl,tr,br]},{type:4,normal:normal(plane+1),point:bl,indices:[tl,br,bl]}];
   return {index,row,column,vertexFlags:face.vertexFlags,covered,rawNormalIndex,forms};
  });
  const flags=data.readUInt32LE(segment.offset+4),left=data[segment.offset+0x26],right=segment.columns-data[segment.offset+0x27],borders=[];
  if(!(flags&1)) {
   if(left>segment.columns||right<0||left>right)throw Error('Collision sector border columns are invalid.');
   const table=borderBase+data.readUInt32LE(segment.offset+0x38);range(table,segment.rows*4,'border planes');
   for(let row=0;row<segment.rows;row++) {
    const sides={};for(const [side,type,column,delta]of [['left',6,left,0],['right',7,right,2]]) {
     const rawNormalIndex=data.readUInt16LE(table+row*4+delta),covered=borderCoverage[segment.index][side].has(row);
     sides[side]={type,column,covered,rawNormalIndex,normal:covered&&rawNormalIndex!==0xffff?normal(rawNormalIndex,side+' border'):null};
    }
    borders.push({row,...sides});
   }
  }
  return {index:segment.index,offset:segment.offset,columns:segment.columns,rows:segment.rows,vertices:segment.vertices,cells,flags,left,right,borders};
 });
 return {available:true,scene,spatial,normalBase,normalCount,normals,sectors,zoneBase,regions:[...regions.values()].sort((a,b)=>a.index-b.index),zones};
}
