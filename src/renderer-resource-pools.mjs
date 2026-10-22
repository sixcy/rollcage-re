const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const library = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Renderer resource storage requires CRT ${name}.`); return r.services.libraryCall(name, args, r);};
const allocate = (r, bytes, array = false) => library(r, array ? 'operatorNewArray' : 'operatorNew', [bytes >>> 0]) >>> 0;
const release = (r, pointer, array = false) => library(r, array ? 'operatorDeleteArray' : 'operatorDelete', [pointer]);
const copy = (m, output, input, bytes) => Buffer.from(m.subarray(input, input + bytes)).copy(m, output);
const copyWords = (m, output, input, count) => {for (let i = 0; i < count; i++) put(m, output + i * 4, get(m, input + i * 4));};

//50eda0/50ec10 specialize the same raw deque ownership used by resource pools.
export function constructRendererFreeIndices(deque, runtime) {
  const m = runtime.memory; for (let i = 0; i < 5; i++) put(m, deque + i * 4, 0); const sentinel = allocate(runtime, 8); if (!sentinel) throw Error('Native deque bad_alloc.'); put(m, deque, sentinel); put(m, sentinel, 0); put(m, sentinel + 4, 0); put(m, ptr(m, deque), deque); return deque;
}
//40eee0. The circular map keeps the current block index while growing.
function growDeque(deque, runtime) {
  const m = runtime.memory, oldCapacity = ptr(m, deque + 8); let capacity = oldCapacity || 1;
  while (capacity === oldCapacity || capacity < 8) {if (0xfffffff - capacity < capacity) throw RangeError('Native deque length error.'); capacity *= 2;}
  const extra = capacity - oldCapacity, offset = ptr(m, deque + 12) >>> 2, output = allocate(runtime, capacity * 4); if (!output) throw Error('Native deque bad_alloc.'); const old = ptr(m, deque + 4), suffixBytes = (oldCapacity - offset) * 4; copy(m, output + offset * 4, old + offset * 4, suffixBytes); let cursor = output + oldCapacity * 4;
  if (extra < offset) {copy(m, cursor, old, extra * 4); copy(m, output, old + extra * 4, (offset - extra) * 4); cursor = output + (offset - extra) * 4; for (let i = 0; i < extra; i++) put(m, cursor + i * 4, 0);}
  else {copy(m, cursor, old, offset * 4); cursor += offset * 4; for (let i = 0; i < extra - offset; i++) put(m, cursor + i * 4, 0); for (let i = 0; i < offset; i++) put(m, output + i * 4, 0);}
  if (ptr(m, deque + 4)) release(runtime, ptr(m, deque + 4)); put(m, deque + 8, ptr(m, deque + 8) + extra); put(m, deque + 4, output);
}
//Optional precise40eee0 frame for raw callers whose descendants consume it.
//The ordinary pool API keeps its established intrinsic-copy convention.
function nativeDequeCall(r,name,args,top,returned){const m=r.memory;args.forEach((v,i)=>put(m,top-args.length*4+i*4,v));const entry=top-args.length*4-4;put(m,entry,returned);return library({...r,scratchBase:entry},name,args.map((_,i)=>ptr(m,entry+4+i*4)));}
function nativeDequeSave(r,S,rows){for(const[n,o]of rows)if(Number.isInteger(r.entryRegisters?.[n]))put(r.memory,S+o,r.entryRegisters[n]);}
function growDequeNative(deque,r){const m=r.memory,S=r.scratchBase,F=S-28;nativeDequeSave(r,S,[['EBP',-16],['ESI',-20]]);const oldCapacity=ptr(m,deque+8);let capacity=oldCapacity||1;while(((capacity-oldCapacity)>>>0)<1||capacity<8){if(((0xfffffff-capacity)>>>0)<capacity)throw RangeError('Native deque length error.');capacity=capacity*2>>>0;}const extra=capacity-oldCapacity;put(m,S-12,0);nativeDequeSave(r,S,[['EBX',-24]]);let offset=ptr(m,deque+12)>>>2;put(m,S-8,offset);let output=0;if(capacity){if(capacity>0x3fffffff)throw Error('Native deque bad_alloc.');output=nativeDequeCall(r,'operatorNew',[(capacity*4)>>>0],S-24,0x40ef42)>>>0;put(m,S-12,output);if(!output)throw Error('Native deque bad_alloc.');}const old=ptr(m,deque+4),offsetBytes=offset*4;put(m,S-4,offsetBytes);nativeDequeSave(r,S,[['EDI',-28]]);const suffixBytes=((Math.trunc((((get(m,deque+8)<<2)-(old+offsetBytes)+old)|0)/4)|0)*4)|0;const first=nativeDequeCall(r,'memmove',[output+offsetBytes,old+offsetBytes,suffixBytes>>>0],F,0x40ef89)>>>0;let cursor=first+suffixBytes,liveOld=ptr(m,deque+4);
 if(offset<=extra){const bytes=offset*4;const result=nativeDequeCall(r,'memmove',[cursor,liveOld,bytes>>>0],F,0x40efb5)>>>0;cursor=result+bytes;for(let i=0;i<extra-offset;i++)put(m,cursor+i*4,0);const prefix=ptr(m,S-8);output=ptr(m,S-12);for(let i=0;i<prefix;i++)put(m,output+i*4,0);
 }else{const bytes=extra*4;nativeDequeCall(r,'memmove',[cursor,liveOld,bytes>>>0],F,0x40efed);liveOld=ptr(m,deque+4);const start=liveOld+bytes,remaining=(((get(m,S-4)-start+liveOld)|0)>>2)*4;const result=nativeDequeCall(r,'memmove',[ptr(m,S-12),start,remaining>>>0],F-12,0x40f011)>>>0;cursor=result+remaining;output=ptr(m,S-12);for(let i=0;i<extra;i++)put(m,cursor+i*4,0);}
 const retired=ptr(m,deque+4);if(retired)nativeDequeCall(r,'operatorDelete',[retired],F+4,0x40f034);put(m,deque+8,get(m,deque+8)+extra);put(m,deque+4,output);
}
//40ecc0. Each allocated block holds four32-bit indices.
export function appendRendererFreeIndex(deque, value, runtime) {
  const m = runtime.memory, count = ptr(m, deque + 16), nativeS = runtime.nativeDequeEntryEsp; if (Number.isInteger(nativeS)) nativeDequeSave(runtime,nativeS,[['EBX',-4],['ESI',-8],['EDI',-12]]); if (!((get(m, deque + 12) + count) & 3) && ptr(m, deque + 8) <= (count + 4 >>> 2)) {if (Number.isInteger(nativeS)) {put(m,nativeS-16,count);put(m,nativeS-20,0x40ece4);growDequeNative(deque,{...runtime,scratchBase:nativeS-20,entryRegisters:{...runtime.entryRegisters,ESI:deque}});} else growDeque(deque, runtime);}
  put(m, deque + 12, get(m, deque + 12) & (get(m, deque + 8) * 4 - 1)); const position = get(m, deque + 16) + get(m, deque + 12) >>> 0, index = (ptr(m, deque + 8) - 1 & position >>> 2) * 4, slot = ptr(m, deque + 4) + index;
  if (!ptr(m, slot)) {const block = Number.isInteger(nativeS)?nativeDequeCall(runtime,'operatorNew',[16],nativeS-12,0x40ed17):allocate(runtime, 16); if (!block) throw Error('Native deque bad_alloc.'); put(m, ptr(m, deque + 4) + index, block);} const output = ptr(m, ptr(m, deque + 4) + index) + (position & 3) * 4;
  //40ed3c/40 load the original input DWORD only after map/block allocation.
  //Numeric pool-construction callers retain their existing value interface.
  if (output) put(m, output, runtime.valueAddress === undefined ? value : get(m, runtime.valueAddress)); put(m, deque + 16, get(m, deque + 16) + 1);
}
function frontIndex(deque, m) {const offset = ptr(m, deque + 12), index = (ptr(m, deque + 8) - 1 & offset >>> 2) * 4; return get(m, ptr(m, ptr(m, deque + 4) + index) + (offset & 3) * 4);}
function removeFront(deque, m) {put(m, deque + 16, get(m, deque + 16) - 1); put(m, deque + 12, get(m, deque + 16) ? get(m, deque + 12) + 1 : 0);}
export function releaseRendererFreeIndices(deque, runtime) {const m = runtime.memory; if (get(m, deque + 16)) {put(m, deque + 12, 0); put(m, deque + 16, 0);} for (let i = ptr(m, deque + 8); i; ) {const block = ptr(m, ptr(m, deque + 4) + --i * 4); if (block) release(runtime, block);} if (ptr(m, deque + 4)) release(runtime, ptr(m, deque + 4)); put(m, deque + 4, 0); put(m, deque + 8, 0);}

//5141f0+514290 vertex descriptors,514a70+50ee50 texture descriptors,513e40 IDs.
export function constructRendererVertexResource(object, {memory: m}) {for (let i = 0; i < 19; i++) put(m, object + i * 4, 0); put(m, object + 0x4c, 0x10000040); for (const offset of [0x50, 0x54, 0x58]) put(m, object + offset, 0); return object;}
export function constructRendererTextureResource(object, {memory: m}) {put(m, object + 4, 0); put(m, object + 8, -1); m[object + 12] = 0; for (const offset of [16, 20, 24]) put(m, object + offset, 0); m.fill(0, object + 28, object + 0x41c); put(m, object, 0x5db544); m[object + 0x41c] = 0; for (let offset = 0x420; offset <= 0x434; offset += 4) put(m, object + offset, 0); put(m, object, 0x5db528); for (let offset = 0x438; offset <= 0x448; offset += 4) put(m, object + offset, 0); put(m, object + 0x44c, 1); put(m, object + 0x450, -1); put(m, object + 0x454, 0); put(m, object + 0x458, 0); m.writeUInt16LE(0, object + 0x45c); return object;}
function allocateChunk(count, kind, runtime) {const stride = kind === 'vertex' ? 100 : kind === 'texture' ? 0x460 : 4, total = BigInt(count >>> 0) * BigInt(stride), output = allocate(runtime, total > 0xffffffffn ? 0xffffffff : Number(total), true), m = runtime.memory; if (output) for (let i = 0; i < (count | 0); i++) {const object = output + i * stride; if (kind === 'vertex') {constructRendererVertexResource(object, runtime); put(m, object + 0x5c, 0); m[object + 0x60] = 0;} else if (kind === 'texture') constructRendererTextureResource(object, runtime); else put(m, object, -1);} return [output, count >>> 0];}

//514120/513f10 vector reserve preserves live length across CRT deletion.
function reserveVector(vector, count, stride, runtime) {const m = runtime.memory; let output = 0; if (count) {if (count > (stride === 4 ? 0x3fffffff : 0x1fffffff)) throw Error('Native vector bad_alloc.'); output = allocate(runtime, count * stride); if (!output) throw Error('Native vector bad_alloc.');} const old = ptr(m, vector), end = ptr(m, vector + 4); if (end >= old) copyWords(m, output, old, (end - old + 3) >>> 2); const liveOld = ptr(m, vector), length = (get(m, vector + 4) - liveOld) / stride | 0; if (liveOld) release(runtime, liveOld); put(m, vector + 8, output + count * stride); put(m, vector, output); put(m, vector + 4, output + length * stride);}
function appendChunk(vector, values, runtime) {const m = runtime.memory; if (get(m, vector + 4) === get(m, vector + 8)) {const size = get(m, vector + 4) - get(m, vector) >> 3, capacity = get(m, vector + 8) - get(m, vector) >> 3, half = capacity >>> 1; if (size === 0x1fffffff) throw RangeError('Native vector length error.'); reserveVector(vector, Math.max(size + 1, 0x1fffffff - half < capacity ? 0 : capacity + half), 8, runtime);} const output = ptr(m, vector + 4); if (output) {put(m, output, values[0]); put(m, output + 4, values[1]);} put(m, vector + 4, get(m, vector + 4) + 8);}

//513640/513940/514310: resource chunks, allocated-index vector, free-index
//deque and rebuilt live pointer table. Shrinking keeps whole retained chunks.
export function resizeRendererResourcePool(pool, requested, kind, runtime) {
  if (!['vertex', 'texture', 'integer'].includes(kind)) throw Error('Unknown recovered renderer resource specialization.'); const m = runtime.memory, oldCount = ptr(m, pool + 4); requested = kind === 'vertex' ? 128 : requested >>> 0; if (oldCount === requested) return;
  let count = requested;
  if (requested < oldCount) {
    let cursor = ptr(m, pool + 8), retained = 0;
    while (cursor !== ptr(m, pool + 12)) {if (retained < requested) {retained += ptr(m, cursor + 4); cursor += 8;} else {if (ptr(m, cursor)) {release(runtime, ptr(m, cursor), true); put(m, cursor, 0);} put(m, cursor + 4, 0); for (let input = cursor + 8, output = cursor; input !== ptr(m, pool + 12); input += 8, output += 8) {put(m, output, get(m, input)); put(m, output + 4, get(m, input + 4));} put(m, pool + 12, get(m, pool + 12) - 8);}}
    count = retained; cursor = ptr(m, pool + 40); while (cursor !== ptr(m, pool + 44)) {if (ptr(m, cursor) < retained) cursor += 4; else {for (let input = cursor + 4; input < ptr(m, pool + 44); input += 4) put(m, input - 4, get(m, input)); put(m, pool + 44, get(m, pool + 44) - 4);}}
    const temporary = runtime.scratchBase - (kind === 'texture' ? 36 : 32); constructRendererFreeIndices(temporary, runtime); while (get(m, pool + 36)) {appendRendererFreeIndex(temporary, frontIndex(pool + 20, m), runtime); removeFront(pool + 20, m);} while (get(m, temporary + 16)) {const index = frontIndex(temporary, m); if ((index >>> 0) < count) appendRendererFreeIndex(pool + 20, index, runtime); removeFront(temporary, m);} releaseRendererFreeIndices(temporary, runtime); release(runtime, ptr(m, temporary));
  }
  if (oldCount < count) {if (((get(m, pool + 48) - get(m, pool + 40) >> 2) >>> 0) < count) reserveVector(pool + 40, count, 4, runtime); appendChunk(pool + 8, allocateChunk(count - oldCount, kind, runtime), runtime); for (let i = oldCount; i < count; i++) appendRendererFreeIndex(pool + 20, i, runtime);}
  if (ptr(m, pool)) {release(runtime, ptr(m, pool), true); put(m, pool, 0);} const table = allocate(runtime, count * 4, true); put(m, pool, table); put(m, pool + 4, count); const stride = kind === 'vertex' ? 100 : kind === 'texture' ? 0x460 : 4; let index = 0;
  for (let chunk = ptr(m, pool + 8), end = ptr(m, pool + 12); chunk !== end; chunk += 8) for (let i = 0; i < ptr(m, chunk + 4); i++) put(m, ptr(m, pool) + index++ * 4, ptr(m, chunk) + i * stride);
}

//514600/5131b0/513330 actual128-entry constructors, including owned sentinel.
export function constructRendererResourcePool(pool, kind, runtime) {const m = runtime.memory; for (let i = 0; i < 5; i++) put(m, pool + i * 4, 0); constructRendererFreeIndices(pool + 20, runtime); for (const offset of [40, 44, 48]) put(m, pool + offset, 0); resizeRendererResourcePool(pool, 128, kind, runtime); return pool;}
