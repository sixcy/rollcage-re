import {createGameImageServices} from './game-image-fixtures.mjs';

//Explicit CRT/Win32/GDI+/renderer fixture services. The allocator reuses freed
//blocks deterministically so large tile/mipmap chains remain below static data.
export function createRaceTextureServices(memory, {timeWidth = 4, timeHeight = 4, iceWidth = 5, iceHeight = 3, failTime = false, failIce = false, failProcedural = false, failFirstUpload = false, failTile = false, negativeStride = false, allocationBase = 0x200000, allocationLimit = 0x580000} = {}) {
  const base = createGameImageServices(memory, {openFailure: true, allocationBase: 0x1c0000, allocationLimit: 0x1f0000}), calls = [], rendererCalls = [], owned = new Map(), free = [], allocations = []; let next = allocationBase, nextHandle = 100, imageKind = 'time', nextTexture = 300, uploadCount = 0;
  const put = (p, v) => memory.writeInt32LE(v | 0, p), wide = p => {let end = p; while (memory.readUInt16LE(end)) end += 2; return memory.toString('utf16le', p, end);};
  const libraryCall = (name, args) => {
    calls.push([name, ...args]);
    if (['allocate', 'operatorNew', 'operatorNewArray'].includes(name)) {
      const length = (args[0] + 31) & ~15; let index = free.findIndex(block => block.length >= length), block;
      if (index < 0) {block = {address: next, length}; next += length; if (next > allocationLimit) throw Error('Race texture fixture heap bound.');} else block = free.splice(index, 1)[0];
      memory.fill(0xcd, block.address, block.address + block.length); owned.set(block.address, block); allocations.push([name, args[0], block.address]); return block.address;
    }
    if (['free', 'operatorDelete', 'operatorDeleteArray'].includes(name)) {const block = owned.get(args[0]); if (block) {owned.delete(args[0]); free.push(block);} return 0;}
    if (name === 'pow') return Math.pow(...args);
    if (name === 'registerExit') return 0;
    return base.libraryCall(name, args);
  };
  const platformCall = (name, args) => {
    calls.push([name, ...args]);
    switch (name) {
      case 'GdiplusStartup': memory.writeBigUInt64LE(0xabc123n, args[0]); return 0;
      case 'CreateMutexA': case 'CreateEventA': return nextHandle++;
      case 'GetCurrentProcess': return -1;
      case 'GetProcessAffinityMask': put(args[1], 15); put(args[2], 15); return 1;
      case 'GetCurrentThreadId': return 77;
      case 'WaitForMultipleObjects': case 'WaitForSingleObject': return 0;
      case 'SetEvent': case 'ResetEvent': case 'ReleaseMutex': case 'InitializeCriticalSectionAndSpinCount': case 'EnterCriticalSection': case 'LeaveCriticalSection': return 1;
      case 'GdipCreateBitmapFromFile': imageKind = wide(args[0]).toLowerCase().includes('icesheet') ? 'ice' : 'time'; put(args[1], 0x990001); return 0;
      case 'GdipGetImageWidth': put(args[1], imageKind === 'ice' ? failIce ? 0 : iceWidth : failTime ? 0 : timeWidth); return 0;
      case 'GdipGetImageHeight': put(args[1], imageKind === 'ice' ? iceHeight : timeHeight); return 0;
      case 'GdipBitmapLockBits': {
        const width = imageKind === 'ice' ? iceWidth : timeWidth, height = imageKind === 'ice' ? iceHeight : timeHeight, pitch = width * 4 + 4; put(args[4] + 8, negativeStride ? -pitch : pitch); put(args[4] + 16, 0x120000);
        if (0x120000 + pitch * height >= 0x1c0000) throw Error('Race texture fixture scan buffer bound.'); for (let i = 0; i < pitch * height; i++) memory[0x120000 + i] = i * 7 + 3 & 255; return 0;
      }
      default: return base.platformCall(name, args);
    }
  };
  const rendererCall = (request, runtime) => {
    rendererCalls.push([request, runtime.scratchBase]); if (request.offset === 0x78) {put(request.arguments[0], nextTexture++); return request.arguments[0];}
    const list = request.arguments[1], levels = [];
    for (let p = memory.readUInt32LE(list); p !== memory.readUInt32LE(list + 4); p += 4) {const image = memory.readUInt32LE(p), width = memory.readInt32LE(image + 8), height = memory.readInt32LE(image + 12), depth = memory.readInt32LE(image + 0x44), pixels = memory.readUInt32LE(image + 4); levels.push([width, height, depth, Buffer.from(memory.subarray(pixels, pixels + width * height * (depth >> 3)))]);}
    rendererCalls.push(['upload', levels]); memory[request.arguments[5]] = 1; const failed = failProcedural && request.arguments[4] === 1 || failFirstUpload && uploadCount === 0 || failTile && uploadCount >= 2; uploadCount++; return failed ? 0 : 1;
  };
  return {libraryCall, platformCall, rendererCall, calls, rendererCalls, allocations};
}

export function prepareRaceTextureFixture(memory, {bits = 32, mipmaps = false, maximumId = 61, oldTimeId = -1} = {}) {
  const put = (p, v) => memory.writeInt32LE(v | 0, p), descriptor = 0x110000;
  put(0x714ae8, 0x100000); put(0x100000, 0x108000); put(0x108078, 0x592000); put(0x108088, 0x592010); put(0x100444, descriptor);
  const masks = bits === 16 ? [0xf800, 0x7e0, 31, 0] : [0xff0000, 0xff00, 255, -16777216], shifts = bits === 16 ? [3, 11, 2, 5, 3, 0, 0, 0] : [0, 16, 0, 8, 0, 0, 0, 24]; shifts.forEach((v, i) => memory[descriptor + 4 + i] = v); masks.forEach((v, i) => put(descriptor + 12 + i * 4, v)); put(descriptor + 28, bits); put(descriptor + 32, bits >> 3);
  for (let i = 0; i < 2048; i++) put(0x6e1620 + i * 4, -1);
  put(0x6e63d0, mipmaps ? 0 : 3); put(0x6e64a4, mipmaps ? 0 : 0x6e63d8); memory[0x6e63d8 + 0x62] = 0; put(0x91ce98, maximumId); put(0x5ed024, oldTimeId); put(0x5ed028, -99); put(0x5ed02c, -1);
}
