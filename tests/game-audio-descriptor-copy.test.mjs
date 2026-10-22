import test from 'node:test';
import assert from 'node:assert/strict';
import {copyGameAudioDescriptor} from '../src/game-audio-descriptor-copy.mjs';
import {createGameAudioCopyServices} from '../tools/lib/game-audio-copy-fixtures.mjs';
test('overlapping descriptor flags propagate byte by byte after string and DWORD copies', () => {
  const memory = Buffer.alloc(0xa00000), input = 0x100000, output = input + 1;
  memory.write('Sample\0', input); memory.write('Default\0', input + 24); memory.write('Test.wav\0', input + 48, 'utf16le');
  memory.set([1, 2, 3, 4, 5, 6, 7, 8], input + 0x458);
  memory[input + 0x457] = 9; //The preceding forward DWORD copy changes the first flag.
  copyGameAudioDescriptor(output, input, {memory, scratchBase: 0x9000, services: createGameAudioCopyServices(memory)});
  assert.deepEqual([...memory.subarray(output + 0x458, output + 0x460)], Array(8).fill(9));
});
