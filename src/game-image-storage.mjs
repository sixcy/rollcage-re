import {assignViewportString} from './weather-viewport.mjs';
import {setGameImageMasks} from './game-image-format.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const crt = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Game image requires CRT ${name}.`); return r.services.libraryCall(name, args, r);};
const platform = (r, name, args) => {if (typeof r.services?.platformCall !== 'function') throw Error(`Game image requires platform ${name}.`); return r.services.platformCall(name, args, r);};
const stringRuntime = r => ({...r, handlers: {...r.handlers, allocate: size => crt(r, 'operatorNew', [size]), free: p => crt(r, 'operatorDelete', [p])}});

//40f060/40edc0/40ebc0 pointer-vector ownership, including append from an
//existing element whose address must be rebased after growth.
function precisePointerCrt(r,name,args,top,returned){const m=r.memory;args.forEach((v,i)=>put(m,top-args.length*4+i*4,v));const entry=top-args.length*4-4;put(m,entry,returned);return crt({...r,scratchBase:entry},name,args.map((_,i)=>ptr(m,entry+4+i*4)));}
function reserveGameImagePointersNative(vector,count,r){const{memory:m,scratchBase:S}=r;put(m,S+4,count);for(const[n,o]of[['EBX',-4],['ESI',-8],['EDI',-12]])if(Number.isInteger(r.entryRegisters?.[n]))put(m,S+o,r.entryRegisters[n]);let output=0;if(count){if(count>0x3fffffff)throw RangeError('Native vector bad_alloc.');output=precisePointerCrt(r,'operatorNew',[(count*4)>>>0],S-12,0x40f085)>>>0;if(!output)throw Error('Native vector bad_alloc.');}const begin=ptr(m,vector),bytes=(get(m,vector+4)-begin)&~3;if(Number.isInteger(r.entryRegisters?.EBP))put(m,S-16,r.entryRegisters.EBP);precisePointerCrt(r,'memmove',[output,begin,bytes>>>0],S-16,0x40f0a8);const old=ptr(m,vector),length=(get(m,vector+4)-old)>>2;if(old)precisePointerCrt(r,'operatorDelete',[old],S-16,0x40f0c0);put(m,vector,output);put(m,vector+8,output+count*4);put(m,vector+4,output+length*4);}
export function reserveGameImagePointers(vector, count, runtime) {
  if(runtime.nativePointerVector)return reserveGameImagePointersNative(vector,count>>>0,runtime);
  const {memory: m, scratchBase} = runtime; count >>>= 0; let output = 0;
  if (Number.isInteger(scratchBase)) put(m, scratchBase + 4, count);
  if (Number.isInteger(scratchBase)) for (const [register, offset] of [['EBX', -4], ['ESI', -8], ['EDI', -12], ['EBP', -16]]) if (runtime.entryRegisters?.[register] !== undefined) put(m, scratchBase + offset, runtime.entryRegisters[register]);
  if (count) {if (count > 0x3fffffff) throw RangeError('Native vector bad_alloc.'); output = crt(runtime, 'operatorNew', [count * 4]) >>> 0; if (!output) throw Error('Native vector bad_alloc.');}
  const old = ptr(m, vector), end = ptr(m, vector + 4);
  if (Number.isInteger(scratchBase)) {put(m, scratchBase - 20, end - old & ~3); put(m, scratchBase - 24, old); put(m, scratchBase - 28, output); put(m, scratchBase - 32, 0x40f0a8);}
  Buffer.from(m.subarray(old, old + (end - old & ~3))).copy(m, output); if (old) {if (Number.isInteger(scratchBase)) {put(m, scratchBase - 20, old); put(m, scratchBase - 24, 0x40f0c0);} crt(runtime, 'operatorDelete', [old]);} put(m, vector, output); put(m, vector + 8, output + count * 4); put(m, vector + 4, output + ((end - old) >> 2) * 4);
}
//40edc0: raw one-element capacity wrapper, tailcalling40f060 at the same ESP.
export function growGameImagePointerCapacity(vector, runtime) {
  const {memory:m,scratchBase:S}=runtime;
  if(Number.isInteger(runtime.entryRegisters?.ESI))put(m,S-4,runtime.entryRegisters.ESI);
  const end=ptr(m,vector+4),limit=ptr(m,vector+8);
  if((((limit-end)>>2)>>>0)>=1)return;
  if(Number.isInteger(runtime.entryRegisters?.EDI))put(m,S-8,runtime.entryRegisters.EDI);
  const length=(end-get(m,vector))>>2,capacity=(limit-get(m,vector))>>2;
  if(((0x3fffffff-length)>>>0)<1)throw RangeError('Native vector length error.');
  const half=capacity>>>1,grown=((0x3fffffff-half)>>>0)<(capacity>>>0)?0:capacity+half;
  const count=Math.max(grown>>>0,(length+1)>>>0);put(m,S+4,count);
  return reserveGameImagePointers(vector,count,{...runtime,nativePointerVector:true,entryRegisters:{...runtime.entryRegisters,ESI:ptr(m,S-4),EDI:ptr(m,S-8)}});
}
export function appendGameImagePointer(vector, input, runtime) {
  const {memory: m, scratchBase} = runtime;
  //40ebc0's saved pointers can survive later byte writes and be published by
  //4c1af0. Preserve them at the actual child entry, including no-growth calls.
  if (Number.isInteger(scratchBase) && !runtime.inlineAppend) {
    put(m, scratchBase + 4, input);
    for (const [register, offset] of [['ESI', -4], ['EDI', -8]]) if (runtime.entryRegisters?.[register] !== undefined) put(m, scratchBase + offset, runtime.entryRegisters[register]);
  }
  let relative = null; if ((input >>> 0) < ptr(m, vector + 4) && (input >>> 0) >= ptr(m, vector)) relative = (input - ptr(m, vector)) >> 2;
  if (ptr(m, vector + 4) === ptr(m, vector + 8)) {if(runtime.nativePointerVector){put(m,scratchBase-12,relative===null?vector:ptr(m,vector));put(m,scratchBase-16,relative===null?0x40ec0b:0x40ebe7);}const size = (get(m, vector + 4) - get(m, vector)) >> 2, capacity = (get(m, vector + 8) - get(m, vector)) >> 2, half = capacity >>> 1; if (0x3fffffff - size < 1) throw RangeError('Native vector length error.'); reserveGameImagePointers(vector, Math.max(size + 1, (0x3fffffff - half >>> 0) < (capacity >>> 0) ? 0 : capacity + half), {...runtime, scratchBase: runtime.growthScratchBase ?? runtime.scratchBase - 16, entryRegisters: runtime.growthRegisters ?? {...runtime.entryRegisters, ESI: vector, EDI: relative ?? input}});}
  const output = ptr(m, vector + 4); if (output) put(m, output, get(m, relative === null ? input : ptr(m, vector) + relative * 4)); put(m, vector + 4, get(m, vector + 4) + 4);
}

//4bcb70. Original image color-transform defaults.
export function initializeGameImageColorTransform(object, {memory: m}) {
  for (const [offset, value] of [[0, 0], [12, 0x3f800000], [8, 0x3f800000], [4, 0x3f800000], [16, 0x3f800000], [20, 0], [24, 0], [28, 0]]) put(m, object + offset, value); m[object + 32] = 0;
  for (const [offset, value] of [[36, 0], [40, 1], [44, 0], [48, 0], [52, 0x4019999a], [56, 0x414eb852], [60, 0]]) put(m, object + offset, value);
}

//4c4750, with its reached4066c0 empty-literal wide-string constructors. The
//original literal is a single NUL; the temporary conversion still allocates.
export function initializeGameImageMetadata(object, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 28;
  for (const offset of [0, 0x1c]) {put(m, object + offset + 20, 15); put(m, object + offset + 16, 0); m[object + offset] = 0; assignViewportString(object + offset, 0x56fe6b, 0, stringRuntime(runtime)); put(m, object + offset + 24, 0);}
  for (const [offset, value] of [[0x38, 0], [0x3c, 0], [0x40, 1], [0x44, -1], [0x48, -1], [0x4c, -1], [0x50, 0], [0x54, -1], [0x58, 0], [0x5c, 0], [0x60, -1], [0x64, -1], [0x68, 0], [0x6c, 0], [0x70, -1], [0x74, -1], [0x78, -1], [0x7c, -1]]) put(m, object + offset, value);
  if (m[0x56fe6b]) throw Error('Original image metadata empty literal was modified.');
  for (const [index, offset] of [0x80, 0x9c, 0xb8].entries()) {
    const target = object + offset; put(m, target + 20, 7); put(m, target + 16, 0); word(m, target, 0); put(m, target + 24, 0); const temporary = crt(runtime, 'operatorNewArray', [2]) >>> 0; word(m, temporary, 0); platform(runtime, 'MultiByteToWideChar', [0, 0, 0x56fe6b, 1, temporary, 1]); put(m, target + 16, 0); word(m, target, 0); crt(runtime, 'operatorDeleteArray', [temporary]);
    // These are the original writes from the last nested constructor that
    //4c1af0 later consumes as uninitialized native local bytes.
    put(m, frame - 24, target); put(m, frame - 20, scratchBase - 12); put(m, frame - 16, 0x569c08); put(m, frame - 12, 0); put(m, frame - 8, [0x4c4857, 0x4c486c, 0x4c4881][index]); put(m, frame - 4, 0x56fe6b);
  }
  m[object + 0xd4] = 0; for (const offset of [0xf8, 0xfc, 0x100, 0x104, 0x108, 0xe0, 0xe4, 0xe8, 0xec, 0xf0, 0xf4]) put(m, object + offset, 0);
  put(m, frame + 12, object); put(m, frame + 20, 0x56b4cf); put(m, frame + 24, 3);
  return object;
}

//4c1af0. The native clear routine publishes stale private-stack mask words.
//They must be supplied through the actual caller's coherent entry ESP.
export function clearGamePixelImage(image, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 64;
  if (runtime.entryRegisters && runtime.entryRegisters.ESI !== undefined) put(m, frame, runtime.entryRegisters.ESI);
  let p = ptr(m, image + 4); if (p) {crt(runtime, 'free', [p]); put(m, image + 4, 0);} p = ptr(m, image); if (p) {crt(runtime, 'free', [p]); put(m, image, 0);}
  const keepMetadata = m[image + 0x174]; put(m, frame + 4, 8); put(m, frame + 0x38, 0); m[frame + 0x3c] = 0; const byteTail = get(m, frame + 0x3c);
  Buffer.from(m.subarray(frame + 4, frame + 20)).copy(m, image + 0x10); put(m, image + 8, 0); put(m, image + 12, 0); word(m, image + 0x4c, 0);
  Buffer.from(m.subarray(frame + 0x14, frame + 0x24)).copy(m, image + 0x20); m[image + 0x4e] = 0; put(m, image + 0x50, 0x3f000000); put(m, image + 0x54, 0x3f800000);
  Buffer.from(m.subarray(frame + 0x24, frame + 0x34)).copy(m, image + 0x30); m[image + 0x58] = 0; Buffer.from(m.subarray(frame + 0x34, frame + 0x3c)).copy(m, image + 0x40); put(m, image + 0x48, byteTail); put(m, image + 0x5c, 0);
  if (!keepMetadata) {
    put(m, image + 0xe4, 0); put(m, image + 0xe8, 0);
    //Actual PUSH/CALL and4c45b0 saved-register stores. The callee receives
    //the same metadata object and returns, but later copy descriptors consume
    //the retained upper half of this argument when only a word is cleared.
    put(m, frame - 4, image + 0xa0); put(m, frame - 8, 0x4c1bc6); put(m, frame - 12, image);
  }
  m[image + 0x1b0] = 0;
}

//4bc8b0. All storage, metadata and consumed private-stack producers are real.
export function constructGamePixelImage(list, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 28, image = crt(runtime, 'operatorNew', [0x1b8]) >>> 0;
  put(m, frame + 12, image); put(m, frame + 24, 0);
  if (image) {put(m, image, 0); put(m, image + 4, 0); put(m, image + 16, 8); put(m, image + 0x44, 0); m[image + 0x48] = 0; initializeGameImageColorTransform(image + 0x60, runtime);
    const metaEntry = frame - 4; put(m, metaEntry - 28, list); put(m, metaEntry - 24, image); put(m, metaEntry - 12, scratchBase - 12); initializeGameImageMetadata(image + 0xa0, {...runtime, scratchBase: metaEntry}); put(m, frame + 24, 1); clearGamePixelImage(image, {...runtime, scratchBase: frame - 4, entryRegisters: {ESI: image}});
  }
  put(m, frame + 24, -1); put(m, frame + 12, image); put(m, frame - 4, frame + 12); appendGameImagePointer(list, frame + 12, {...runtime, scratchBase: frame - 8, entryRegisters: {...runtime.entryRegisters, ESI: image, EDI: list}}); return image;
}

//4bcd40. The stack/value-object constructor used by conversion temporaries.
export function initializeGamePixelImage(image, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 20; put(m, frame + 4, image); put(m, image, 0); put(m, image + 4, 0); put(m, image + 16, 8); put(m, image + 0x44, 0); m[image + 0x48] = 0; initializeGameImageColorTransform(image + 0x60, runtime);
  const metaEntry = frame - 4; if (runtime.entryRegisters?.EDI !== undefined) put(m, metaEntry - 28, runtime.entryRegisters.EDI); put(m, metaEntry - 24, image); put(m, metaEntry - 12, scratchBase - 12); initializeGameImageMetadata(image + 0xa0, {...runtime, scratchBase: metaEntry}); put(m, frame + 16, 0); clearGamePixelImage(image, {...runtime, scratchBase: frame - 4, entryRegisters: {ESI: image}}); return image;
}

function pixelByteCount(image, m, frame, returnAddress) {
  const type = get(m, image + 0x10), width = get(m, image + 8), height = get(m, image + 12);
  if (type >= 3 && type <= 7) return Math.imul(Math.imul(type === 3 ? 4 : 8, width), height) >> 3;
  [width, width >> 31, height, height >> 31].forEach((value, i) => put(m, frame - 16 + i * 4, value)); const product = BigInt.asUintN(64, BigInt(width) * BigInt(height)), depth = get(m, image + 0x44);
  [Number(product & 0xffffffffn), Number(product >> 32n), depth, depth >> 31].forEach((value, i) => put(m, frame - 16 + i * 4, value)); put(m, frame - 20, returnAddress); return Number(BigInt.asUintN(64, product * BigInt(depth)) >> 3n & 0xffffffffn) | 0;
}
function imageAllocationFailure(kib, runtime) {
  if (typeof runtime.handlers?.allocationFailure4a1fe0 !== 'function') throw Error('Game image allocation failure reaches debug reporter4a1fe0.');
  if (runtime.handlers.allocationFailure4a1fe0(0x5d399c, 26, 0x5d3938, kib, runtime)) throw Error('Native image allocation debug breakpoint.');
}

//4c18e0. Format normalization, palette/image allocation and optional zeroing.
export function allocateGamePixelImage(image, type, bitDepth, width, height, red, green, blue, alpha, clear, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 24;
  for (const [register, offset] of [['EBX', -12], ['EBP', -16], ['ESI', -20], ['EDI', -24]]) if (runtime.entryRegisters?.[register] !== undefined) put(m, scratchBase + offset, runtime.entryRegisters[register]);
  m[frame + 0x17] = 1; clearGamePixelImage(image, {...runtime, scratchBase: frame - 4});
  if (type === 3 || type >= 4 && type <= 7) {bitDepth = type === 3 ? 4 : 8; red = green = blue = alpha = 0;}
  else if (type === 0 && bitDepth === -1) bitDepth = 32; else if (type === 1 && bitDepth === -1) bitDepth = 64;
  put(m, image + 0x44, bitDepth); put(m, image + 8, width); put(m, image + 0x10, type); put(m, image + 12, height); setGameImageMasks(image, red, green, blue, alpha, {...runtime, scratchBase: frame - 20, entryRegisters: {...runtime.entryRegisters, ESI: type, EDI: image}});
  let success = 1;
  if (type === 2) {const palette = crt(runtime, 'allocate', [1024]) >>> 0; if (!palette) imageAllocationFailure(1, runtime); put(m, image, palette); if (palette) m.fill(0, palette, palette + 1024); else success = 0;}
  if (success) {const size = pixelByteCount(image, m, frame, 0x4c1a1f); put(m, frame - 4, size); const pixels = crt(runtime, 'allocate', [size >>> 0]) >>> 0; if (!pixels) imageAllocationFailure(size >>> 10, runtime); put(m, image + 4, pixels); success = m[frame + 0x17];}
  const pixels = ptr(m, image + 4); if (!pixels) {clearGamePixelImage(image, {...runtime, scratchBase: frame - 4, entryRegisters: {ESI: 0}}); return 0;}
  if ((clear & 255) === 1) {const count = pixelByteCount(image, m, frame, 0x4c1aca) >>> 0; put(m, frame - 4, count); put(m, frame - 8, 0); put(m, frame - 12, pixels); m.fill(0, pixels, pixels + count);} return success;
}

//4bcbe0. Image metadata owns both character and wide-character strings.
export function releaseGameImageMetadata(object, runtime) {
  const {memory: m, scratchBase} = runtime;
  if (runtime.entryRegisters) for (const [register, offset] of [['EBX', -4], ['ESI', -8], ['EDI', -12]]) put(m, scratchBase + offset, runtime.entryRegisters[register]);
  const release = (name, pointer) => {put(m, scratchBase - 16, pointer); crt(runtime, name, [pointer]);};
  for (const offset of [0xb8, 0x9c, 0x80, 0x1c, 0]) {
    const extra = ptr(m, object + offset + 24); if (extra) {release('operatorDeleteArray', extra); put(m, object + offset + 24, 0);}
    const wide = offset >= 0x80, capacity = ptr(m, object + offset + 20); if (capacity >= (wide ? 8 : 16)) release('operatorDelete', ptr(m, object + offset));
    put(m, object + offset + 20, wide ? 7 : 15); put(m, object + offset + 16, 0); if (wide) word(m, object + offset, 0); else m[object + offset] = 0;
  }
}

//4bc2b0. Release each pointer but retain the vector's allocation/capacity.
export function releaseGameImageList(list, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 32; let item = ptr(m, list); const end = ptr(m, list + 4);
  for (; item !== end; item += 4) {const image = ptr(m, item); if (image) {put(m, frame + 0x10, image); put(m, frame + 0x1c, 0); clearGamePixelImage(image, {...runtime, scratchBase: frame - 4, entryRegisters: {ESI: item}}); put(m, frame + 0x1c, -1); releaseGameImageMetadata(image + 0xa0, {...runtime, scratchBase: frame - 4, entryRegisters: {EBX: image, ESI: item, EDI: end}}); put(m, frame - 4, image); crt(runtime, 'operatorDelete', [image]);}}
  put(m, list + 4, get(m, list));
}
