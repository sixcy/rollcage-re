import constants from './world-physics-constants.json' with {type: 'json'};
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
export function initializeWorldPhysicsConstants(memory) {
  Buffer.from(constants.bytesHex, 'hex').copy(memory, constants.address);
}
const clearedAllocation = (size, memory, allocate) => {
  const address = allocate(size >>> 0) >>> 0;
  if (address) memory.fill(0, address, address + (size >>> 0));
  return address;
};

//474160. This allocates the backing block; the128-byte aligned arena may
//start later. The native zero-allocation path publishes zero in both globals.
export function initializeRawBodyArena({memory, allocate}) {
  const size = (memory.readInt32LE(0x709808) + 140000) << 5;
  const block = clearedAllocation(size, memory, allocate);
  put(memory, 0x6e6b40, block); put(memory, 0x902eec, (block + 127) & 0xffffff80);
}

//440410. Retains the live four-lane executable constant read at5dcc60;
//the final four scalar entries deliberately do not use that constant.
export function initializeRawCollisionPool({memory, allocate}) {
  put(memory, 0x902ba8, clearedAllocation(0x28a0, memory, allocate));
  put(memory, 0x902bac, clearedAllocation(0x194, memory, allocate));
  const free = clearedAllocation(0x190, memory, allocate);
  const lanes = Array.from({length: 4}, (_, index) => memory.readInt32LE(0x5dcc60 + index * 4));
  put(memory, 0x902bb0, free); put(memory, 0x902ba4, 100); put(memory, 0x902ba0, 0);
  for (let base = 0; base < 96; base += 8) for (let half = 0; half < 2; half++) for (let lane = 0; lane < 4; lane++) put(memory, free + (base + half * 4 + lane) * 4, (base + half * 4 + lanes[lane]) << 20);
  for (let index = 96; index < 100; index++) put(memory, free + index * 4, index << 20);
  put(memory, 0x902bb4, 99);
}

//428100. Includes actual440410 before the shape/free/active/reverse arrays,
//physical list and65 retained group headers. malloc/memset are ordinary services.
export function initializeRawShapePools({memory, allocate}) {
  initializeRawCollisionPool({memory, allocate});
  put(memory, 0x91e79c, clearedAllocation(0x4800, memory, allocate));
  const indices = clearedAllocation(0x300, memory, allocate), active = (indices + 0x100) >>> 0, reverse = (indices + 0x200) >>> 0;
  put(memory, 0x91e780, indices); put(memory, 0x91e78c, active); put(memory, 0x91e790, reverse); put(memory, 0x91e798, 0);
  for (let index = 0; index < 256; index++) {memory[indices + index] = index; memory[active + index] = 0; memory[reverse + index] = 0;}
  put(memory, 0x91e784, -1); put(memory, 0x91e794, 255);
  put(memory, 0x91e788, clearedAllocation(0x8000, memory, allocate));
  put(memory, 0x902bc0, clearedAllocation(0x180, memory, allocate)); put(memory, 0x902bc4, 0); put(memory, 0x902bc8, 0);
  const groups = clearedAllocation(0x2108, memory, allocate);
  for (let index = 0; index < 65; index++) {const row = 0x902be0 + index * 12; put(memory, row, groups + index * 132); put(memory, row + 4, 0); put(memory, row + 8, 0);}
  put(memory, 0x902bcc, 0);
}
