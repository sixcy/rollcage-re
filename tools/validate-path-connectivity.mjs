import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {decodeTrackPaths} from '../src/track-paths.mjs';
import {buildPathTopologyOverlay} from './track-viewer/path-topology-overlay.mjs';

const [output,installation='analysis/pickup-editor-native-baseline-20261024/installation']=process.argv.slice(2);if(!output)throw Error('Usage: node tools/validate-path-connectivity.mjs NEW_REPORT.json [INSTALLATION]');
const archive=await RollcageArchive.open(installation),rows=[],pairs=new Map(),sha=b=>createHash('sha256').update(b).digest('hex');
try{for(const track of getGame('rollcage').tracks){
 const data=(await archive.readResource(track.index)).data,hash=sha(data),graph=decodeTrackPaths(data,false,{connectivity:true}).graph,table=data.readUInt32LE(0x8c),base=data.readUInt32LE(0x98),native=new Map(),expected=new Set();assert.ok(graph);
 for(let g=1;g<data[0x79];g++){const header=table+g*12,count=data.readUInt16LE(header);for(let p=0;p<count;p++)native.set(`g${g}:p${p}`,{group:g,point:p,count,header,offset:base+data.readUInt32LE(header+8)+p*16});}
 for(const [id,n]of native){let next=n.point+(data[n.header+2]?-1:1);if(next<0||next>=n.count)next=data[n.header+4]?(next+n.count)%n.count:-1;if(next>=0&&next!==n.point)expected.add(`${id}>g${n.group}:p${next}`);const word=data.readUInt32LE(n.offset+12);for(const shift of [0,14]){const g=(word>>>shift)&31,p=(word>>>(shift+5))&511,target=`g${g}:p${p}`;if(g&&native.has(target))expected.add(`${id}>${target}`);}}
 assert.deepEqual(new Set(graph.edges.map(e=>`${e.from}>${e.to}`)),expected);assert.equal(graph.nodes.length,native.size);
 for(const node of graph.nodes){const n=native.get(node.id);assert.deepEqual(node.position,[data.readInt16LE(n.offset),-data.readInt16LE(n.offset+2)||0,-data.readInt16LE(n.offset+4)||0]);assert.equal(node.incoming.length,graph.edges.filter(e=>e.to===node.id).length);assert.equal(node.outgoing.length,graph.edges.filter(e=>e.from===node.id).length);}
 const batches=buildPathTopologyOverlay(graph);assert.ok(batches.every(b=>b.lines.every(Number.isFinite)));assert.equal(sha(data),hash);const level=Number(/LEV(\d+)/.exec(track.name)[1]);if(track.name.startsWith('LOW/'))pairs.set(level,graph);else assert.deepEqual(graph,pairs.get(level));
 rows.push({track:track.name,sourceUnchanged:true,nodes:graph.nodes.length,edges:graph.edges.length,branches:graph.edges.filter(e=>e.branchSlots.length).length,merges:graph.nodes.filter(n=>n.incoming.length>1).length,splits:graph.nodes.filter(n=>n.outgoing.length>1).length,invalidLinks:graph.invalidLinks.length,finiteOverlay:true});
}}finally{await archive.close();}
await writeFile(output,JSON.stringify({passed:true,scope:'All40 Rollcage resources; independent raw-byte direction/wrap/branch oracle, native-ID graph degrees, LOW/HIGH parity and finite display geometry. No native process or runtime route-choice claim.',rows},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,resources:rows.length,output}));
