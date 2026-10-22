// Live state bridge for the recovered ordinary-body effects 47b020/47b280
// and placed-model damage 413fc0. This constructs no gameplay state and does
// not activate weapons, suppress model callbacks, or establish a whole tick.
import {sharesNativeMemorySpan} from './native-memory-spans.mjs';
export function createPhysicsInteractionRuntime({memory} = {}) {
  if (!Buffer.isBuffer(memory) || memory.length < 0x920800) throw Error('Physics interactions require shared native global storage.');
  const get = address => memory.readInt32LE(address);
  const put = (address, value) => {
    if (!Number.isInteger(value)) throw Error('Physics interaction fields require integers.');
    memory.writeInt32LE(value | 0, address);
  };
  const scalar = (target, name, address) => Object.defineProperty(target, name, {
    enumerable: true, get: () => get(address), set: value => put(address, value)
  });
  const vector = address => [0, 4, 8].map(offset => get(address + offset));
  const directionScratch = {};
  scalar(directionScratch, 'sum91d45c', 0x91d45c);
  scalar(directionScratch, 'leadingZeros91d460', 0x91d460);
  const bodyEffectImpulse = {directionScratch};
  Object.defineProperty(bodyEffectImpulse, 'originQ16', {enumerable: true, get: () => vector(0x91cd80)});
  scalar(bodyEffectImpulse, 'strength', 0x91cd8c);
  const globals = {};
  for (const offset of [0x60, 0x64, 0x68, 0x6c, 0x70, 0x74]) scalar(globals, `field91cd${offset.toString(16)}`, 0x91cd00 + offset);
  const bodyEffectDamping = {globals};
  Object.defineProperties(bodyEffectDamping, {
    originQ16: {enumerable: true, get: () => vector(0x9153f0)},
    timeScaleActive: {enumerable: true, get: () => get(0x811180)}
  });
  const count = () => {
    const value = memory.readUInt32LE(0x9207e4);
    // 47eb38 initializes exactly 800 bytes of 16-byte pending model rows.
    if (value > 50 || value > Math.floor((memory.length - 0x920800) / 16)) throw Error('Physics interaction model rows exceed shared native storage.');
    return value;
  };
  const worldEffectState = {};
  Object.defineProperties(worldEffectState, {
    count: {enumerable: true, get: count},
    records: {enumerable: true, get: () => memory.subarray(0x920800, 0x920800 + count() * 16)},
    originS16: {enumerable: true, get: () => [0x91cd82, 0x91cd86, 0x91cd8a].map(address => memory.readInt16LE(address))},
    strength: {enumerable: true, get: () => get(0x91cd8c)}
  });
  const bound = new WeakSet();
  function bindBody(body) {
    const address = body?.address;
    if (!Number.isInteger(address) || address <= 0 || address + 0x6bc > memory.length || !sharesNativeMemorySpan(memory, body.bytes, address, 0x6bc)) throw Error('Physics interaction body must alias its supplied native storage.');
    if (bound.has(body)) return body;
    const fields = ['effectDirection680', 'effectFallback674', 'effectCounter6b8', 'effectMagnitude6ba'];
    for (const name of fields) if (Object.hasOwn(body, name)) throw Error(`Physics interaction ${name} already has another owner.`);
    for (const [name, offset] of [['effectDirection680', 0x680], ['effectFallback674', 0x674]]) {
      const lanes = new Proxy([0, 0, 0], {
        get(target, key, receiver) {return key === '0' || key === '1' || key === '2' ? get(address + offset + Number(key) * 4) : Reflect.get(target, key, receiver);},
        set(target, key, value) {
          if (key === '0' || key === '1' || key === '2') {put(address + offset + Number(key) * 4, value); return true;}
          if (key === 'length' && value === 3) return true;
          throw Error('Physics interaction vectors have three fixed native lanes.');
        },
        deleteProperty() {throw Error('Physics interaction native lanes cannot be deleted.');}
      });
      Object.defineProperty(body, name, {enumerable: true, get: () => lanes, set: values => {
        if (!Array.isArray(values) || values.length !== 3) throw Error('Physics interaction vectors require three native lanes.');
        values.forEach((value, index) => put(address + offset + index * 4, value));
      }});
    }
    for (const [name, offset] of [['effectCounter6b8', 0x6b8], ['effectMagnitude6ba', 0x6ba]]) Object.defineProperty(body, name, {
      enumerable: true, get: () => memory.readUInt16LE(address + offset), set: value => {
        if (!Number.isInteger(value)) throw Error('Physics interaction fields require integers.');
        memory.writeUInt16LE(value & 65535, address + offset);
      }
    });
    bound.add(body);
    return body;
  }
  return {bodyEffectImpulse, bodyEffectDamping, worldEffectState, bindBody};
}
