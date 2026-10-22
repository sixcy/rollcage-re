import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {copyGameImageMetadata} from '../src/game-image-copy.mjs';
import {clearGamePixelImage} from '../src/game-image-storage.mjs';

test('metadata string arguments and saved registers survive into a later cleared image', async () => {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), put = (m, p, v) => m.writeInt32LE(v | 0, p);
  for (const S of [0x9000, 0x9200, 0x9400]) for (const self of [false, true]) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), input = 0x160000, output = self ? input : 0x161000, image = 0x140000, entryRegisters = {EBX: 0x13572468, ESI: 0x172345, EDI: 0x24681357}, runtime = {memory,scratchBase:S,entryRegisters};
    memory.fill(0x36,S-0x200,S+0x100); for (const object of [input,output]) {memory.fill(0,object,object+0x110); for (const o of [0,28]) put(memory,object+o+20,15); for (const o of [0x80,0x9c,0xb8]) put(memory,object+o+20,7);}
    for(let o=0x38;o<0x80;o+=4)put(memory,input+o,0x12340000+o); put(memory,S,-1); put(memory,S+4,input); machine.reset(); machine.fs0=0; memory.copy(machine.bytes);
    copyGameImageMetadata(output,input,runtime); machine.entry=0x4c45b0; machine.r.ESP=S; machine.r.ECX=output; Object.assign(machine.r,entryRegisters); machine.run();
    assert.deepEqual(memory.subarray(0x10000),machine.bytes.subarray(0x10000));
    //The subsequent native clear exposes the retained string arguments in
    //ordinary mapped output; self-assignment retains its original early exit.
    const clearS=S+32; memory[image+0x174]=machine.bytes[image+0x174]=1; put(memory,clearS,-1); put(machine.bytes,clearS,-1);
    clearGamePixelImage(image,{...runtime,scratchBase:clearS}); machine.entry=0x4c1af0; machine.r.ESP=clearS; machine.r.ECX=image; machine.run();
    assert.deepEqual(memory.subarray(0x10000),machine.bytes.subarray(0x10000)); if(!self)assert.equal(memory.readInt32LE(image+0x14),input+0xb8);
  }
});
