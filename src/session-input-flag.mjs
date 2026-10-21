//41a670 updates bit1 of91ce90 from the argument's low bit. Clearing also
//zeros four native input words, except when screen/state91ff80 equals14.
export function setSessionInputFlag(mode,{memory}) {
  const enabled=mode&1;
  if(!enabled&&memory.readInt32LE(0x91ff80)===14)return;
  const flags=memory.readInt32LE(0x91ce90);
  memory.writeInt32LE(flags^((enabled*2^flags)&2),0x91ce90);
  if(!enabled)for(const address of [0x849482,0x8494d6,0x84952a,0x84957e])memory.writeUInt16LE(0,address);
}
