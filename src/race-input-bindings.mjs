const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p);

//433d80. Binding count slots contain pointers, not direct counts. Match the
//first type1/device row, then preserve the two independent virtual lookups.
//The original input-manager adapters remain an explicit interface to recover.
export function selectRaceInputCalibration(index, deviceId, runtime) {
  index |= 0; deviceId |= 0;
  if (index > 3) return 0;
  const {memory: m, scratchBase, handlers = {}} = runtime;
  const count = get(m, ptr(m, (0x57070c + Math.imul(index, 4)) >>> 0));
  const bindings = ptr(m, (0x574734 + Math.imul(index, 4)) >>> 0);
  const call = (owner, method, args) => {
    if (typeof handlers.inputManagerCall !== 'function') throw Error('Input calibration requires inputManagerCall; native game adapters remain to trace.');
    const result = handlers.inputManagerCall(owner, method, args, {...runtime, scratchBase: scratchBase - 12 - args.length * 4});
    const value = typeof result === 'number' ? result : result?.eax;
    if (!Number.isInteger(value)) throw Error('Input calibration requires explicit virtual EAX.');
    return value | 0;
  };
  for (let i = 0; i < count; i++) {
    const row = bindings + i * 16;
    if (get(m, row + 4) !== 1 || get(m, row + 8) !== deviceId) continue;
    let device = call(ptr(m, 0x714b54), 0x14, [get(m, row + 8), 3]);
    if (device) {const type = call(device >>> 0, 0x30, []); if (type !== 0 && type !== 1) return 2;}
    device = call(ptr(m, 0x714b54), 0x14, [get(m, row + 8), 3]);
    if (!device) return 0;
    return call(device >>> 0, 0x30, []) ? 1 : 0;
  }
  return 0;
}

//45eac0. All four computed dispatch tables are retained independently in
//race-input-dispatch-listing.json. Binding slots0/1 share84h, slot4
//contributes82h and slot2 contributes81h.
export function readRaceInputButtonMask(index, {memory: m}) {
  index |= 0;
  if (index >= 4) return 0;
  const configured = (ptr(m, 0x5ecefc) + Math.imul(index, 0x90) + 0x1a3) >>> 0;
  if (!m.readUInt8(configured) || (index >>> 0) > 3) return 0;
  const base = [0x908ea0, 0x908b20, 0x908ce0, 0x908960][index];
  let mask = get(m, base + 4) === 1 || get(m, base + 20) === 1 ? 0x84 : 0;
  if (get(m, base + 68) === 1) mask |= 0x82;
  if (get(m, base + 36) === 1) mask |= 0x81;
  return mask;
}
