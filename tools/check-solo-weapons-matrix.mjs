//Installed-data source robustness only. No synthetic item grants, pose writes,
//native execution, host input, or observed-output substitutions.
import assert from 'node:assert/strict';
import {open,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession} from '../src/solo-session.mjs';
import {getGame} from '../src/track-games.mjs';
import {buildViewerBundle} from './lib/track-viewer-bundle.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const options=Object.freeze({vehicleTypes:[0,1,2,3,4,5],aiDifficulty:2,weaponsEnabled:true});
function validate(snapshot,tick){
  assert.equal(snapshot.ticks,tick);assert.equal(snapshot.aiDifficulty,2);
  assert.equal(snapshot.cars.length,6);assert.equal(snapshot.weapons.enabled,true);
  assert.equal(snapshot.weapons.projectiles.length,24);
  for(const[index,car]of snapshot.cars.entries()){
    assert.equal(car.vehicleType,options.vehicleTypes[index]);assert.equal(car.inventory.length,2);
    for(const vector of[car.position,car.rotation,car.quaternion,...car.parts.flatMap(part=>[part.position,part.rotation])])assert.ok(vector.every(Number.isFinite),`Finite car${index} pose at${tick}`);
    assert.ok(Number.isFinite(car.speed));
  }
  for(const object of snapshot.weapons.objects)assert.ok([...object.position,...object.rotation].every(Number.isFinite),`Finite ${object.kind}${object.index} pose at${tick}`);
}

export async function checkSoloWeaponsMatrix(output,{installation='C:/Program Files (x86)/Psygnosis/Rollcage',ticks=600}={}){
  if(!Number.isInteger(ticks)||ticks<600||ticks>10000)throw Error('Matrix ticks must be600..10000.');
  const target=await open(output,'wx'),journal=await open(`${output}.jsonl`,'wx');
  let archive;
  try{
    const initialBundleHash=hash(await buildViewerBundle('src/solo-session.mjs'));
    const tracks=getGame('rollcage').tracks.filter(track=>!/\/LEV(?:16|17)\.BLP$/.test(track.name));assert.equal(tracks.length,36);
    archive=await RollcageArchive.open(installation);const cases=[];
    for(const track of tracks){
      let session,currentTick=0,lastStage='resource-read',lastDebug=null,lastState,projectileAddresses=new Set();
      const counts={observedPickupCollections:0,inventoryAcquisitions:0,observedProjectileActivations:0,observedRetirementStateEntries:0,peakVisibleProjectiles:0,peakNonzeroProjectileStates:0,collisionEvents:0,projectileCollisionEvents:0,terrainHits:0,modelHits:0,activationsByKind:{},retirementEntriesByKind:{}};
      const first={},stateHistogram={},trajectory=createHash('sha256'),row={track:track.name,ticksRequested:ticks,options,passed:false,counts,first,stateHistogram};
      let data,textures;
      try{
        ({data}=await archive.readResource(track.index));({data:textures}=await archive.readResource(track.textureIndex));row.sourceHash=hash(data);row.textureHash=hash(textures);
        lastStage='construction';
        session=createSession(data,textures,{...options,onDebugFrame(frame){lastStage=frame.stage;lastDebug={stage:frame.stage,tick:frame.tick};},onCollisionDispatch(event){if(event.stage!=='before')return;counts.collisionEvents++;if(projectileAddresses.has(event.object1?.address)||projectileAddresses.has(event.object2?.address)){counts.projectileCollisionEvents++;first.projectileCollision??=currentTick;}}});
        let previous=session.snapshot;validate(previous,0);projectileAddresses=new Set(previous.weapons.projectiles.map(row=>row.address));
        row.initial={pickupCount:previous.weapons.pickups.length,poolBodyCount:previous.weapons.poolBodyCount,inventory:previous.cars.map(car=>car.inventory)};
        for(let tick=1;tick<=ticks;tick++){
          currentTick=tick;lastStage='step-entry';const state=session.step();lastState=state;lastStage='snapshot-validation';validate(state,tick);
          for(let i=0;i<state.weapons.pickups.length;i++)if((previous.weapons.pickups[i].state&0x7f)!==2&&(state.weapons.pickups[i].state&0x7f)===2){counts.observedPickupCollections++;first.pickupCollection??=tick;}
          for(let i=0;i<6;i++)for(let slot=0;slot<2;slot++)if(previous.cars[i].inventory[slot]===255&&state.cars[i].inventory[slot]!==255){counts.inventoryAcquisitions++;first.inventoryAcquisition??=tick;}
          for(let i=0;i<24;i++){
            const p=state.weapons.projectiles[i],prior=previous.weapons.projectiles[i],key=`${p.projectileKind}:${p.state}`;stateHistogram[key]=(stateHistogram[key]??0)+1;
            if(prior.state===0&&p.state!==0){counts.observedProjectileActivations++;counts.activationsByKind[p.projectileKind]=(counts.activationsByKind[p.projectileKind]??0)+1;first.projectileActivation??=tick;}
            if(prior.state!==16&&p.state===16){counts.observedRetirementStateEntries++;counts.retirementEntriesByKind[p.projectileKind]=(counts.retirementEntriesByKind[p.projectileKind]??0)+1;first.retirementState??=tick;}
          }
          counts.peakVisibleProjectiles=Math.max(counts.peakVisibleProjectiles,state.weapons.projectiles.filter(row=>row.visible).length);
          counts.peakNonzeroProjectileStates=Math.max(counts.peakNonzeroProjectileStates,state.weapons.projectiles.filter(row=>row.state!==0).length);
          counts.terrainHits+=state.physics.terrainHits;counts.modelHits+=state.physics.modelHits;
          trajectory.update(JSON.stringify(state));previous=state;
        }
        row.passed=true;
      }catch(error){row.error=error.stack;row.failedStage=lastStage;row.lastDebug=lastDebug;}
      finally{
        row.ticksCompleted=lastState?.ticks??0;row.trajectoryHash=trajectory.digest('hex');
        if(lastState)row.final={cars:lastState.cars.map(car=>({vehicleType:car.vehicleType,laps:car.laps,recoveries:car.recoveries,inventory:car.inventory,position:car.position})),activeProjectiles:lastState.weapons.projectiles.filter(row=>row.state!==0).map(row=>({index:row.index,projectileKind:row.projectileKind,state:row.state})),effects:lastState.weapons.effects};
        session?.dispose();row.disposed=Boolean(session);
        if(data)row.resourceUnchanged=hash(data)===row.sourceHash;if(textures)row.texturesUnchanged=hash(textures)===row.textureHash;
        if(row.resourceUnchanged===false||row.texturesUnchanged===false){row.passed=false;row.error??='Read-only resource mutation detected.';}
      }
      cases.push(row);await journal.write(`${JSON.stringify(row)}\n`);
      console.log(JSON.stringify({track:row.track,passed:row.passed,ticks:row.ticksCompleted,collections:counts.observedPickupCollections,activations:counts.observedProjectileActivations,retirements:counts.observedRetirementStateEntries,peak:counts.peakVisibleProjectiles,...(row.error?{stage:row.failedStage,error:row.error.split('\n')[0]}:{})}));
    }
    const finalBundleHash=hash(await buildViewerBundle('src/solo-session.mjs'));
    const report={method:'Installed source consistency matrix: six Expert AI cars, weapons enabled, naturally authored pickup collection and native-source launch policy. All36LOW/HIGH racing variants, excluding16/17; no synthetic grants, recovery requests, repositioning or original process execution.',
      limits:['This proves bounded source robustness, not original-process combat or full physics fidelity.','Snapshot activation/collection counts are observed state transitions; events wholly within a tick may be missed.','Projectile state16 entries are retirement observations, not an independently instrumented detonation count.','Browser parity is tested separately.'],
      ticks,tracks:tracks.length,options,initialBundleHash,finalBundleHash,sourceFilesStable:initialBundleHash===finalBundleHash,matched:cases.every(row=>row.passed)&&initialBundleHash===finalBundleHash,
      totals:{passed:cases.filter(row=>row.passed).length,failed:cases.filter(row=>!row.passed).length,completedTicks:cases.reduce((sum,row)=>sum+row.ticksCompleted,0),...Object.fromEntries(['observedPickupCollections','inventoryAcquisitions','observedProjectileActivations','observedRetirementStateEntries','projectileCollisionEvents'].map(key=>[key,cases.reduce((sum,row)=>sum+row.counts[key],0)]))},cases};
    await target.writeFile(`${JSON.stringify(report,null,2)}\n`);return report;
  }finally{await archive?.close();await target.close();await journal.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const[output,installation,ticks]=process.argv.slice(2);if(!output||process.argv.length>5)throw Error('Usage: node tools/check-solo-weapons-matrix.mjs NEW_REPORT_JSON [INSTALLATION] [TICKS=600]');
  const report=await checkSoloWeaponsMatrix(output,{...(installation?{installation}:{}),...(ticks?{ticks:Number(ticks)}:{})});console.log(JSON.stringify({matched:report.matched,totals:report.totals,sourceFilesStable:report.sourceFilesStable,output}));if(!report.matched)process.exitCode=1;
}
