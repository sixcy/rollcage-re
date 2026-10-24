// Static placement lists used by FUN_00429360. The word at start also serves
// 48da10's packed route fallback; model references begin at start+1. Runtime
// loading relocates small serialized model indices, so retain raw words here.
export function parseStaticModelLinks(data,spatial,placements) {
 if(!spatial.available)return {available:false,nodes:[],entries:[]};
 if(data.length<0xb0)throw Error('Static model-link header is truncated.');
 const table=data.readUInt32LE(0xac),count=data.readUInt16LE(0x96);
 if(table+count*4>data.length)throw Error('Static model-link table exceeds resource bounds.');
 const entries=Array.from({length:count},(_,index)=>data.readUInt32LE(table+index*4));
 const nodes=spatial.nodes.map(node=>{
  const length=(node.boundsWord>>>19)&7,start=node.boundsWord>>>22,indices=[];
  if(length&&start+length>=count)throw Error(`Static model-link node ${node.index} exceeds its table.`);
  for(let i=1;i<=length;i++) {
   const index=entries[start+i],placement=placements.records[index];
   if(index>=65536||!placement||placement.type!==0)throw Error(`Static model-link node ${node.index} has an unresolved ordinary placement.`);
   indices.push(index);
  }
  return {node:node.index,start,placementIndices:indices};
 });
 return {available:true,table,count,entries,nodes};
}
