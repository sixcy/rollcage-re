//48da10 compares the current route and its links against the spatial fallback.
//Noncyclic linked groups are bounded with the ORIGINAL group's count.
export function selectFinishRoute(record,{memory}) {
 const original=memory.readUInt32LE(record+0x54);if(!original)return;
 const body=memory.readUInt32LE(record),baseIndex=memory.readInt32LE(record+0x58),coordinates=[0x36,0x3a,0x3e].map(offset=>memory.readInt16LE(body+offset));
 let bestDistance=0x7fffffff,bestGroup=0,bestIndex=0;
 const distance=(group,index)=>{const point=((index<<4)+memory.readUInt32LE(group+8))>>>0;return coordinates.reduce((sum,value,axis)=>(sum+Math.imul(memory.readInt16LE(point+axis*2)-value,memory.readInt16LE(point+axis*2)-value))|0,0);};
 for(const delta of [0,1,-1]){
  let index=(baseIndex+delta)|0;const count=memory.readUInt16LE(original);
  if(memory[original+4]){if(index<0)index=(index+count)|0;if(index>=count)index=(index-count)|0;}
  else if(index<0||index>=count)continue;
  const point=((index<<4)+memory.readUInt32LE(original+8))>>>0,links=memory.readUInt32LE(point+12),pack=memory.readUInt32LE(0x90b98c),groups=memory.readUInt32LE(pack+0x60);
  const first=links&31,second=(links>>>14)&31;
  for(const [group,rawIndex]of [[original,index],[first?groups+first*12:0,(links>>>5)&511],[second?groups+second*12:0,(links>>>19)&511]]){
   if(!group)continue;let selected=rawIndex|0;
   if(memory[group+4]){const ownCount=memory.readUInt16LE(group);if(selected<0)selected=(selected+ownCount)|0;if(selected>=ownCount)selected=(selected-ownCount)|0;}
   else if(selected<0||selected>=count)continue;
   const value=distance(group,selected);if(value<bestDistance){bestDistance=value;bestGroup=group;bestIndex=selected;}
  }
 }
 const pack=memory.readUInt32LE(0x90b98c),bucket=memory.readUInt32LE(body+0xc)&0xfffffffe,key=memory.readUInt32LE(bucket)>>>22,map=memory.readUInt32LE(pack+0x7c),fallback=memory.readUInt32LE(map+key*4),group=memory.readUInt32LE(pack+0x60)+(fallback>>>16)*12,index=fallback&65535;
 if(bestDistance<distance(group,index)){memory.writeUInt32LE(bestGroup,record+0x54);memory.writeUInt32LE(bestIndex>>>0,record+0x58);}
 else{memory.writeUInt32LE(group,record+0x54);memory.writeUInt32LE(index,record+0x58);}
}
//491be0 uses three original byte lookup tables, read from caller-owned mapped
//memory at570680,5706c0,5706d0. No replacement thresholds are inferred.
export function finishVehicleBookkeeping(record,{memory,handlers={}}) {
 const initialBody=memory.readUInt32LE(record);
 memory[initialBody+0x718]=8;memory[initialBody+0x720]=0;
 for(let index=32;index>0;index--)if(memory[initialBody+0x708]>=memory[0x5706d0+index]){memory[initialBody+0x720]=index;break;}
 memory[initialBody+0x721]=0;
 for(let index=31;index>0;index--)if(memory[initialBody+0x709]>=memory[0x570680+index]){memory[initialBody+0x721]=index;break;}
 memory[initialBody+0x722]=0;
 for(let index=15;index>0;index--)if(memory[initialBody+0x70a]>=memory[0x5706c0+index]){memory[initialBody+0x722]=index;break;}
 (handlers.finish48da10??(address=>selectFinishRoute(address,{memory})))(record);
 const progression=memory.readUInt32LE(record+0x54),body=memory.readUInt32LE(record);
 memory.writeUInt16LE(0,0x6e6570);memory.writeUInt16LE(0,0x6e658c);
 memory.writeUInt16LE(memory[progression+5],body+0x6c0);memory.writeUInt16LE(memory.readUInt16LE(record+0x58),body+0x6c2);
 for(let offset=0x6c4;offset<=0x6d4;offset+=4)memory.writeInt32LE(0,initialBody+offset);
 memory[initialBody+0x6d8]=0;
 const index=memory.readUInt16LE(memory.readUInt32LE(record)+0x65e),value=(memory.readUInt32LE(0x90a548)+1+index)>>>0;
 memory[initialBody+0x6d9]=value%6;return Math.floor(value/6);
}
