// Redux FUN_004286e0 / FUN_004746f0. Pointer relocation is reproduced as
// resource-relative reads. Runtime object/effect links are retained but ignored.
export function parseSpatialIndex(data) {
 if(!Buffer.isBuffer(data)||data.length<0x120||data.toString('ascii',0,4)!=='GFXM')throw Error('Invalid GFXM spatial header.');
 const range=(p,n,label)=>{if(!Number.isSafeInteger(p)||!Number.isSafeInteger(n)||p<0||n<0||p+n>data.length)throw Error(`Spatial ${label} exceeds resource bounds.`);};
 const nodeCount=data.readUInt32LE(0xc),nodeBase=data.readUInt32LE(0x68),rowTable=data.readUInt32LE(0x24),mapBase=data.readUInt32LE(0x6c);
 if(data.readUInt32LE(0x10)===0)return {available:false,nodeCount,nodeBase,rowTable,mapBase,nodes:[],rows:[]};
 range(nodeBase,nodeCount*12,'node array');range(rowTable,256*16,'row table');
 const nodes=Array.from({length:nodeCount},(_,index)=>{
  const offset=nodeBase+index*12,boundsWord=data.readUInt32LE(offset),referenceWord=data.readUInt32LE(offset+4);
  return {index,offset,boundsWord,referenceWord,linksWord:data.readUInt32LE(offset+8),zone:referenceWord>>>16&0x3fff,
   continues:!!(referenceWord&0x80000000),heightThreshold:boundsWord>>>13&63};
 });
 function nodeAtMap(pointer) {
  range(pointer,2,'cell map');const displacement=data.readUInt16LE(pointer);
  if(displacement%12||displacement/12>=nodeCount)throw Error(`Spatial cell map references invalid node displacement ${displacement}.`);
  return nodes[displacement/12];
 }
 const rows=Array.from({length:256},(_,index)=>{
  const offset=rowTable+index*16,firstIndex=data.readUInt32LE(offset+12),ranges=[];
  let cells=0,sentinel=false;
  for(let i=0;i<6;i++) {
   const packed=data.readUInt16LE(offset+i*2);if(packed===0xff){sentinel=true;break;}
   const start=packed&255,end=packed>>>8;
   if(end<start||(ranges.length&&start<=ranges.at(-1).end))throw Error(`Spatial row ${index} has invalid column spans.`);
   ranges.push({start,end,cellStart:cells});cells+=end-start+1;
  }
  const mapPointer=mapBase+(firstIndex-1)*2;
  if(ranges.length){range(mapPointer,cells*2,'row cell map');for(let i=0;i<cells;i++)nodeAtMap(mapPointer+i*2);}
  return {index,offset,firstIndex,ranges,cells,sentinel,mapPointer};
 });
 for(let i=0;i<nodes.length;i++)if(nodes[i].continues&&i+1>=nodes.length)throw Error('Spatial height chain exceeds node array.');
 function direct(x,z) {
  const row=rows[z];if(!row.ranges.length)return null;
  for(const span of row.ranges){if(x<span.start)return null;if(x<=span.end)return {pointer:row.mapPointer+(span.cellStart+x-span.start)*2,row:z,column:x};}
  // With all six spans occupied, the native loop reads the following map word.
  return row.sentinel?null:{pointer:row.mapPointer+row.cells*2,row:z,column:x};
 }
 function fallback(x,z) {
  let bestDistance=255,best=null;
  for(let attempt=1;attempt<=510;attempt++) {
   const delta=attempt>>1,rowIndex=attempt&1?z+delta:z-delta;
   if(rowIndex>=0&&rowIndex<256) {
    const row=rows[rowIndex];
    for(const span of row.ranges) {
     if(x>=span.start&&x<=span.end)return {pointer:row.mapPointer+(span.cellStart+x-span.start)*2,row:rowIndex,column:x};
     for(const column of [span.start,span.end]) {
      const distance=Math.abs(column-x);
      if(distance<bestDistance){bestDistance=distance;best={pointer:row.mapPointer+(span.cellStart+column-span.start)*2,row:rowIndex,column};if(distance===1)return best;}
     }
    }
   }
   if(bestDistance*2<=attempt+1)return best;
  }
  return best;
 }
 function lookup(positionQ16) {
  if(!Array.isArray(positionQ16)||positionQ16.length!==3||positionQ16.some(v=>!Number.isInteger(v)||v< -2147483648||v>2147483647))throw Error('Spatial position requires three signed Q16 integers.');
  const [x,y,z]=[(positionQ16[0]>>24)+128,((positionQ16[1]>>24)+32)&65535,(positionQ16[2]>>24)+128];
  let selected=direct(x,z),outside=false;
  if(!selected){outside=true;selected=fallback(x,z);}
  if(!selected)return {found:false,outside,bins:[x,y,z],reason:'no_populated_cell'};
  let node=nodeAtMap(selected.pointer),layers=0;
  while(node.continues&&y<=nodes[node.index+1].heightThreshold){node=nodes[node.index+1];layers++;}
  return {found:true,outside,bins:[x,y,z],selected:{row:selected.row,column:selected.column,mapPointer:selected.pointer},node,layers};
 }
 return {available:true,nodeCount,nodeBase,rowTable,mapBase,nodes,rows,lookup};
}
