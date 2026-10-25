import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeTrackPaths} from '../src/track-paths.mjs';
import {withPendingPathConnections} from '../src/track-path-connectivity.mjs';
import {buildPathTopologyOverlay} from '../tools/track-viewer/path-topology-overlay.mjs';
import {appendDashedPathLine} from '../tools/track-viewer/path-line-pattern.mjs';

function fixture(){
  const data=Buffer.alloc(0x300);data.write('GFXM');data[0x79]=3;data.writeUInt32LE(0x100,0x8c);data.writeUInt32LE(0x180,0x98);
  data.writeUInt16LE(3,0x10c);data.writeUInt16LE(2,0x118);data[0x11a]=1;data[0x11c]=1;data.writeUInt32LE(48,0x120);
  for(let i=0;i<5;i++){data.writeInt16LE(i*100,0x180+i*16);data.writeInt16LE(-20,0x182+i*16);data.writeInt16LE(i*40,0x184+i*16);}
  const target=2|(1<<5);data.writeUInt32LE(target,0x18c);data.writeUInt32LE(target|(target<<14),0x19c);return data;
}
const read=data=>decodeTrackPaths(data,false,{connectivity:true}).graph;

test('native direction, cyclic wrap and both packed branches produce real merges/splits without duplicate destinations',()=>{
  const data=fixture(),before=Buffer.from(data),graph=read(data),byId=new Map(graph.nodes.map(n=>[n.id,n]));
  assert.deepEqual(byId.get('g1:p0').outgoing,['g1:p1','g2:p1']);assert.deepEqual(byId.get('g2:p0').outgoing,['g2:p1']);assert.deepEqual(byId.get('g2:p1').outgoing,['g2:p0']);
  assert.equal(byId.get('g2:p1').incoming.length,3);assert.equal(byId.get('g1:p1').outgoing.length,2);assert.equal(byId.get('g1:p1').branchSlotsUsed,2);assert.deepEqual(graph.edges.find(e=>e.from==='g1:p1'&&e.to==='g2:p1').branchSlots,[0,1]);
  assert.deepEqual(byId.get('g1:p0').position,[0,20,0]);assert.deepEqual(data,before);
  data[0x10e]=1;data[0x110]=1;assert.ok(read(data).edges.some(e=>e.kind==='route'&&e.from==='g1:p0'&&e.to==='g1:p2'));
});

test('branch targets outside the stored groups are reported rather than drawn as invented connections',()=>{
  const data=fixture();data.writeUInt32LE(31|(500<<5),0x18c);const graph=read(data);assert.equal(graph.invalidLinks.length,1);assert.equal(graph.edges.some(e=>e.to==='g31:p500'),false);
  assert.equal(decodeTrackPaths(data,true,{connectivity:true}).graph,undefined);assert.equal(decodeTrackPaths(data).graph,undefined);
});

test('the reversal limit counts incoming stored branches separately from normal group travel',()=>{
 const data=fixture();data.writeUInt32LE(2|(1<<5),0x1ac);const node=read(data).nodes.find(n=>n.id==='g2:p1');assert.equal(node.incoming.length,4);assert.equal(node.incomingBranches.length,3);assert.equal(node.branchSlotsUsed,0);
});

test('pending reversal links map stable project IDs to current native points without becoming compiled graph edges',()=>{
  const graph=read(fixture()),before=structuredClone(graph),topology={groups:[{points:[]},{points:[{id:'original-a'},{id:'original-c'},{id:'new-point'}]},{points:[{id:'other-0'},{id:'other-1'}]}]};
  const result=withPendingPathConnections(graph,topology,[{id:'extra-1',fromPointId:'original-c',toPointId:'other-0'}]);assert.deepEqual(result.pendingEdges,[{id:'extra-1',from:'g1:p1',to:'g2:p0'}]);assert.equal(result.nodes.find(n=>n.id==='g1:p1').pending,1);assert.deepEqual(result.edges,graph.edges);assert.deepEqual(graph,before);
});

test('overlay buffers include directional group travel, branch arrows, both marker types and separate pending arrows',()=>{
  const graph=read(fixture());graph.pendingEdges=[{id:'extra',from:'g2:p1',to:'g1:p2'}];graph.nodes.find(n=>n.id==='g2:p1').pending=1;const batches=buildPathTopologyOverlay(graph);
  for(const kind of ['directions','branches','merges','splits','pending'])assert.ok(batches.some(b=>b.kind===kind&&b.features>0),kind);
  assert.ok(batches.every(b=>b.lines.every(Number.isFinite)));assert.ok(batches.find(b=>b.kind==='branches').groups.includes(2));
  graph.nodes.forEach(n=>n.position=[0,0,0]);assert.ok(buildPathTopologyOverlay(graph).every(b=>b.lines.every(Number.isFinite)));
});

test('opposite branch directions leave the same wide gaps instead of painting over one another',()=>{
  for(const [a,b]of [[[0,0,0],[120,0,0]],[[4,-10,25],[101,50,-30]]]){
    const forward=[],backward=[];appendDashedPathLine(forward,a,b);appendDashedPathLine(backward,b,a);
    const segments=values=>Array.from({length:values.length/6},(_,i)=>{const ends=[values.slice(i*6,i*6+3),values.slice(i*6+3,i*6+6)].map(p=>p.map(n=>Math.round(n*1e6)/1e6).join(',')).sort();return ends.join('|');}).sort();
    assert.deepEqual(segments(forward),segments(backward));
    let ink=0;for(let i=0;i<forward.length;i+=6)ink+=Math.hypot(...forward.slice(i,i+3).map((n,j)=>n-forward[i+3+j]));
    assert.ok(Math.abs(ink/Math.hypot(...b.map((n,i)=>n-a[i]))-.3)<1e-9);
  }
});
