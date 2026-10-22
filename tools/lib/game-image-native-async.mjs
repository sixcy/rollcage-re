import {createGameImageAsyncFixtures} from './game-image-async-fixtures.mjs';

//Genuine STL async services with a declared serialized await schedule. Game
//capture wrappers, partitioners, refcounts and all reached workers stay native.
export function bindNativeGameImageAsync(machine, worker, {onSteps = () => {}, onWorker = () => {}} = {}) {
  worker.bytes = machine.bytes; worker.externalCalls = machine.externalCalls;
  const put = (m, p, v) => m.writeInt32LE(v | 0, p), services = createGameImageAsyncFixtures(machine.bytes, {execute(captured, stack) {
    worker.r = Object.fromEntries(['EAX', 'EBX', 'ECX', 'EDX', 'EBP', 'ESI', 'EDI', 'ESP'].map(r => [r, 0])); worker.scalars = {}; worker.doubleScalars.clear(); worker.integerVectors.clear(); worker.zeroVectors.clear(); worker.qwords.clear(); worker.scalarBits.clear(); worker.x87 = []; worker.fs0 = 0;
    worker.entry = captured.functionAddress; worker.r.ECX = captured.thisAddress; worker.r.ESP = stack; put(worker.bytes, stack, -1); captured.arguments.forEach((v, i) => put(worker.bytes, stack + 4 + i * 4, v)); onSteps(worker.run(8000000)); onWorker(captured.functionAddress);
  }});
  for (const [entry, count] of [[0x4bde50, 9], [0x4c57c0, 10], [0x4c8850, 14]]) machine.externalCalls.set(entry, m => {const fn = m.bytes.readUInt32LE(m.r.ESP), self = m.bytes.readUInt32LE(m.r.ESP + 4), args = m.bytes.readUInt32LE(m.r.ESP + 8); services.stlAsyncConstruct({futureAddress: m.r.ECX >>> 0, functionAddress: m.bytes.readUInt32LE(fn), thisAddress: m.bytes.readUInt32LE(self), arguments: Array.from({length: count}, (_, i) => m.bytes.readInt32LE(args + i * 4))}, {scratchBase: m.r.ESP - 4}); m.r.EAX = m.r.ECX;});
  machine.externalCalls.set(services.WAIT, m => services.stlFutureWait({stateAddress: m.r.ECX >>> 0, thisAddress: m.r.ECX >>> 0, virtualAddress: services.WAIT}, {scratchBase: m.r.ESP - 4}));
  machine.externalCalls.set(services.DESTROY, m => {services.stlFutureDestroy({stateAddress: m.r.ECX >>> 0, thisAddress: m.r.ECX >>> 0, virtualAddress: services.DESTROY, argument: m.bytes.readUInt32LE(m.r.ESP)}, {scratchBase: m.r.ESP - 4}); m.r.ESP += 4;});
  return services;
}

//Original external CALL stores, not opaque CRT internals. Later game image
//cleanup consumes these slots; the generic interpreter leaves them untouched.
export const gameImageExternalReturnStores = new Map([[0x40f0a2, 0x40f0a8], [0x40f0ba, 0x40f0c0]]);
