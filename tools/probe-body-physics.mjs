// Exercise reconstructed arithmetic with the recovered immutable body template.
// Inputs below are synthetic fixtures, not a captured original-game trace.
import {readFile,writeFile} from 'node:fs/promises';
import {initializeBody,updateBodyDerived,applyBodyForces,advanceBody} from '../src/body-physics.mjs';
const template=JSON.parse(await readFile('analysis/body-template.json','utf8'));
const config=Buffer.from(template.hex,'hex'),unit=65536,scenarios=[];
function run(name,setup,steps,fraction) {
 const body=initializeBody(config);setup(body);
 let minNorm=Infinity,maxNorm=0;
 const samples=[];
 for(let step=0;step<steps;step++) {
  applyBodyForces(body);updateBodyDerived(body);advanceBody(body,fraction);
  const norm=Math.hypot(...body.quaternion)/unit;minNorm=Math.min(minNorm,norm);maxNorm=Math.max(maxNorm,norm);
  if(step===0||step===steps-1)samples.push({step:step+1,position:body.position.slice(),quaternion:body.quaternion.slice(),velocity:body.linearVelocity.slice()});
 }
 if(!Number.isFinite(minNorm)||minNorm<0.98||maxNorm>1.02)throw Error(`${name}: unstable orientation norm.`);
 scenarios.push({name,steps,fractionQ16:fraction,minQuaternionNorm:minNorm,maxQuaternionNorm:maxNorm,samples});
 return body;
}
const resting=run('stationary original template',()=>{},1000,unit);
if(resting.position.some(Boolean))throw Error('Stationary body drifted.');
const moving=run('synthetic constant linear momentum',body=>{body.momentum=[2*unit,-unit,unit/2];},120,unit/2);
if(JSON.stringify(moving.position)!==JSON.stringify([120*unit,-60*unit,30*unit]))throw Error('Constant-velocity displacement differs from the analytic result.');
run('synthetic angular momentum',body=>{body.angularMomentum=[256*unit,128*unit,-64*unit];},1000,unit/4);
const report={method:'Recovered reference code, original immutable body template, synthetic inputs. No original game execution or runtime equivalence claim.',
 template:{address:template.address,evidence:template.evidence,matchesGhidra:template.matchesGhidra},scenarios};
await writeFile('analysis/body-physics-probe.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
