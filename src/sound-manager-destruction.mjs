const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
function save(r, name, p) {if (Number.isInteger(r.entryRegisters?.[name])) put(r.memory, p, r.entryRegisters[name]);}
function call(r, kind, name, args, top, returned, targetAddress) {
  const m = r.memory;
  for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  const S = top - args.length * 4 - 4; put(m, S, returned);
  if (typeof r.services?.[kind] !== 'function') throw Error(`SoundManager destruction requires ${kind} ${name}.`);
  return r.services[kind](name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...r, scratchBase: S, targetAddress});
}

//The vector header is captured before freeing its storage. Clearing uses that
//same header even if operatorDelete changes the manager's field. Null storage
//leaves the header's other two DWORDs untouched until the header is freed.
function releaseVector(r, field, header, top, bufferReturn, headerReturn, target) {
  const m = r.memory;
  if (!header) return;
  const storage = ptr(m, header);
  if (storage) {
    call(r, 'libraryCall', 'operatorDelete', [storage], top, bufferReturn, typeof target === 'function' ? target() : target);
    for (const offset of [0, 4, 8]) put(m, header + offset, 0);
  }
  call(r, 'libraryCall', 'operatorDelete', [header], top, headerReturn, typeof target === 'function' ? target() : target);
  put(m, field, 0);
}

//4aba30. Database vectors are storage owners; this function does not walk
//individual descriptor records or reinterpret them as polymorphic objects.
export function destroyAudioDatabaseManager(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 12, target = ptr(m, 0x56e210);
  for (const [name, offset] of [['EBX', -4], ['ESI', -8], ['EDI', -12]]) save(runtime, name, S + offset);
  for (const [offset, bufferReturn, headerReturn] of [[0, 0x4aba4a, 0x4aba64], [4, 0x4aba7d, 0x4aba97], [8, 0x4abab1, 0x4abacb]])
    releaseVector(runtime, object + offset, ptr(m, object + offset), F, bufferReturn, headerReturn, target);
}

//4a9570 tail-calls4aba30 with original ESP and restored nonvolatile registers.
export function destroyCoreSoundManager(object, runtime) {
  const {memory: m, scratchBase: S} = runtime;
  save(runtime, 'ESI', S - 4); save(runtime, 'EDI', S - 8);
  const header = ptr(m, object + 0x814); put(m, object, 0x5d3c60);
  releaseVector(runtime, object + 0x814, header, S - 8, 0x4a9591, 0x4a95af, () => ptr(m, 0x56e210));
  destroyAudioDatabaseManager(object + 4, runtime);
}

//4a5ad0. PCBaseAudioManager frees nine vector owners in the original order,
//then four event handles and three critical sections before the core tailcall.
export function destroyBaseSoundManager(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 12, deleteTarget = ptr(m, 0x56e210);
  for (const [name, offset] of [['EBX', -4], ['ESI', -8], ['EDI', -12]]) save(runtime, name, S + offset);
  const first = ptr(m, object + 0x82c);
  for (const [offset, value] of [[0, 0x5d3bf8], [0x818, 0x5d3bf0], [0x81c, 0x5d3be8]]) put(m, object + offset, value);
  const rows = [[0x82c, 0x4a5b08, 0x4a5b22], [0x830, 0x4a5b42, 0x4a5b5c], [0x834, 0x4a5b7c, 0x4a5b96], [0x840, 0x4a5bb6, 0x4a5bd0], [0x838, 0x4a5bf0, 0x4a5c0a], [0x83c, 0x4a5c2a, 0x4a5c44], [0x848, 0x4a5c64, 0x4a5c7e], [0x844, 0x4a5c9e, 0x4a5cb8], [0x84c, 0x4a5cd8, 0x4a5cf2]];
  for (const [offset, bufferReturn, headerReturn] of rows)
    releaseVector(runtime, object + offset, offset === 0x82c ? first : ptr(m, object + offset), F, bufferReturn, headerReturn, deleteTarget);
  const closeTarget = ptr(m, 0x56e0bc);
  for (const [offset, returned] of [[0x8d4, 0x4a5d0d], [0x8d0, 0x4a5d15], [0x8c8, 0x4a5d1d], [0x8c4, 0x4a5d25]])
    call(runtime, 'platformCall', 'CloseHandle', [ptr(m, object + offset)], F, returned, closeTarget);
  const criticalTarget = ptr(m, 0x56e098);
  for (const [offset, returned] of [[0x894, 0x4a5d34], [0x874, 0x4a5d3d], [0x854, 0x4a5d46]])
    call(runtime, 'platformCall', 'DeleteCriticalSection', [object + offset], F, returned, criticalTarget);
  destroyCoreSoundManager(object, runtime);
}
