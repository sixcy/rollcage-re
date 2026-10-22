import {openDiagnosticFile} from './game-diagnostics.mjs';
import {findGameResourceName, readRawArchiveResource, setGameArchiveMode, readGameResource, closeGameResource} from './game-resource-files.mjs';

const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, value) => m.writeInt32LE(value | 0, p);
const service = (runtime, kind, name, args) => {
  if (typeof runtime.services?.[kind] !== 'function') throw Error(`Track resource loading requires ${kind} ${name}.`);
  return runtime.services[kind](name, args, runtime);
};

//4512c0. Actual game malloc adapter, established by exact Listing decodes
//and original bytes rather than a Ghidra procedure boundary. Null is returned
//unchanged; successful allocations are zeroed before the caller reads the file.
export function allocateZeroedTrackResource(size, runtime) {
  const pointer = service(runtime, 'libraryCall', 'allocate', [size >>> 0]) >>> 0;
  if (pointer) runtime.memory.fill(0, pointer, pointer + (size >>> 0));
  return pointer;
}

//479620. Read a whole disk resource through actual4795a0/447d60/447d20.
//The original seeks to obtain size, restores the prior position and reads even
//when malloc returns null. It ignores the read status and returns that malloc.
export function loadDiskTrackResource(name, runtime) {
  const {scratchBase: S} = runtime;
  const handle = openDiagnosticFile(name, 0x80000000, 3, {...runtime, scratchBase: S - 8});
  if (!handle) return 0;
  const seek = (distance, origin) => service(runtime, 'platformCall', 'SetFilePointer', [handle, distance >>> 0, 0, origin]) >>> 0;
  const position = seek(0, 1), size = seek(0, 2); seek(position, 0);
  const destination = allocateZeroedTrackResource(size, {...runtime, scratchBase: S - 24});
  readGameResource(handle, destination, size, {...runtime, scratchBase: S - 24});
  closeGameResource(handle, {...runtime, scratchBase: S - 20});
  return destination;
}

//447ba0. Archive-name lookup or tail-dispatched disk read. The original
//temporarily installs the actual4512c0 allocator and4512b0 free import forwarder,
//then restores captured hooks/mode in order. These are game adapters, not CRT.
export function loadTrackResource(name, runtime) {
  const {memory: m, scratchBase: S} = runtime, index = findGameResourceName(name, runtime) & 65535;
  if (index === 65535) return loadDiskTrackResource(name, runtime);
  const allocateHook = ptr(m, 0x5e8000), freeHook = ptr(m, 0x5e8004);
  put(m, 0x5e8000, 0x4512c0); put(m, 0x5e8004, 0x4512b0);
  const previous = m.readUInt16LE(0x5e8008);
  setGameArchiveMode(0, {...runtime, scratchBase: S - 28});
  const archiveRuntime = {...runtime, scratchBase: S - 36, services: {...runtime.services, libraryCall(operation, args, context) {
    if (operation !== 'allocate') return service({...runtime, scratchBase: context.scratchBase}, 'libraryCall', operation, args);
    const hook = ptr(m, 0x5e8000);
    if (hook === 0x4512c0) return allocateZeroedTrackResource(args[0], {...runtime, scratchBase: context.scratchBase - 20});
    if (typeof runtime.handlers?.archiveAllocatorCall !== 'function') throw Error(`Reached unclassified archive allocator 0x${hook.toString(16)}.`);
    return runtime.handlers.archiveAllocatorCall(hook, args[0], {...runtime, scratchBase: context.scratchBase - 20});
  }}};
  const result = readRawArchiveResource(index, 0, archiveRuntime);
  setGameArchiveMode(previous, {...runtime, scratchBase: S - 40});
  put(m, 0x5e8004, freeHook); put(m, 0x5e8000, allocateHook);
  return result;
}
