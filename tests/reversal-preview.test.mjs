import test from 'node:test';
import assert from 'node:assert/strict';
import {reversalConnectionPreview} from '../tools/track-viewer/reversal-preview.mjs';

const point=(id,position,links=[null,null])=>({id,position,links}),link=id=>({groupId:'g1',pointId:id});
function fixture(){return {groups:[{id:'g0',index:0,points:[]},{id:'g1',index:1,points:[point('junction',[0,-20,0],[link('left'),link('right')]),point('left',[-100,-20,100]),point('right',[100,-20,100]),point('extra',[0,-20,-150]),point('nearby',[0,-20,40])]}]};}

test('junction preview shows the pending branch and both retained paths without changing topology',()=>{
 const topology=fixture(),before=structuredClone(topology),preview=reversalConnectionPreview(topology,{fromPointId:'junction',toPointId:'extra'});
 assert.equal(preview.kept.length,2);assert.ok(preview.groups[1].lines.length>0);assert.ok(preview.groups[1].normals.length>0);assert.equal(preview.labels[0].text,'Junction · junction');assert.deepEqual(preview.labels[0].position,[0,36,0]);
 assert.deepEqual(preview.suggestion,{pointId:'nearby',slot:0,label:'Group 1, point 5 (nearby)'});assert.deepEqual(topology,before);
 for(const row of [preview.source,preview.target,...preview.kept])assert.ok(row.point.position.every((n,i)=>{const display=i?n*-1:n;return display>=preview.bounds[i][0]&&display<=preview.bounds[i][1];}));
});

test('proposed owner is highlighted separately and missing/fully occupied candidates stay explicit',()=>{
 const topology=fixture(),connection={fromPointId:'junction',toPointId:'extra'},preview=reversalConnectionPreview(topology,connection,'nearby');
 assert.equal(preview.labels.find(l=>l.kind==='owner').text,'Proposed owner · nearby');
 for(const p of topology.groups[1].points)p.links=[link('left'),link('right')];assert.equal(reversalConnectionPreview(topology,connection).suggestion,null);
 assert.equal(reversalConnectionPreview(topology,{...connection,toPointId:'missing'}),null);
});

test('coincident junction and destination still have separate identities and finite diagnostic geometry',()=>{
 const topology=fixture();topology.groups[1].points[3].position=[...topology.groups[1].points[0].position];const preview=reversalConnectionPreview(topology,{fromPointId:'junction',toPointId:'extra'});
 assert.equal(preview.labels.length,2);assert.notEqual(preview.labels[0].text,preview.labels[1].text);assert.ok(preview.groups.every(g=>[...g.lines,...g.normals].every(Number.isFinite)));
});

test('all competing destinations are framed equally and a stored branch can become the selected amber branch',()=>{
 const topology=fixture(),connection={id:'pending',fromPointId:'junction',toPointId:'extra'},branches=[{id:'slot-0',fromPointId:'junction',toPointId:'left',slot:0,pendingId:null},{id:'slot-1',fromPointId:'junction',toPointId:'right',slot:1,pendingId:null},{...connection,slot:null,pendingId:'pending'}];
 const all=reversalConnectionPreview(topology,connection,null,{branches});assert.equal(all.selected,undefined);assert.equal(all.target,undefined);assert.deepEqual(all.branches.map(b=>b.letter),['A','B','C']);assert.equal(all.labels.filter(l=>l.branchId).length,3);
 const selected=reversalConnectionPreview(topology,connection,'nearby',{branches,selectedBranchId:'slot-0'});assert.equal(selected.target.point.id,'left');assert.equal(selected.labels.find(l=>l.kind==='selected-branch').branchId,'slot-0');assert.equal(selected.labels.filter(l=>l.kind==='branch').length,2);assert.ok(selected.labels.some(l=>l.text==='Proposed owner · nearby'));
});
