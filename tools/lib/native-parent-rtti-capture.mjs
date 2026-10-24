import {isDeepStrictEqual} from 'node:util';
import {verifyNativeControlCaptureConfiguration} from './native-control-capture.mjs';
import {nativeParentRttiSites,nativeParentRttiObservationRanges} from './native-parent-rtti.mjs';
import {createReduxCaptureConfig} from './redux-capture-config.mjs';

export const nativeParentRttiMapBreakpointIds=Object.freeze(['native-control-before','native-control-after-cameras','native-control-after-world-effects']);
export const nativeParentRttiRequiredCapability='scoped-parent-rtti-and-singleton-map-preflight-v1';
export function nativeParentRttiPolicy(){return {
  parentBreakpointId:'native-control-before',beginBreakpointId:'native-control-after-auxiliary',endBreakpointId:'native-control-after-cameras',
  callBreakpointId:'native-parent-rtti-call',returnBreakpointId:'native-parent-rtti-return',maxPairs:4,maxSnapshots:8,
  singletonMapPreflight:{rootRva:'0x2efb38',dereferenceOffsets:['0','0x7c'],fixedHeadRangeId:'late-singleton-candidate-viewport-map-head',
    regionRangeId:'late-singleton-candidate-viewport-map-region',maxRegionBytes:16*1024*1024,breakpointIds:[...nativeParentRttiMapBreakpointIds]},
};}
export function nativeParentRttiMapCaptureRanges(){return [
  {id:'late-singleton-candidate-viewport-map-head',rva:'0x2efb38',dereferenceOffsets:['0','0x7c'],dereferenceMinimumValues:[1,1],length:100},
  //This is a NONNULL observation domain, conditional on the purpose-specific
  //host preflight BEFORE resolving ANY ranges at the three named points.
  //It is not the unsupported guarded-pointer+readableRegion combination.
  {id:'late-singleton-candidate-viewport-map-region',rva:'0x2efb38',dereferenceOffsets:['0','0x7c'],readableRegion:true,maxRegionBytes:16*1024*1024},
];}
function one(configuration,id){const points=configuration.breakpoints.filter(row=>row.id===id);if(points.length!==1)throw Error(`Parent RTTI requires exactly one ${id}.`);return points[0];}
export function verifyNativeParentRttiCaptureConfiguration(configuration){
  const control=verifyNativeControlCaptureConfiguration(configuration);
  const original=createReduxCaptureConfig('policy-only','hidden-idle','unused-policy-output');
  const paths=['executablePath','workingDirectory','outputDirectory','redirectedDocumentsPath','redirectedShellFolderPath','temporaryDirectory'];
  const allowed=new Set([...Object.keys(original),'captureThreadEnvironment','parentRttiObservation']);
  if(Object.keys(configuration).some(key=>!allowed.has(key)))throw Error('Parent RTTI forbids undeclared service/write/worker/held options.');
  const variable=new Set([...paths,'maxDurationMs','maxEvents','maxSnapshots','breakpoints','ranges','phaseActions']);
  for(const[key,value]of Object.entries(original))if(!variable.has(key)&&!isDeepStrictEqual(configuration[key],value))throw Error(`Parent RTTI owned/security startup policy differs: ${key}.`);
  if(paths.some(key=>typeof configuration[key]!=='string'||!configuration[key])||configuration.maxEvents!==1000000||!isDeepStrictEqual(configuration.ranges,[]))throw Error('Parent RTTI path/event/global range policy differs.');
  const pointIds=['launcher-policy','graphics-policy','before-device-creation','native-control-before','native-control-after','native-control-after-ai','native-control-after-physics','native-control-after-attachments','native-control-after-recovery','native-control-after-drive','native-control-after-auxiliary','native-control-after-cameras','native-control-after-world-effects',...nativeParentRttiSites.map(site=>site.id)];
  if(!isDeepStrictEqual(configuration.breakpoints.map(row=>row.id),pointIds))throw Error('Parent RTTI profile has an undeclared, reordered or duplicate observation site.');
  const startup=original.breakpoints.filter(row=>pointIds.slice(0,3).includes(row.id));
  if(!isDeepStrictEqual(configuration.breakpoints.slice(0,3),startup)||!isDeepStrictEqual(configuration.phaseActions,original.phaseActions))throw Error('Parent RTTI requires the exact three original startup breakpoint/action policies, without additional game writes.');
  if(control.frames!==1||control.lateStages!==3||!control.afterAiCheckpoint||!control.physicsExitCheckpoint||!control.postphysics)throw Error('Parent RTTI requires one complete observed parent through world-effects, including AI and physics checkpoints.');
  if(!isDeepStrictEqual(configuration.parentRttiObservation,nativeParentRttiPolicy()))throw Error('Parent RTTI purpose policy differs from its selected-window/preflight contract.');
  if(configuration.maxSnapshots!==21||configuration.maxDurationMs!==90000||configuration.captureThreadEnvironment!==true)throw Error('Parent RTTI snapshot/duration/TLS bounds differ.');
  for(const site of nativeParentRttiSites){
    const point=one(configuration,site.id),expected={id:site.id,rva:`0x${(site.preferredAddress-0x400000).toString(16)}`,stopAfterHits:0,ranges:nativeParentRttiObservationRanges()};
    if(!isDeepStrictEqual(point,expected))throw Error(`Parent RTTI scoped observer differs at ${site.id}.`);
  }
  const mapRanges=nativeParentRttiMapCaptureRanges();
  for(const point of configuration.breakpoints){
    if(Object.keys(point).some(key=>!['id','rva','stopAfterHits','ranges','captureWhen','skipMatchingHits'].includes(key)))throw Error('Parent RTTI breakpoint contains an undeclared service/write policy.');
    const observed=point.ranges?.filter(row=>mapRanges.some(expected=>row.id===expected.id))??[];
    const wanted=nativeParentRttiMapBreakpointIds.includes(point.id)?mapRanges:[];
    if(!isDeepStrictEqual(observed,wanted))throw Error(`Parent RTTI singleton map preflight/ranges differ at ${point.id}.`);
    if(point.ranges&&new Set(point.ranges.map(row=>row.id)).size!==point.ranges.length)throw Error('Parent RTTI range IDs must be unique within each snapshot.');
  }
  if(configuration.phaseActions?.some(action=>nativeParentRttiSites.some(site=>site.id===action.breakpointId)))throw Error('Parent RTTI cannot write state or alter registers at its external boundaries.');
  return {...control,parentRttiObservation:true,requiredHelperCapability:nativeParentRttiRequiredCapability,maxExternalPairs:4,maxExternalSnapshots:8};
}
