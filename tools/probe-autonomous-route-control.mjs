import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {writeRouteDirection} from '../src/autonomous-route-geometry.mjs';
import {updateAutonomousRouteControl} from '../src/autonomous-route-control.mjs';
const game=process.argv[2]??'C:/Program Files (x86)/Psygnosis/Rollcage',limit=Number(process.argv[3]??Infinity),output=process.argv[4]??'analysis/autonomous-route-control-probes.json';
if(!(limit>0))throw Error('Arguments: [gameDirectory] [maxResources] [newReportPath].');
const hash=data=>createHash('sha256').update(data).digest('hex'),sourceFiles=['autonomous-route-control.mjs','autonomous-route-geometry.mjs','autonomous-speed.mjs','autonomous-steering.mjs','body-contact-friction.mjs','fixed-integer.mjs'],sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async name=>[name,hash(await readFile('src/'+name))])));
const BODY=0x10000,OTHER=0x20000,METADATA=0x40000,SESSION=0x50000,PACK=0x60000,SCRATCH=0x80000,RESOURCE=0x100000,RECORD=0x909300,U=65536,memory=Buffer.alloc(0xa00000),put=(p,values)=>values.forEach((value,index)=>memory.writeInt32LE(value|0,p+index*4));
const profiles=[
 {name:'route-low',speed:60,skill:0,heading:0,offset:[-24,8,-24],surface:0,velocityUnits:4},
 {name:'route-high-skip',speed:350,skill:3,heading:1,offset:[-24,8,-24],surface:12,velocityUnits:16,skip:true},
 {name:'mode4',speed:260,skill:2,heading:0,offset:[24,-8,24],surface:20,velocityUnits:8,mode:4},
 {name:'steering-suppression',speed:150,skill:3,heading:1,offset:[-24,8,24],surface:31,velocityUnits:8,suppress:true,gear:1,angular:4000001,steering:0x3000},
 {name:'special-near5',speed:100,skill:1,heading:0,offset:[24,0,-24],surface:8,velocityUnits:4,special:5,specialOffset:[50,0,0]},
 {name:'special-far5',speed:420,skill:3,heading:1,offset:[-24,0,24],surface:21,velocityUnits:8,special:5,specialOffset:[300,30,0]},
 {name:'special-retained1',speed:420,skill:2,heading:0,offset:[24,8,24],surface:0,velocityUnits:8,special:1,specialOffset:[70,0,-20],skip:true},
 {name:'pacing-mask',speed:500,skill:1,heading:1,offset:[-24,8,-24],surface:12,velocityUnits:16,pacing:true},
 {name:'disabled',speed:100,skill:0,heading:0,offset:[24,8,-24],surface:0,velocityUnits:4,disabled:true}
];
const summary={resources:0,groups:0,reverseGroups:0,forwardGroups:0,loopedGroups:0,openGroups:0,scenarios:0,ticks:0,fixtureMoves:0,targetChanges:0,targetWraps:0,highSpeedSkipTicks:0,specialCancelled:0,specialRetainedTicks:0,mode4Ticks:0,suppressionClears:0,pacingChecks:0,disabledChecks:0,throttleTicks:0,brakeTicks:0,leftTicks:0,rightTicks:0,progressionFallbacks:0,sourceAndMappedHashesVerified:0},resources=[],samples=[],failures=[],profileCounts=Object.fromEntries(profiles.map(profile=>[profile.name,{scenarios:0,ticks:0,targetChanges:0,throttle:0,brake:0,left:0,right:0}]));
const nextIndex=(route,index)=>route.reverseByte2?(index===0?(route.bytes[4]?route.count-1:null):index-1):(index===route.count-1?(route.bytes[4]?0:null):index+1);
const changedBytesAllowed=new Set([...Array.from({length:6},(_,index)=>0x6c0+index),0x6c8,0x6c9,...Array.from({length:4},(_,index)=>0x710+index)]);
const archive=await RollcageArchive.open(game),archiveIndexSHA256=hash(archive.indexData);
try{
 for(const entry of archive.entries){
  if(resources.length>=limit)break;const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  let current;
  try{
   if(!parseCollisionGrid(data).available)continue;const routes=parseRespawnRoutes(data),usable=routes.groups.filter(route=>route.count>=2);assert(usable.length);assert(RESOURCE+data.length<RECORD);const originalHash=hash(data);data.copy(memory,RESOURCE);
   for(const route of routes.groups){assert.equal(memory.readUInt32LE(RESOURCE+route.offset+8),route.pointRelativeOffset);memory.writeUInt32LE(RESOURCE+route.pointsOffset,RESOURCE+route.offset+8);}
   const mappedHash=hash(memory.subarray(RESOURCE,RESOURCE+data.length));memory.writeUInt32LE(PACK,0x90b98c);memory.writeUInt32LE(RESOURCE+routes.tableOffset,PACK+0x60);memory.writeUInt32LE(SESSION,0x5ecb1c);
   const descriptors=routes.groups.filter(route=>routes.groups[route.byte05]?.count>=2),counts={resource:entry.index,bytes:data.length,sha256:originalHash,mappedSHA256:mappedHash,groupCount:routes.groups.length,usableGroups:usable.length,groups:0,scenarios:0,ticks:0,targetChanges:0};assert(descriptors.length);
   for(const route of usable){
    summary.groups++;counts.groups++;summary[route.reverseByte2?'reverseGroups':'forwardGroups']++;summary[route.bytes[4]?'loopedGroups':'openGroups']++;
    const indices=[...new Set([0,Math.floor(route.count/2),route.count-1])];
    for(const initialIndex of indices)for(const profile of profiles){
     current={route:route.index,index:initialIndex,profile:profile.name};memory.fill(0,BODY,BODY+0x4000);memory.fill(0,OTHER,OTHER+0x4000);memory.fill(0,METADATA,METADATA+128);memory.fill(0,SESSION,SESSION+0x600);memory.fill(0,RECORD,RECORD+2*0x30c);memory.fill(0x36,SCRATCH-0x1000,SCRATCH+64);
     const point=route.pointAt(initialIndex),position=point.position.map((value,axis)=>((value+profile.offset[axis])<<16)),descriptor=routes.groups[route.byte05]?.count>=2?route:descriptors[0],progressGroup=routes.groups[descriptor.byte05],progressIndex=Math.min(initialIndex,progressGroup.count-1);
     if(descriptor!==route)summary.progressionFallbacks++;
     put(BODY+0x34,position);memory.writeInt32LE(0x803,BODY);memory.writeUInt16LE(0,BODY+0x65e);memory.writeInt16LE(profile.speed,BODY+0x668);memory.writeUInt16LE(route.index,BODY+0x6c0);memory.writeUInt16LE(initialIndex,BODY+0x6c2);memory.writeUInt16LE(profile.disabled?0x8000:0x4000|(profile.suppress?0x8000:0),BODY+0x6c4);memory[BODY+0x6c9]=profile.special??0;memory.writeUInt32LE(profile.skip?0x200:0,BODY+0x6ec);memory[BODY+0x6f1]=profile.skill;memory.writeInt8(-1,BODY+0x6f3);memory[BODY+0x6db]=profile.pacing?2:0;memory.writeInt32LE(0x60000,BODY+0x6a8);memory[BODY+0x64f]=profile.gear??0;memory.writeInt32LE(profile.angular??0,BODY+0x50);memory.writeInt32LE(profile.steering??0,BODY+0x644);memory.writeInt32LE(profile.name==='mode4'?-5001:0,BODY+0x3cf8);
     const rotation=profile.heading?[0,0,4096,0,4096,0,-4096,0,0]:[4096,0,0,0,4096,0,0,0,4096];rotation.forEach((value,index)=>memory.writeInt16LE(value,BODY+0xc4+index*2));
     writeRouteDirection(SCRATCH+32,route.index,initialIndex,{memory,scratchBase:SCRATCH-0x200});const direction=[0,4,8].map(offset=>memory.readInt32LE(SCRATCH+32+offset));put(BODY+0x68,direction.map(value=>Math.imul(value,profile.velocityUnits)));
     if(profile.special)put(BODY+0x6cc,position.map((value,axis)=>(value+profile.specialOffset[axis]*U)|0));
     for(let wheel=0;wheel<4;wheel++){memory[BODY+0x324+wheel*200]=wheel<2?1:0;memory.writeUInt32LE(profile.name==='mode4'&&wheel===0?0:METADATA+wheel*32,BODY+0x198+wheel*28);memory.writeUInt32LE(profile.surface<<8,METADATA+wheel*32+12);}
     memory[SESSION+0x551]=profile.mode??0;memory[SESSION+0x553]=profile.name==='mode4'?1:0;memory[SESSION+0x54d]=2;memory[SESSION+0x586]=3;memory.writeUInt32LE(BODY,RECORD);memory.writeUInt32LE(OTHER,RECORD+0x30c);memory[RECORD+0x1c]=1;memory[RECORD+0x30c+0x1c]=1;memory.writeInt32LE(profile.pacing?40000:20000,RECORD+0x24);memory.writeInt32LE(profile.pacing?39000:10000,RECORD+0x30c+0x24);memory.writeUInt32LE(RESOURCE+descriptor.offset,RECORD+0x54);memory.writeUInt32LE(progressIndex,RECORD+0x58);memory.writeInt16LE(400,OTHER+0x668);
     for(let tick=0;tick<4;tick++){
      current.tick=tick;memory.writeInt32LE(profile.disabled||profile.suppress&&tick===0?0xa040:0x40,BODY+0x710);const before=Buffer.from(memory.subarray(BODY,BODY+0x4000)),beforeIndex=memory.readUInt16LE(BODY+0x6c2),beforeSpecial=memory[BODY+0x6c9];
      updateAutonomousRouteControl(BODY,{memory,scratchBase:SCRATCH});
      const group=memory.readUInt16LE(BODY+0x6c0),selected=memory.readUInt16LE(BODY+0x6c2),bits=memory.readUInt32LE(BODY+0x710),special=memory[BODY+0x6c9];assert.equal(group,route.index);assert(selected<route.count);assert.equal(memory.readUInt32LE(RESOURCE+route.offset+8),RESOURCE+route.pointsOffset);const selectedAddress=memory.readUInt32LE(RESOURCE+route.offset+8)+selected*16;assert(selectedAddress>=RESOURCE&&selectedAddress+16<=RESOURCE+data.length);assert.deepEqual(memory.subarray(selectedAddress,selectedAddress+16),data.subarray(route.pointsOffset+selected*16,route.pointsOffset+(selected+1)*16));
      for(let offset=0;offset<0x4000;offset++)if(!changedBytesAllowed.has(offset))assert.equal(memory[BODY+offset],before[offset],`unrelated body byte${offset.toString(16)}`);
      const allowed=new Set([beforeIndex]);if(!profile.disabled&&!special){let candidate=beforeIndex;for(let step=0;step<(profile.skip&&profile.speed>300?2:1);step++){candidate=nextIndex(route,candidate);if(candidate===null)break;allowed.add(candidate);}}assert(allowed.has(selected),`Target${beforeIndex}->${selected} violates authored direction.`);
      if(profile.disabled){assert.deepEqual(memory.subarray(BODY,BODY+0x4000),before);summary.disabledChecks++;}
      if(profile.suppress&&tick===0){assert.equal(memory.readUInt16LE(BODY+0x6c4)&0x8000,0);assert.equal(bits&0xa000,0);summary.suppressionClears++;}
      if(profile.pacing){assert.equal(bits&0x40,0);summary.pacingChecks++;}
      if(beforeSpecial!==0&&special===0)summary.specialCancelled++;if(special)summary.specialRetainedTicks++;if(profile.mode===4)summary.mode4Ticks++;if(profile.skip&&profile.speed>300&&!special)summary.highSpeedSkipTicks++;
      if(selected!==beforeIndex){summary.targetChanges++;counts.targetChanges++;profileCounts[profile.name].targetChanges++;if(route.reverseByte2?selected>beforeIndex:selected<beforeIndex)summary.targetWraps++;}
      const controls={throttle:!!(bits&0x40),brake:!!(bits&0x80),left:!!(bits&0x2000),right:!!(bits&0x8000)};for(const [name,value]of Object.entries(controls))if(value){profileCounts[profile.name][name]++;summary[{throttle:'throttleTicks',brake:'brakeTicks',left:'leftTicks',right:'rightTicks'}[name]]++;}
      assert(Number.isInteger(bits));for(const offset of [0,4,8])assert(Number.isInteger(memory.readInt32LE(SCRATCH-12+offset)));summary.ticks++;counts.ticks++;profileCounts[profile.name].ticks++;
      if(samples.length<32)samples.push({resource:entry.index,route:route.index,initialIndex,reverseByte2:route.reverseByte2,loopByte4:route.bytes[4],profile:profile.name,tick,previousIndex:beforeIndex,selectedIndex:selected,point:route.pointAt(selected).position,specialBefore:beforeSpecial,specialAfter:special,controlBits:bits,controls,positionQ16:[0,4,8].map(offset=>memory.readInt32LE(BODY+0x34+offset)),progressionRoute:descriptor.index,progressionGroup:descriptor.byte05,progressionIndex:progressIndex});
      //Declared fixture motion only: one quarter of the fixed serialized linear
      //velocity. Controls do not feed a new handling/physics approximation.
      for(let axis=0;axis<3;axis++)memory.writeInt32LE((memory.readInt32LE(BODY+0x34+axis*4)+Math.trunc(memory.readInt32LE(BODY+0x68+axis*4)/4))|0,BODY+0x34+axis*4);summary.fixtureMoves++;
     }
     summary.scenarios++;counts.scenarios++;profileCounts[profile.name].scenarios++;
    }
   }
   assert.equal(hash(data),originalHash);assert.equal(hash(memory.subarray(RESOURCE,RESOURCE+data.length)),mappedHash);summary.sourceAndMappedHashesVerified+=2;resources.push(counts);
  }catch(error){failures.push({resource:entry.index,...current,error:error.message,stack:error.stack?.split('\n').slice(0,5)});}
 }
}finally{await archive.close();}
summary.resources=resources.length;if(limit===Infinity&&failures.length===0)assert.equal(summary.resources,80);for(const name of sourceFiles)assert.equal(hash(await readFile('src/'+name)),sourceHashes[name],`Reference source changed during probe:${name}`);
const report={method:'Installed Redux GFXM route-control corpus through actual431750 and all default target/speed/steering/pacing references, with no callbacks or original executable execution. Complete decoded resource copies retain all authored group/point bytes; only group+8 pointers are relocated from file point-base-relative offsets, and runtime pack+60 publishes the copied table. Every usable group is sampled at first/middle/last points across nine declared profiles and four persistent ticks. Body/session/wheel/opponent/progression storage is synthetic zeroed memory with explicitly assigned fields. The progression record stays fixed during a scenario. Between ticks, declared linear fixture motion advances position by serialized velocity/4; this is not reconstructed vehicle physics or a captured runtime. Caller resets control bits at each tick. Invariants check source/mapped hashes,bounds and exact point bytes,authored-direction allowed target steps,unrelated body bytes,control widths,one-shot steering suppression,disabled early return and opponent pacing. Mode4/highspeed/special target inputs are declared profiles. No claim about constructor defaults,autonomous strategy outside431750,collision integration or whole-race behavior.',archiveIndexSHA256,referenceSourceSHA256:sourceHashes,profiles,ticksPerScenario:4,summary,profileCounts,resources,samples,failures};await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({...summary,failures:failures.length,output}));if(failures.length){console.log(JSON.stringify(failures.slice(0,8)));process.exitCode=1;}
