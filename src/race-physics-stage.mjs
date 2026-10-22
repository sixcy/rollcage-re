import {stepSimulationFrame} from './simulation-frame.mjs';

//450e50 ->4749e0. Mapped scene/body/registry views are supplied by runtime
//construction; native entry ESP is supplied by this actual call site.
export function runRacePhysicsStage(runtime) {
  const {memory, scratchBase, physics} = runtime, context = physics?.context;
  const native = context?.nativePhysicsStack, views = native?.views;
  if (!Buffer.isBuffer(memory) || !Number.isInteger(scratchBase) || native?.memory !== memory || views?.memory !== memory || !Array.isArray(physics?.vehicles)) throw Error('call4749e0 requires a coherent shared physics context and native entry stack.');
  for (const vehicle of physics.vehicles) if (views.bodyAt(vehicle.body?.address) !== vehicle.body) throw Error('Race physics vehicle identity must share the physical body views.');
  const environment = {...context.environment};
  if (environment.wheelRuntime) environment.wheelRuntime = {...environment.wheelRuntime, scratchBase: scratchBase - 56};
  if (environment.effectRuntime) environment.effectRuntime = {...environment.effectRuntime, driveScratchBase: scratchBase - 56, forceScratchBase: scratchBase - 56};
  const filters = context.nativeCollisionFilterRuntimes ?? [];
  if (!Array.isArray(filters)) throw Error('Race physics collision-filter runtime list must be explicit.');
  for (const filter of filters) if (filter?.memory !== memory) throw Error('Race physics collision filters must share native memory.');
  const group = views.physicalGroup;
  for (let index = 0; index < group.count; index++) if (memory.readUInt32LE(group.bodies[index].address + 0x148) && !filters.length) throw Error('Race physics native collision filters require their entry-stack runtime contexts.');
  const previous = filters.map(filter => filter.scratchBase);
  try {
    //474b20's filter-call entry is52 bytes below the4749e0 entry. These are
    //observer stack contexts, not native game fields or callback answers.
    for (const filter of filters) filter.scratchBase = scratchBase - 52;
    return stepSimulationFrame(group, physics.vehicles, {...context, environment, gravityQ16: memory.readInt32LE(0x5eb5e0), selectionCounter: memory.readInt32LE(0x90a548), nativePhysicsStack: {...native, scratchBase}});
  } finally {
    filters.forEach((filter, index) => {filter.scratchBase = previous[index];});
  }
}
