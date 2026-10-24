import test from 'node:test';
import assert from 'node:assert/strict';
import {Navigation} from '../tools/track-viewer/navigation.mjs';
import {cameraRay,intersectTerrain,pickPickup,prepareTerrainPicking,sourceToDisplay,displayToSource} from '../tools/track-viewer/pickup-picking.mjs';

const close=(actual,expected,tolerance=1e-5)=>{assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-expected[i])<=tolerance,`${actual} vs ${expected}`);};
const rect={left:31,top:27,width:800,height:400};
function navigation(){const n=new Navigation();n.mode='fly';n.eye=[0,0,10];n.yaw=0;n.pitch=0;return n;}
function project(n,p,r=rect){const m=n.matrix(r.width/r.height),clip=[0,1,2,3].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12]);return [r.left+(clip[0]/clip[3]+1)*r.width/2,r.top+(1-clip[1]/clip[3])*r.height/2];}
function group(triangles,{kind='terrain',colored=false}={}){
  const stride=colored?11:8,values=new Float32Array(triangles.length*3*stride);
  for(let triangle=0;triangle<triangles.length;triangle++)for(let vertex=0;vertex<3;vertex++)values.set(triangles[triangle][vertex],(triangle*3+vertex)*stride);
  return {kind,colored,vertices:triangles.length*3,buffer:Buffer.from(values.buffer).toString('base64')};
}
const triangle=(z=0)=>[[-2,-2,z],[2,-2,z],[0,2,z]];

test('camera rays invert the displayed projection in CSS coordinates and account for aspect',()=>{
  const n=navigation(),center=cameraRay(n,rect,431,227),right=cameraRay(n,rect,831,227),top=cameraRay(n,rect,431,27);
  close(center.origin,[0,0,10]);close(center.direction,[0,0,-1]);
  assert.ok(Math.abs(right.direction[0]/-right.direction[2]-2*Math.tan(Math.PI/8))<1e-6);
  assert.ok(Math.abs(top.direction[1]/-top.direction[2]-Math.tan(Math.PI/8))<1e-6);
  for(const pixel of [[31,27],[431,227],[830,426],[123,100]]){const ray=cameraRay(n,rect,...pixel),p=ray.origin.map((v,i)=>v+ray.direction[i]*100);close(project(n,p),pixel,0.001);}
  assert.equal(cameraRay(n,rect,30,27),null);assert.equal(cameraRay(n,{...rect,width:0},50,50),null);
});

test('translated and rotated fly/orbit cameras use their actual eye and projection',()=>{
  for(const mode of ['fly','orbit']){
    const n=navigation();n.mode=mode;n.eye=[12,7,18];n.target=[-15,4,23];n.distance=70;n.yaw=0.8;n.pitch=0.3;
    const center=cameraRay(n,rect,431,227);close(center.origin,n.position());close(center.direction,n.forward(),1e-6);
    const ray=cameraRay(n,rect,220,130);close(project(n,ray.origin.map((v,i)=>v+ray.direction[i]*80)),[220,130],0.001);
  }
});

test('terrain intersections choose the nearest double-sided triangle and exclude all props',()=>{
  const scene={groups:[group([triangle(8)],{kind:'object'}),group([triangle(0)]),group([triangle(4)],{colored:true})]};
  const ray={origin:[0,0,10],direction:[0,0,-2]},hit=intersectTerrain(scene,ray);
  close(hit.position,[0,0,4]);assert.equal(hit.distance,6);
  const back=intersectTerrain(scene,{origin:[0,0,-10],direction:[0,0,1]});close(back.position,[0,0,0]);assert.equal(back.distance,10);
  assert.equal(intersectTerrain(scene,{origin:[4,4,10],direction:[0,0,-1]}),null);
  assert.equal(intersectTerrain(scene,{origin:[0,0,10],direction:[0,0,1]}),null);
  assert.equal(intersectTerrain(scene,{origin:[0,0,10],direction:[0,0,0]}),null);
  assert.equal(intersectTerrain(scene,null),null);
});

test('triangle bounds include edges but reject the surrounding AABB and degenerate triangles',()=>{
  const scene={groups:[group([triangle(),[[10,10,0],[10,10,0],[10,10,0]]])]};
  assert.ok(intersectTerrain(scene,{origin:[0,2,5],direction:[0,0,-1]}));
  assert.equal(intersectTerrain(scene,{origin:[1.9,1.9,5],direction:[0,0,-1]}),null);
  assert.equal(intersectTerrain(scene,{origin:[10,10,5],direction:[0,0,-1]}),null);
});

test('pickup markers take screen-space precedence, reject clipped points and use nearest depth on pixel ties',()=>{
  const n=navigation(),points=[[0,0,0],[0,0,4],[0,0,20],[1000,0,0]];
  assert.equal(pickPickup(points,n,rect,431,227),1);
  assert.equal(pickPickup(points,n,rect,440,227),1);
  assert.equal(pickPickup(points,n,rect,442,227),null);
  assert.equal(pickPickup([[0,0,0]],n,rect,431,237),0);
  assert.equal(pickPickup([[0,0,0]],n,rect,431,237.1),null);
  const nearPixel=project(n,[0.02,0,0]);assert.equal(pickPickup([[0,0,4],[0.02,0,0]],n,rect,...nearPixel),1);
  assert.equal(pickPickup([[0,0,20]],n,rect,431,227),null);
  assert.equal(pickPickup(points,n,rect,0,0),null);
  //The app asks markers before terrain: no ground/object hit can change this
  //screen-space result or mutate the supplied placement positions.
  const before=structuredClone(points);pickPickup(points,n,rect,431,227);assert.deepEqual(points,before);
});

test('source/display conversion preserves the signed native axes and template ground clearance',()=>{
  close(sourceToDisplay([12,-8,35]),[12,8,-35]);close(displayToSource([12,8,-35]),[12,-8,35]);
  assert.deepEqual(sourceToDisplay([0,0,-0]),[0,0,0]);
  const scene={groups:[group([[[-50,2,-50],[50,2,-50],[-50,2,50]]])]},template=[-10,8,-10];
  const ground=intersectTerrain(scene,{origin:template,direction:[0,-1,0]});assert.equal(ground.distance,6);
  const clicked=[-20,2,-20],placed=[clicked[0],clicked[1]+ground.distance,clicked[2]];
  close(displayToSource(placed),[-20,-8,20]);
});

test('terrain BVH decodes once per scene across repeated pointer queries at fifty thousand triangles',()=>{
  const triangles=[];for(let row=0;row<200;row++)for(let col=0;col<250;col++)triangles.push([[col,0,row],[col+1,0,row],[col,0,row+1]]);
  const mesh=group(triangles),buffer=mesh.buffer;let reads=0;Object.defineProperty(mesh,'buffer',{get(){reads++;return buffer;}});
  const prop={kind:'object',get buffer(){throw Error('Props must never be decoded for terrain picking.');}},scene={groups:[mesh,prop]};
  const stats=prepareTerrainPicking(scene);assert.equal(stats.triangles,50000);assert.ok(stats.nodes>1000);assert.equal(reads,1);
  for(let i=0;i<20;i++){const hit=intersectTerrain(scene,{origin:[123.1,10,99.1],direction:[0,-1,0]});close(hit.position,[123.1,0,99.1]);assert.equal(hit.distance,10);}
  assert.strictEqual(prepareTerrainPicking(scene),stats);assert.equal(reads,1);
});
