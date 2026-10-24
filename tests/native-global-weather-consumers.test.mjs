import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeFrameMemory} from '../tools/lib/native-frame-memory.mjs';
import {updateWeatherBrightness} from '../src/weather-update.mjs';
import {updateWormholeState} from '../src/wormhole-state.mjs';
import {updateTrackDeformation} from '../src/track-deformation.mjs';

//Constructed overlapping stack and fixed module data at actual base940000.
const STACK=0x809a10,LENGTH=0x6020,DELTA=0x540000,actual=p=>p+DELTA;
function fixture(){
  const route={address:0x80b5e0,targetAddress:actual(0x80b5e0),length:0x7080};
  const result=createNativeFrameMemory([
    {address:route.targetAddress,bytes:Buffer.alloc(route.length)},
    {address:STACK,bytes:Buffer.alloc(LENGTH,0x69)},
    ...[0x5ed2b8,0x5ed2b4,0x6e6ce8,0x6e6cd0].map(address=>({address,bytes:Buffer.alloc(4)})),
    {address:0x91ce90,bytes:Buffer.from([2])},
  ],{aliases:[route,{address:0x91ce90,targetAddress:0x91ce90,length:1}]});
  return{...result,put:(p,v)=>result.memory.writeInt32LE(v|0,p)};
}

test('weather brightness reads relocated fixed mode without mistaking overlapping stack words for globals',()=>{
  const f=fixture(),m=f.memory;
  f.put(0x80dedc,0);f.put(actual(0x80dedc),1);f.put(0x5ed2b8,200);
  const before=Buffer.from(f.span(STACK,LENGTH));
  updateWeatherBrightness({memory:m});
  assert.equal(m.readInt32LE(0x5ed2b8),201);assert.equal(m.readInt32LE(0x6e6cd0),200);
  assert.equal(m.readInt32LE(0x5ed2b4),1);assert.deepEqual(f.span(STACK,LENGTH),before);
});

test('wormhole root translates the literal but retains the actual stack body pointer read from it',()=>{
  const f=fixture(),body=0x80dde0,m=f.memory;
  f.put(actual(0x80b5e0),body);f.put(body+0x188,0);
  const before=Buffer.from(f.span(STACK,LENGTH));
  updateWormholeState({memory:m,scratchBase:0x9000});
  assert.equal(m.readUInt32LE(actual(0x80b5e0)),body);assert.deepEqual(f.span(STACK,LENGTH),before);
});

test('deformation ownership globals point into raw overlapping stack records without rebasing those records',()=>{
  const f=fixture(),m=f.memory,record=0x80df00;
  f.put(actual(0x80df00),1);f.put(actual(0x80df04),record);
  f.span(record,28).fill(0);m.writeUInt16LE(3,record);m.writeUInt16LE(7,record+2);
  const rawCount=m.readUInt32LE(0x80f210),before=Buffer.from(f.span(STACK,LENGTH));
  updateTrackDeformation({memory:m});
  assert.equal(m.readUInt16LE(record+2),8);assert.equal(m.readUInt32LE(actual(0x80df04)),record);
  assert.equal(m.readUInt32LE(actual(0x80df00)),1);assert.equal(m.readUInt32LE(actual(0x80f210)),1);
  assert.equal(m.readUInt32LE(actual(0x80f420)),0x40000003);assert.equal(m.readUInt32LE(0x80f210),rawCount);
  before.writeUInt16LE(8,record+2-STACK);assert.deepEqual(f.span(STACK,LENGTH),before);
});
