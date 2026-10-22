import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createRawAttachmentQueue} from '../src/raw-attachment-queue.mjs';
import {createPhysicsInteractionRuntime} from '../src/physics-interaction-runtime.mjs';
import {createScriptedCollisionFilter} from '../src/scripted-collision-filter.mjs';
import {createRaceObjectCollisionFilters} from '../src/race-object-collision-filters.mjs';
import {createPeriodicBodyCollisionFilter} from '../src/periodic-body-spawn.mjs';
import {queueDestroyedPlacedObjects, selectModelDestructionObserver, startModelDestructionCamera} from '../src/placed-object-damage.mjs';

// Synthetic explicit spans exercise the source APIs over disjoint native VAs.
// Missing bytes remain errors; these are not original-process replay fixtures.
const BODY = 0x11300000, EVENT = 0x22400000, STACK = 0x9f000;
function fixture(regions) {
  const {memory} = createCapturedMemory(regions.map(([address,length]) => ({address,bytes:Buffer.alloc(length)})));
  const put = (p,value) => memory.writeInt32LE(value | 0,p);
  const body = length => ({address:BODY,bytes:memory.subarray(BODY,BODY+length)});
  return {memory,put,body,runtime:{memory,scratchBase:STACK}};
}

test('sparse attachment publication retains exact body identity and live native cursors', () => {
  const {memory,body} = fixture([[BODY,0x180],[0x902040,8],[0x6e6ba0,4]]), value = body(0x180);
  const queue = createRawAttachmentQueue({memory,bodyAt: address => address === BODY ? value : null});
  queue.entries[queue.count++] = value;
  assert.equal(queue.count,1); assert.equal(memory.readUInt32LE(0x902040),BODY); assert.equal(queue.entries[0],value);
  assert.throws(() => {queue.entries[1] = {...value,bytes:Buffer.from(value.bytes)};}, /coherent/);
  assert.equal(memory.readUInt32LE(0x902044),0);
});

test('sparse interaction bindings expose live lanes and reject equal detached bytes', () => {
  const {memory,body} = fixture([[BODY,0x700]]), value = body(0x700), interactions = createPhysicsInteractionRuntime({memory});
  assert.equal(interactions.bindBody(value),value);
  value.effectDirection680 = [123,-456,789]; value.effectCounter6b8 = 17;
  assert.equal(memory.readInt32LE(BODY+0x684),-456); assert.equal(memory.readUInt16LE(BODY+0x6b8),17);
  memory.writeUInt16LE(999,BODY+0x6ba); assert.equal(value.effectMagnitude6ba,999);
  assert.throws(() => interactions.bindBody({...value,bytes:Buffer.from(value.bytes)}), /alias/);
});

test('sparse scripted collision preserves native cdecl slots without accepting detached events', () => {
  const {memory,body,runtime} = fixture([[BODY,0x180],[EVENT,0x68],[STACK,16]]), value = body(0x180), event = {address:EVENT,bytes:memory.subarray(EVENT,EVENT+0x68)};
  const filter = createScriptedCollisionFilter(runtime);
  assert.equal(filter(value,null,event),1);
  assert.deepEqual([4,8,12].map(o=>memory.readUInt32LE(STACK+o)),[BODY,0,EVENT]);
  assert.throws(() => filter(value,null,{...event,bytes:Buffer.from(event.bytes)}), /sharing/);
});

test('sparse authored callback releases script control through the real targeting-list branch', () => {
  const {memory,put,body,runtime} = fixture([[BODY,0x180],[EVENT,0x68],[STACK-64,80],[0x82e878,0x8c],[0x5ec954,4]]);
  put(BODY,0x2019); put(0x82e880,BODY); put(0x82e900,1); put(0x5ec954,1);
  const event = {address:EVENT,bytes:memory.subarray(EVENT,EVENT+0x68)}, filters = createRaceObjectCollisionFilters(runtime), value = body(0x180);
  assert.equal(filters.get(0x40fcb0)(value,null,event),0);
  assert.equal(memory.readInt32LE(BODY)&0x2000,0); assert.equal(memory.readInt32LE(0x82e900),0); assert.equal(memory.readInt32LE(0x5ec954),16807);
  assert.deepEqual([4,8,12].map(o=>memory.readUInt32LE(STACK+o)),[BODY,0,EVENT]);
  runtime.moduleBaseAddress = 0x6e0000;
  put(BODY,0x2019); put(0x82e880,BODY); put(0x82e900,1);
  assert.equal(filters.get(0x40fcb0)(value,null,event),0);
  assert.equal(memory.readUInt32LE(STACK-32),0x6efcd4, 'Authored callback return scratch uses the actual module address.');
  assert.throws(() => filters.get(0x40fcb0)({...value,bytes:Buffer.from(value.bytes)},null,event), /coherent/);
});

test('sparse periodic callback retires a young body using actual spatial and physical list writes', () => {
  const controller = 0x33400000, bucket = 0x44500000, list = 0x55600000;
  const {memory,put,body,runtime} = fixture([[BODY,0x180],[controller,12],[bucket,12],[list,4],[0x902bc0,8]]);
  put(BODY,33); memory[BODY+0x10c] = 255; put(BODY+12,bucket); put(BODY+0x164,controller);
  put(controller+4,1); put(controller+8,127); put(0x902bc0,list); memory.writeUInt16LE(1,0x902bc4); put(list,BODY);
  const filter = createPeriodicBodyCollisionFilter(runtime), value = body(0x180);
  assert.equal(filter(value),0);
  assert.equal(memory.readInt32LE(controller+4),0); assert.equal(memory.readUInt16LE(0x902bc4),0); assert.equal(memory.readUInt32LE(list),0);
  assert.equal(memory.readUInt32LE(BODY)&0x8000,0x8000);
  assert.throws(() => filter({...value,bytes:Buffer.from(value.bytes)}), /shared/);
});

test('sparse destruction queue and observer copies preserve source snapshots and native coordinate offsets', () => {
  const session = 0x33400000, rows = 0x44500000, indices = 0x55600000, bucket = 0x66700000, descriptor = 0x77800000;
  const {memory,put,runtime} = fixture([[BODY,0x1b4],[session,0x600],[STACK-256,288],[0x5ecb1c,4],[0x6e6550,4],
    [0x9200c0,4],[0x9205a0,16],[0x9205e0,0x204],[0x91ff80,0x40],[0x91d45c,8],[0x91f6c0,112],
    [0x909254,4],[0x909278,4],[0x9092c0,4],[rows+128*16,16],[indices,2],[bucket,16],[descriptor,6]]);
  put(0x5ecb1c,session); memory[session+0x58c] = 2;
  [10,20,30].forEach((value,i)=>put(BODY+0x34+i*4,value*65536));
  queueDestroyedPlacedObjects(BODY,runtime);
  assert.deepEqual([0,4,8].map(o=>memory.readInt32LE(STACK-12+o)),[10,20,30].map(v=>v*65536));
  assert.equal(memory.readUInt32LE(0x9205e0),BODY); assert.equal(memory[0x9207e0],1);
  selectModelDestructionObserver(BODY+0x34,STACK-4,1500,runtime);
  assert.deepEqual([4,8,12].map(o=>memory.readInt32LE(0x9205a0+o)),[-40,-180,-20].map(v=>v*65536));
  put(0x6e6550,2); memory.writeUInt16LE(45,0x91ffb2);
  put(0x909254,rows); put(0x909278,bucket); put(0x9092c0,descriptor);
  memory.writeUInt16LE(0x8080,rows+128*16); put(rows+128*16+12,indices);
  put(0x91f6c0,1); put(0x91f6c0+56,1);
  startModelDestructionCamera(BODY,BODY+0x34,runtime);
  assert.deepEqual([0x91ff90,0x91ff94,0x91ff98].map(p=>memory.readInt32LE(p)),[10,20,30].map(v=>v*65536));
  assert.deepEqual([0x91ff84,0x91ff88,0x91ff8c].map(p=>memory.readInt32LE(p)),[-40,-180,-20].map(v=>v*65536));
  assert.equal(memory.readUInt32LE(0x9200c0),BODY); assert.ok(memory.readInt32LE(0x91ffa8)>=85);
});
