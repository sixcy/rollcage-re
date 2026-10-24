import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeParentViewportObservedRegions} from '../tools/lib/native-parent-viewport-map.mjs';

function fixture({base=0x400000,heap=false}={}) {
  const app=0x1100000,head=0x1200000,root=0x1300000,left=root+256,right=root+512;
  const rows=[],add=(address,length)=>{const row={address,bytes:Buffer.alloc(length)};rows.push(row);return row.bytes;};
  add(base+0x2efb38,4).writeUInt32LE(app);
  const header=add(app+0x7c,8);header.writeUInt32LE(head);header.writeUInt32LE(3,4);
  const sentinel=add(head,100);[left,root,right].forEach((p,i)=>sentinel.writeUInt32LE(p,i*4));sentinel[12]=1;sentinel[13]=1;
  const names=heap?['1000000000 Player','1234567890 Player','2000000000 Player']:['0 Player','1 Player','2 Player'];
  for(const [index,address]of [left,root,right].entries()) {
    const node=add(address,100);node.writeUInt32LE(address===root?left:head);node.writeUInt32LE(address===root?head:root,4);node.writeUInt32LE(address===root?right:head,8);node[12]=1;
    const key=Buffer.from(names[index]+'\0');node.writeUInt32LE(key.length-1,32);node.writeUInt32LE(heap?31:15,36);
    if(heap){const p=0x1400000+index*256;node.writeUInt32LE(p,16);key.copy(add(p,key.length));}else key.copy(node,16);
  }
  const snapshot={breakpointId:'native-control-before',registers:{eip:base+0x50e50},ranges:rows};
  const event={args:[app,0,base+0x2e213c,base+0x2e20a4,0],eax:app,sourceNameHex:Buffer.from(names[1]).toString('hex'),authority:'observed-external-MSVCR120-__RTDynamicCast'};
  const options={events:[event],moduleBaseAddress:base};
  return {snapshot,options,event,rows,app,head,root,left,right,run:()=>nativeParentViewportObservedRegions(snapshot,options)};
}

test('constructed original map compares only the source lookup path, excluding other transport and unused nodes',()=>{
  for(const base of [0x400000,0x6e0000]) {
    const f=fixture({base}),before=f.rows.map(row=>Buffer.from(row.bytes)),result=f.run();
    assert.deepEqual(result.lookups[0].visitedNodes,[f.root,f.left]);assert.equal(result.lookups[0].record,f.root+44);
    assert.deepEqual(result.regions.map(row=>[row.address,row.length]),[[f.app+0x7c,8],[f.head,16],[f.root,100],[f.left,100]]);
    assert.ok(!result.regions.some(row=>row.address===f.right));assert.deepEqual(f.rows.map(row=>row.bytes),before);
  }
});

test('heap string admission covers only stored length plus NUL and deduplicates repeated source lookups',()=>{
  const f=fixture({heap:true});f.options.events.push({...f.event});const result=f.run();
  assert.equal(result.lookups.length,2);assert.equal(result.regions.filter(row=>row.id==='viewport-map-key').length,2);
  assert.ok(result.regions.filter(row=>row.id==='viewport-map-key').every(row=>row.length===18));
});

test('native after records and a different cast application cannot supply original map input',()=>{
  const f=fixture();f.snapshot.breakpointId='native-control-after-cameras';assert.throws(f.run,/original parent entry/);
  const g=fixture();g.event.eax+=4;assert.throws(g.run,/candidate application/);
});

test('missing original node, cycles, inconsistent backlinks, excess count and malformed key remain hard failures',()=>{
  const mutations=[
    f=>{f.snapshot.ranges=f.rows.filter(row=>row.address!==f.root);},
    f=>{f.rows.find(row=>row.address===f.left).bytes.writeUInt32LE(f.root,8);},
    f=>{f.rows.find(row=>row.address===f.root).bytes.writeUInt32LE(0,4);},
    f=>{f.rows.find(row=>row.address===f.app+0x7c).bytes.writeUInt32LE(9,4);},
    f=>{f.rows.find(row=>row.address===f.root).bytes.writeUInt32LE(16,32);},
    f=>{f.rows.find(row=>row.address===f.root).bytes[24]=1;},
  ];
  for(const mutate of mutations){const f=fixture();mutate(f);assert.throws(f.run);}
});

test('absent keys and embedded-NUL comparisons retain native allocation boundaries',()=>{
  const f=fixture();f.event.sourceNameHex=Buffer.from('9 Player').toString('hex');assert.throws(f.run,/missing-key allocation/);
  const g=fixture();g.rows.find(row=>row.address===g.root).bytes[17]=0;assert.throws(g.run,/missing-key allocation/);
});
