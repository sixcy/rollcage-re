// Explicit serialized fixture schedule for genuine STL async/future services.
// Task captures and visible ABI fields are synthetic; callbacks execute actual
//game4bd770. This is not original concurrent-process runtime evidence.
export function createGameImageAsyncFixtures(memory, {execute, calls = []} = {}) {
  const tasks = new Map(), VTABLE = 0x150000, WAIT = 0x590800, DESTROY = 0x590810; let next = 0x600000;
  memory.writeUInt32LE(DESTROY, VTABLE); memory.writeUInt32LE(WAIT, VTABLE + 4);
  const stlAsyncConstruct = (request, runtime) => {
    const state = next; next += 128; memory.fill(0, state, state + 80); memory.writeUInt32LE(VTABLE, state); memory.writeInt32LE(1, state + 4); memory.writeUInt32LE(state, request.futureAddress); memory[request.futureAddress + 4] = 1;
    const args = [...request.arguments], captured = {...request, arguments: args}; tasks.set(state, captured); calls.push(['construct', request.futureAddress, request.functionAddress, request.thisAddress, args, runtime.scratchBase]);
  };
  const stlFutureWait = (request, runtime) => {calls.push(['wait', request.stateAddress, request.virtualAddress, runtime.scratchBase]); const captured = tasks.get(request.stateAddress); if (!captured) throw Error('Unknown fixture future.'); if (!memory[request.stateAddress + 0x20]) {if (execute) execute(captured, 0x4000); else captured.execute({scratchBase: 0x4000}); memory[request.stateAddress + 0x20] = 1;}};
  const stlFutureDestroy = (request, runtime) => {calls.push(['destroy', request.stateAddress, request.thisAddress, request.virtualAddress, request.argument, runtime.scratchBase]); memory.writeInt32LE(-1, request.stateAddress + 0x24); tasks.delete(request.stateAddress);};
  const stlFutureError = request => {calls.push(['error', request.code]); throw Error(`STL future error${request.code}`);};
  return {stlAsyncConstruct, stlFutureWait, stlFutureDestroy, stlFutureError, calls, WAIT, DESTROY};
}
