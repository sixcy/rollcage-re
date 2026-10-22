//479d20/4757a0 publish body pointers in902040 and increment6e6ba0.
//44f050 consumes the same list and clears its count. This adapter neither
//creates an independent queue nor resets native entries between frames.
import {sharesNativeMemorySpan} from './native-memory-spans.mjs';
export function createRawAttachmentQueue({memory, bodyAt}) {
  if (!Buffer.isBuffer(memory) || memory.length < 0x902044 || typeof bodyAt !== 'function') throw Error('Raw attachment queue requires shared memory and a body identity factory.');
  const base = 0x902040, capacity = Math.floor((memory.length - base) / 4);
  const indexFor = name => typeof name === 'string' && /^(0|[1-9][0-9]*)$/.test(name) ? Number(name) : null;
  const entries = new Proxy([], {
    get(target, name, receiver) {
      if (name === 'length') return capacity;
      const index = indexFor(name);
      if (index !== null) {if (index >= capacity) throw Error('Raw attachment queue exceeds mapped memory.'); return bodyAt(memory.readUInt32LE(base + index * 4));}
      return Reflect.get(target, name, receiver);
    },
    set(target, name, value, receiver) {
      const index = indexFor(name);
      if (index !== null) {
        if (index >= capacity || !Number.isInteger(value?.address) || !sharesNativeMemorySpan(memory, value.bytes, value.address, 0)) throw Error('Raw attachment queue requires coherent mapped body pointers.');
        memory.writeUInt32LE(value.address, base + index * 4); return true;
      }
      return Reflect.set(target, name, value, receiver);
    }
  });
  return {entries, get count() {return memory.readUInt32LE(0x6e6ba0);}, set count(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw Error('Raw attachment queue count requires uint32.');
    memory.writeUInt32LE(value, 0x6e6ba0);
  }};
}
