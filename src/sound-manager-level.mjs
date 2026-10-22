//4a90e0, established SoundManager virtual5c. The float argument is copied as
//raw DWORD bits, preserving negative zero, NaN payloads and arbitrary values.
export function setSoundManagerMasterLevel(manager, bits, runtime) {
  const {memory, scratchBase} = runtime;
  memory.writeInt32LE(bits | 0, scratchBase + 4);
  memory.writeInt32LE(bits | 0, manager + 0x850);
  return bits | 0;
}
