//41bef0: live session552 selection controls the4180a0 iteration bound. Its
//semantic role is distinct from the participant count at session54d.
export function getRaceStageCount({memory}) {
  const selection = memory.readUInt8(memory.readUInt32LE(0x5ecb1c) + 0x552);
  return selection === 1 || selection === 2 ? 2 : selection === 3 ? 3 : selection === 4 ? 4 : 1;
}
