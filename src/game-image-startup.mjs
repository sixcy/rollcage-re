const put = (m, p, value) => m.writeInt32LE(value | 0, p);
const library = (r, name, args) => {
  if (typeof r.services?.libraryCall !== 'function') throw Error(`Image startup requires CRT ${name}.`);
  return r.services.libraryCall(name, args, r);
};
const platform = (r, name, args) => {
  if (typeof r.services?.platformCall !== 'function') throw Error(`Image startup requires platform ${name}.`);
  return r.services.platformCall(name, args, r);
};

//40c0a0. The actual 24-byte red/black-tree sentinel producer.
export function constructGameImageWorkerMapHead(runtime) {
  const {memory: m} = runtime, head = library(runtime, 'operatorNew', [24]) >>> 0;
  if (!head) throw Error('Native worker-map bad_alloc.');
  put(m, head, head); if ((head + 4) >>> 0) put(m, head + 4, head); if ((head + 8) >>> 0) put(m, head + 8, head);
  m.writeUInt16LE(0x101, head + 12); return head;
}

//4bbfe0. The producer of6eb038 consumed by4c4910.
export function constructGameImageWorkerPool(pool, runtime) {
  const {memory: m} = runtime;
  put(m, pool + 24, 0); put(m, pool + 28, 0);
  const head = constructGameImageWorkerMapHead({...runtime, scratchBase: runtime.scratchBase - 12});
  put(m, pool + 24, head); put(m, pool, 0x5d02fc); put(m, pool + 4, 0);
  put(m, pool + 8, platform(runtime, 'CreateMutexA', [0, 0, 0]));
  put(m, pool + 12, platform(runtime, 'CreateMutexA', [0, 0, 0]));
  put(m, pool + 16, platform(runtime, 'CreateEventA', [0, 1, 1, 0]));
  put(m, pool + 20, platform(runtime, 'CreateEventA', [0, 1, 1, 0]));
  put(m, pool, 0x5d4538); return pool;
}

//4c4a60. Original2049-entry linear/gamma lookup tables. pow is the genuine
//libm service; all branches, f32 rounding and table publication remain game code.
export function initializeGameImageGammaTables(runtime) {
  const {memory: m, scratchBase} = runtime, f = Math.fround;
  if (m[0x6e65f2]) return;
  for (let i = 0; i < 0x801; i++) {
    const value = f(i * m.readDoubleLE(0x5dc738)); m.writeFloatLE(value, scratchBase - 4);
    m.writeFloatLE(value, 0x6ed050 + i * 4); m.writeFloatLE(value, 0x6eb040 + i * 4);
    const linear = value <= m.readFloatLE(0x5dc658) ? f(value * m.readFloatLE(0x5dc67c)) : f(library(runtime, 'pow', [f(f(value + m.readFloatLE(0x5dc668)) * m.readFloatLE(0x5dc758)), m.readDoubleLE(0x5dc8a8)]));
    m.writeFloatLE(linear, 0x6eb040 + i * 4);
    const gamma = value <= m.readFloatLE(0x5dc610) ? f(value * m.readFloatLE(0x5dc9c0)) : f(f(f(library(runtime, 'pow', [value, m.readDoubleLE(0x5dc808)])) * m.readFloatLE(0x5dc780)) - m.readFloatLE(0x5dc668));
    m.writeFloatLE(gamma, 0x6ed050 + i * 4);
  }
  m[0x6e65f2] = 1;
}

//4bbf40. GDI+ startup, shared worker-pool construction and gamma producers.
export function initializeGameImageLibrary(runtime) {
  const {memory: m, scratchBase} = runtime, aligned = scratchBase - 4 & ~7, frame = aligned - 40;
  //4bbf40's original SEH handler survives in caller scratch consumed by the
  //partial-word snow primitive initializer496640.
  if (runtime.entryRegisters?.EBP !== undefined) put(m, scratchBase - 4, runtime.entryRegisters.EBP);
  put(m, aligned - 4, -1); put(m, aligned - 8, 0x56ab4c);
  if (runtime.sehWord !== undefined) put(m, aligned - 12, runtime.sehWord);
  [1, 0, 0, 0].forEach((v, i) => put(m, frame + 8 + i * 4, v));
  platform(runtime, 'GdiplusStartup', [0x6eafe4, frame + 8, 0]);
  const pool = library(runtime, 'operatorNew', [32]) >>> 0; put(m, frame + 4, pool); put(m, frame + 36, 0);
  put(m, 0x6eb038, pool ? constructGameImageWorkerPool(pool, {...runtime, scratchBase: frame - 4}) : 0);
  initializeGameImageGammaTables({...runtime, scratchBase: frame - 4}); return 1;
}
