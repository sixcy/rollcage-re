import tables from './vehicle-contact-profile-tables.json' with {type:'json'};
const get=(memory,p)=>memory.readInt32LE(p),put=(memory,p,value)=>memory.writeInt32LE(value|0,p);

//Static data restoration, separate from the game initializer. Seven packed
//profile rows and the two overlapping-neighbor eight-byte recovery tables.
export function initializeVehicleContactProfileTables(memory) {
 Buffer.from(tables.bytesHex,'hex').copy(memory,tables.address);return memory;
}

//41ebb0. Keep each original three-bit lane write and reload the selected table
//word before the next one. Body/table/global storage can alias; this must not
//become a bulk copy from a snapshot of the profile row.
export function initializeVehicleContactProfile(body,{memory}) {
 const session=memory.readUInt32LE(0x5ecb1c),difficulty=get(memory,0x5ea4d8),profile=memory[session+memory.readUInt16LE(body+0x65e)+0x1c],row=0x5eadd4+profile*8;
 put(memory,0x91f6a0,difficulty===0?0x5eae14:0x5eae0c);
 for(const[offset,lanes,source]of[[0x6f4,10,row],[0x6f8,8,row+4]]){
  let value=get(memory,body+offset);
  for(let lane=0;lane<lanes;lane++){
   const mask=7<<(lane*3);value=(value^((get(memory,source)^value)&mask))|0;put(memory,body+offset,value);
  }
 }
 const setLane=(offset,shift,value)=>{const current=get(memory,body+offset),mask=7<<shift;put(memory,body+offset,((value<<shift)^current)&mask^current);};
 const reduceLane=(offset,shift,amount)=>setLane(offset,shift,Math.max(0,((get(memory,body+offset)>>>shift)&7)-amount));
 if(difficulty===0){
  for(const[shift,amount]of[[3,3],[6,2],[9,2],[18,2],[21,1],[24,3],[27,2]])reduceLane(0x6f4,shift,amount);
  for(const[shift,amount]of[[0,3],[3,2],[6,2],[12,3]])reduceLane(0x6f8,shift,amount);
  setLane(0x6f8,18,Math.min(6,((get(memory,body+0x6f8)>>>18)&7)+3));
  //The mode is loaded here, after earlier lane stores, rather than captured
  //at entry. Its DWORD can itself be the policy word being modified.
  const mode=memory.readUInt32LE(0x920f84),bonus=mode===0?3:mode===1?1:0;
  setLane(0x6f8,21,Math.min(6,((get(memory,body+0x6f8)>>>21)&7)+bonus));
 }else if(difficulty===2){
  const lane=(get(memory,body+0x6f8)>>>9)&7;if(lane<7)setLane(0x6f8,9,lane+(lane<3?2:1));
  setLane(0x6f4,3,((get(memory,body+0x6f4)>>>3)&7)<=3?6:7);
 }
}
