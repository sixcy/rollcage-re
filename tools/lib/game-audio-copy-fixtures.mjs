import assert from 'node:assert/strict';

// Declared CRT secure-copy services for instruction/source comparisons.
// Valid explicit capacities, snapshot overlap convention and terminator only;
// no original CRT invalid-parameter, debug-fill or overlap policy is claimed.
export function createGameAudioCopyServices(memory, {onCall} = {}) {
  const calls = [];
  return {calls, libraryCall(name, args, runtime) {
    assert(['strncpy_s', 'wcsncpy_s'].includes(name), `Unexpected audio copy service ${name}`);
    calls.push([name, ...args, runtime.scratchBase]);
    const [destination, capacity, source, maximum] = args, stride = name === 'wcsncpy_s' ? 2 : 1;
    assert(capacity > 0 && capacity <= 512 && maximum < capacity, 'Admitted CRT copy capacity');
    const values = [];
    for (let i = 0; i < maximum; i++) {const value = stride === 2 ? memory.readUInt16LE(source + i * 2) : memory[source + i]; if (!value) break; values.push(value);}
    onCall?.(name, args, runtime);
    for (let i = 0; i < values.length; i++) if (stride === 2) memory.writeUInt16LE(values[i], destination + i * 2); else memory[destination + i] = values[i];
    if (stride === 2) memory.writeUInt16LE(0, destination + values.length * 2); else memory[destination + values.length] = 0;
    return 0;
  }};
}
