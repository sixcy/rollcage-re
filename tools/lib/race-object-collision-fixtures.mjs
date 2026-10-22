import {createSimulationRuntimeFixture} from './simulation-runtime-fixtures.mjs';
import {initializeParticlePoolConstants, initializeRawParticlePools, initializeRawBodyDebrisPool} from '../../src/particle-pools.mjs';

// Synthetic native pools, constructed by actual effect constructors. These
// fixtures are not original-process observations or installed loader output.
export function createRaceObjectCollisionFixture(program, index = 0, {kind = 25, scripted = true} = {}) {
  const fixture = createSimulationRuntimeFixture(program, index, {count: 1}), {memory, bodies} = fixture;
  const put = (p, value) => memory.writeInt32LE(value | 0, p), word = (p, value) => memory.writeUInt16LE(value & 65535, p);
  const body = bodies[0].address, config = 0x84000, materials = 0x82000, palette = 0x80000, materialPack = 0x79000, groups = 0x7b000, scripts = 0x85000;
  let cursor = 0x600000;
  const allocate = size => {const address = cursor; cursor += (size + 127) & ~127; if (cursor > memory.length) throw Error('Collision fixture allocation exceeded memory.'); return address;};
  put(0x5ecefc, config); memory.writeFloatLE(1, config + 0x68); put(0x90b984, 0); put(0x90b988, materials); put(0x90b980, palette); put(0x90b990, materialPack);
  put(0x70dcf4, 0x300000); initializeParticlePoolConstants(memory);
  const runtime = {memory, scratchBase: 0x9000, allocate, handlers: {allocate}, roundingMode: 'nearest-even'};
  initializeRawParticlePools(runtime); initializeRawBodyDebrisPool(runtime);
  put(body, kind | 0xe00 | (scripted ? 0x2000 : 0)); put(body + 0x148, ({25: 0x40fcb0, 31: 0x40fdb0, 35: 0x40fe30, 29: 0x46e4e0})[kind] ?? 0x40fcb0);
  put(0x5ec954, (index * 1234567 + 0x12345678) | 0); put(0x5ec958, index + 1);
  put(0x9092b4, scripts); word(scripts + index % 8 * 2, 0xffff); word(body + 0x16a, 0x5000 | index % 8); word(body + 0x16c, 0);
  put(0x82e900, 3); put(0x82e880, body + 0x10000); put(0x82e884, 101); put(0x82e888, body); put(0x82e88c, 202); put(0x82e890, body + 0x20000); put(0x82e894, 303);
  put(memory.readUInt32LE(0x90b98c) + 0x60, groups); put(0x6e6518, 4);
  for (let i = 0; i < 4; i++) {put(0x6f9690 + i * 8, i === 0 ? body + 0x10000 : body); put(0x6f9694 + i * 8, i); memory[groups + i * 12 + 3] = i + 1;}
  return {...fixture, runtime, body, put, word, fixtureAddresses: {config, materials, palette, materialPack, groups, scripts}};
}
