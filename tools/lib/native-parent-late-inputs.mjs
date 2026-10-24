//Source-known observation domains only. Table bytes supply metadata/lengths,
//never replacement input bytes, defaults or native expected outputs.
import animation from '../../src/vehicle-animation-tables.json' with {type:'json'};
import policy from '../../src/camera-policy-constants.json' with {type:'json'};
import curve from '../../src/camera-curve-constants.json' with {type:'json'};
import projection from '../../src/camera-projection-constants.json' with {type:'json'};
import {createCapturedMemory} from './captured-memory.mjs';

const field=(id,preferredAddress,length,evidence)=>({id,preferredAddress,length,comparison:'mutable',evidence});
export const nativeParentLateModuleRegions=Object.freeze([
  //416180 resets four records;41bef0 only returns1..4. No participant-count
  //assumption expands the camera domain to six records.
  field('late-camera-records',0x91ff80,4*0x184,'416180 constructor;4180a0 four184h camera records;41bef0 live stage count'),
  field('late-camera-auxiliary-controls',0x909060,6*76,'41dbb0/416180 six participant76-byte control records'),
  field('late-camera-participants',0x5ec120,16,'4180a0 four current viewport participant selectors'),
  field('late-camera-projection',0x91ceac,8,'4180a0/42f820 live projection floats'),
  field('late-camera-policy',0x91ce90,8,'4180a0/498030 flags and projection state'),
  field('late-camera-observer-count',0x6e6550,4,'44c2b0/41aab0 count bounded40 by original producer'),
  field('late-camera-observers',0x91f6c0,40*56,'44c2b0/41aab0 retain at most40 authored/trigger56-byte records'),
  field('late-camera-observer-fallback',0x9205a0,16,'417720 fallback record: kind and threeQ16 position DWORDs'),
  field('late-camera-clone-output',0x6f9a00,0x20,'4180a0/47d040 placement output and quaternion context'),
  field('late-camera-clone-body',0x6f9a20,384,'4180a0 copies exactly96 body DWORDs to this shared clone'),
  field('late-camera-curve-recovery',0x6f9720,16,'4180a0 four curve-camera contact-age DWORDs'),
  field('late-camera-motion-flags',0x6f9730,4*4,'4180a0 four per-camera motion flags, indexed only by native1..4 stage domain'),
  field('late-camera-motion-vectors',0x6f9740,4*12,'4180a0 four three-DWORD per-camera motion vectors'),
  field('late-camera-curve-directions',0x6f9850,48,'4180a0 four liveQ16 curve normals'),
  field('late-camera-curve-origins',0x6f9880,48,'4180a0 four curve origins'),
  field('late-camera-curve-targets',0x6f98b0,48,'4180a0 four smoothed curve targets'),
  field('late-camera-curve-points',0x6f98f0,4*60,'4180a0 four five-point Q16 curves'),
  field('late-camera-curve-progress',0x6f99e0,32,'4180a0 four curve fractions and four increments'),
  field('late-camera-factorials',0x6f9bc0,13*4,'419bb0..419bce publishes factorial0 through12'),
  field('late-viewport-singletons',0x6efb38,8,'402d10 application singleton and current viewport pointer'),
  field('late-renderer-manager-root',0x6e6388,4,'40ad40/40aeb0 native named renderer lookup'),
  field('late-viewport-double-gate',0x6e6c04,4,'40ad40/40aeb0 configured doubled viewport gate'),
  field('late-camera-clip-planes',0x6fb440,64,'42f820 sixteen mutable plane DWORDs'),
  field('late-camera-clip-flags',0x6e6560,4,'426e20 writes full DWORD clip flag0 or40h'),
  field('late-camera-packed-extent',0x91d594,4,'42f820 packed short viewport dimensions'),
  field('late-camera-distance',0x91d50a,2,'42f8c0 adjusted camera distance'),
  field('late-weather-volumes',0x80dde0,28,'496700 six volume pointers and count80ddf8'),
  field('late-weather-brightness-mode',0x80dedc,4,'498cc0 live weather brightness state'),
  field('late-weather-brightness-rng',0x5ed2b8,8,'498cc0 brightness and separate weather RNG5ed2bc'),
  field('late-weather-state',0x6e6cc8,0x30,'4975b0/497650/498030 cooldowns, flags and screen age'),
  field('late-weather-counter-enabled',0x6e6c8c,4,'489cd0 lazy performance-counter initialization flag'),
  field('late-weather-performance-origin',0x7135a4,16,'489cd0 native signed64 frequency and origin, not a sampled next counter'),
  field('late-weather-screen-root',0x7135b4,8,'498030 screen32x160 root and496700 saved closest sector'),
  field('late-weather-position-backup',0x7136c4,12,'496700 threeQ16 saved position DWORDs'),
  field('late-weather-matrix-velocity-backup',0x713750,44,'49670032-byte body matrix and three velocity DWORDs'),
  field('late-weather-extra-participant-pose',0x80de00,0x36*4,'496830 passes80de00 to41bf40, which copies exactly54 DWORDs and publishes pose/matrix within that extent'),
  field('late-retirement-position',0x6fb954,6,'435ba0 mask40 stores three position WORDs at6fb954/956/958'),
  field('late-ground-query-times',0x7130c0,24,'481200 six participant terrain-query fractions'),
  field('late-vehicle-overlay-records',0x82eda0,6*0x4208,'487540/487790 six indexed4208h overlay consumer domains'),
  field('late-world-fragment-flags',0x849940,36,'480760 constructs36 availability flags'),
  field('late-world-fragment-pointers',0x849980,36*4,'480760 constructs36 body pointers'),
  field('late-world-fragment-shapes',0x849a20,60,'480bf0 three actual20-byte shape descriptors'),
  field('late-world-fragment-counters',0x6e6bc8,12,'480e90/480bf0 current, enqueue and related counters'),
  field('late-destruction-queue',0x9205d8,0x20a,'480760/415190 cursor/root,64 eight-byte queue rows and two byte counters'),
  field('late-destruction-work-roots',0x91f1a0,16,'415230 configuration/current auxiliary/model/body pointers'),
  field('late-destruction-phase',0x5ea4dc,4,'415230 native staged destruction phase'),
  field('late-destruction-index',0x6e6558,4,'415230 native staged destruction progress'),
  field('late-persistent-emitters',0x6ff140,10*20,'44f990 ten persistent20-byte records'),
  {id:'late-attachment-alternate-mesh',preferredAddress:0x919140,length:4,comparison:'read-only',evidence:'44f887 CMOVNZ original alternate mesh DWORD, retained1065; observed original-entry bytes only'},
  field('late-attachment-effect-counts',0x6e6b1c,8,'44f3a0 live count and deduplicated count'),
  {...field('late-attachment-effect-queue-observation',0x902f00,1024,'44f3a0 declared256-pointer observation; not a native capacity claim'),observationBound:true},
  field('late-model-fragment-pool-state',0x810924,24,'48edb0 fixed64x384 pool root/cursor/random/count state'),
  field('late-terrain-animation-roots',0x90b994,8,'44a7a0 mutable24-byte record backing and live count'),
  field('late-vehicle-light-state',0x6e6ca4,8,'48e310 one-time vehicle lights and4096-byte attenuation pointer'),
  field('late-animation-rng',0x5ed008,4,'48e3d0 linked vehicle animation RNG; actual current seed, never initialized by replay'),
  field('late-listener-records',0x849480,4*0x54,'484880 four native listener records including16-byte pointer prefix'),
  field('late-listener-vector',0x6f2408,12,'484880 listener vector begin/end/capacity'),
  field('late-master-volume',0x5ecdb8,4,'450e50 actual SoundManager+5c input bits'),
  field('late-countdown',0x6fb9a4,4,'450e50 increment/wrap countdown'),
  field('late-phase-cache',0x6e6ba4,4,'47f370 writes current phase'),
  field('late-launch-frame-counter',0x712fbc,4,'450e50 pre-phase4 counter'),
  field('late-logical-time-counter',0x6e675c,4,'450e50 successful-parent counter advancement'),
  {id:'late-debris-blend-source',preferredAddress:0x5ec9b0,length:4,comparison:'read-only',evidence:'475e67 MOV EAX,[5ec9b0], then475e6d publishes original DWORD to91d3fc; retained291'},
  {id:'late-camera-default-up-vector',preferredAddress:0x5ea4f4,length:12,comparison:'read-only',evidence:'4180a0 default up vector; retained9001 explicitly reads12 original bytes; no replacement initialization'},
  ...[0x5dc664,0x5dc75c].map(preferredAddress=>({id:`late-camera-viewport-smoothing-${preferredAddress.toString(16)}`,preferredAddress,length:4,comparison:'read-only',evidence:'406d28/406d35 MULSS original binary32 viewport blending inputs; retained3515'})),
  {id:'late-camera-name-format',preferredAddress:0x5d043c,length:10,comparison:'read-only',evidence:'4180a0 CRT format literal %d Player and terminating zero'},
  {id:'late-weather-player-name',preferredAddress:0x5d0254,length:9,comparison:'read-only',evidence:'498030 original eight-byte0 Player name and following zero'},
  ...[0x5dc598,0x5dc5d4,0x5dc620,0x5dc640,0x5dc6ec,0x5dca18,0x5dc5f0,0x5dca34].map(preferredAddress=>({id:`late-weather-scalar-${preferredAddress.toString(16)}`,preferredAddress,length:4,comparison:'read-only',evidence:'498030/497xxx actual binary32 scalar loads'})),
  ...[...animation,policy,...curve.tables,...projection.tables].map((row,index)=>({id:`late-camera-table-${index}`,preferredAddress:Number(row.address),length:(row.bytesHex??row.bytes_hex).length/2,comparison:'read-only',evidence:row.evidence??row.evidence_id})),
].map(Object.freeze));

export function nativeParentLateObservedInputRegions(snapshot,moduleBaseAddress){
  if(!Number.isInteger(moduleBaseAddress))throw Error('Late inputs require the actual module base.');
  const rows=snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges,captured=createCapturedMemory(rows),result=[];
  for(const region of nativeParentLateModuleRegions){
    const address=moduleBaseAddress+region.preferredAddress-0x400000;
    try{captured.span(address,region.length);}catch{continue;}
    result.push({...region,address});
  }
  return result;
}

//Fixed NULL-guarded spans supported by the actual observer. Weather's -1
//sentinel and nullable vector storage are deliberately not blindly followed.
//Application+7c is not assumed to be the post-RTTI map before proving itscast.
export function nativeParentLateHeapInputRanges(){
  const fixed=(id,preferredAddress,offsets,length)=>({id,rva:`0x${(preferredAddress-0x400000).toString(16)}`,dereferenceOffsets:offsets.map(n=>`0x${n.toString(16)}`),dereferenceMinimumValues:offsets.map(()=>1),length});
  return [
    fixed('late-application-header',0x6efb38,[0],0x84),
    fixed('late-current-viewport-header',0x6efb3c,[0],0x94),
    fixed('late-renderer-manager-header',0x6e6388,[0],0x38),
    fixed('late-weather-screen-allocation',0x7135b4,[0],0x1400),
    fixed('late-model-fragment-allocation',0x810924,[0],64*384),
    fixed('late-destruction-auxiliary-allocation',0x9205dc,[0],0x2a0),
    ...[0x8c,0x134,0x1dc,0x284].map((offset,index)=>fixed(`late-destruction-workspace${index}`,0x9205dc,[0,offset],0x800)),
    fixed('late-terrain-animation-allocation',0x90b994,[0],0x6000),
    fixed('late-light-attenuation-allocation',0x6e6ca8,[0],4096),
  ];
}
