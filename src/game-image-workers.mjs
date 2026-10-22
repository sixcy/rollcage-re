const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const platform = (r, name, args) => {if (typeof r.services?.platformCall !== 'function') throw Error(`Game image workers require platform ${name}.`); return r.services.platformCall(name, args, r);};

//4c4a00. Count only the original32-bit process mask and clamp to one.
export function countGameImageAffinityCpus(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 12; put(m, frame + 4, 0); put(m, frame + 8, 0);
  const process = platform(runtime, 'GetCurrentProcess', []) >>> 0; platform(runtime, 'GetProcessAffinityMask', [process, frame + 4, frame + 8]);
  let mask = ptr(m, frame + 4), count = 0; for (let bit = 0; bit < 32; bit++) {count += mask & 1; mask >>>= 1;} return Math.max(count, 1);
}

//4c4910. Win32 waits/events are genuine services; lock accounting and the
//thread-ID ordered-tree traversal are actual game/library memory algorithms.
export function readGameImageThreadQuota(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 24, thread = platform(runtime, 'GetCurrentThreadId', []) >>> 0;
  let pool = ptr(m, 0x6eb038); put(m, frame + 0x10, get(m, pool + 8)); put(m, frame + 0x14, get(m, pool + 0x10));
  if ((platform(runtime, 'WaitForMultipleObjects', [2, frame + 0x10, 1, 0xffffffff]) >>> 0) < 2) {put(m, pool + 4, get(m, pool + 4) + 1); platform(runtime, 'SetEvent', [ptr(m, pool + 0x14)]); platform(runtime, 'ReleaseMutex', [ptr(m, pool + 8)]);}
  pool = ptr(m, 0x6eb038); const head = ptr(m, pool + 0x18); let found = head, node = ptr(m, head + 4);
  while (!m[node + 13]) {if (ptr(m, node + 16) < thread) node = ptr(m, node + 8); else {found = node; node = ptr(m, node);}}
  if (found === head || thread < ptr(m, found + 16)) found = head; put(m, frame + 12, found);
  const quota = found === head ? 16 : get(m, found + 20);
  if (!platform(runtime, 'WaitForSingleObject', [ptr(m, pool + 8), 0xffffffff])) {put(m, pool + 4, get(m, pool + 4) - 1); if (!get(m, pool + 4)) platform(runtime, 'ResetEvent', [ptr(m, pool + 0x14)]); platform(runtime, 'ReleaseMutex', [ptr(m, pool + 8)]);}
  return quota;
}
