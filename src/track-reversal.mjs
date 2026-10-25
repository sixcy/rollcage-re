import {createRaceRouteTopology,upgradeRaceRouteTopology,validateRaceRouteTopology} from './race-route-topology.mjs';
import {createCheckpointTopologyDraft,validateCheckpointTopologyDraft} from './checkpoint-topology.mjs';
import {inspectRaceLayout,raceLayoutMoveConstraint} from './race-layout-editor.mjs';
import {findRaceLayoutTerrainSupport} from './race-layout-spatial.mjs';
import {parsePlacements} from './placements.mjs';
import {parseGFXM} from './gfxm.mjs';

const copy=value=>structuredClone(value),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const short=n=>Number.isInteger(n)&&n>=-32768&&n<=32767;
const usablePoints=topology=>topology.groups.flatMap((group,index)=>index?group.points.map(point=>({group,point})):[]);
const pointMap=topology=>new Map(usablePoints(topology).map(row=>[row.point.id,row]));
function item(report,severity,code,message,target={kind:'track'}){const row={id:`reverse-${code}-${report.items.filter(r=>r.code===code).length+1}`,severity,code,message,target};report.items.push(row);return row;}

// Editor transformation, not an original Rollcage authoring feature. Native
// 491390 follows group+2/+4, 449d40 consumes checkpoint order/directions and
// 41dbb0 consumes the first plane to determine the starting-grid orientation.
export function reverseRaceRouteTopology(data,input){
 const topology=upgradeRaceRouteTopology(input),original=createRaceRouteTopology(data),points=pointMap(topology),incoming=new Map([...points.keys()].map(id=>[id,[]]));
 for(const {point}of points.values())for(const link of point.links)if(link){const entries=incoming.get(link.pointId);if(!entries)throw Error('Cannot reverse a route with missing branch targets.');if(!entries.some(row=>row.pointId===point.id))entries.push({groupId:points.get(point.id).group.id,pointId:point.id});}
 topology.reversed=!topology.reversed;
 for(const group of topology.groups){if(!group.index||!group.points.length&&!group.roadId)continue;if(group.sourceGroup!==null){const source=original.groups[group.sourceGroup];group.header[2]=topology.reversed?(source.header[2]?0:1):source.header[2];}else group.header[2]=group.header[2]?0:1;}
 const unresolvedConnections=[];
 for(const {point}of points.values()){const links=incoming.get(point.id);point.links=[links[0]??null,links[1]??null];for(const target of links.slice(2))unresolvedConnections.push({id:`reversed-branch-${unresolvedConnections.length+1}`,fromPointId:point.id,toPointId:target.pointId});}
 return {topology,unresolvedConnections};
}

export function reflectPositionAcrossPlane(position,origin,normal){
 const length=normal.reduce((sum,n)=>sum+n*n,0);if(!length)throw Error('The finish plane has no direction.');
 const distance=normal.reduce((sum,n,i)=>sum+n*(position[i]-origin[i]),0)/length;
 return position.map((n,i)=>Math.round(n-2*distance*normal[i]));
}

function reverseGrid(info,row,plane,report){
 const patches=new Map((row.layout?.starts??[]).map(p=>[p.index,p])),starts=[];
 for(const original of info.starts){const current=patches.get(original.index)??original,candidate=reflectPositionAcrossPlane(current.position,plane.position,plane.direction),prior=findRaceLayoutTerrainSupport(info,current.position),support=candidate.every(short)?findRaceLayoutTerrainSupport(info,candidate):null;
  let position=candidate;
  if(!candidate.every(short)){item(report,'blocker','grid-position-unrepresentable',`Reflected starting slot ${original.index+1} exceeds signed16 coordinates. Place this slot manually; its last valid position is retained only for preview.`,{kind:'start',id:original.index,candidatePosition:candidate,baselinePosition:copy(current.position)});position=copy(current.position);}
  if(prior&&support){const horizontal=Math.hypot(support.point[0]-candidate[0],support.point[2]-candidate[2]);if(horizontal<=64)position=[Math.round(support.point[0]),Math.round(support.point[1]+current.position[1]-prior.point[1]),Math.round(support.point[2])];}
  starts.push({index:original.index,position});
  const constraint=raceLayoutMoveConstraint(info,current.position,position);
  if(!constraint.allowed)item(report,'blocker','grid-slot-unsupported',`Reflected starting slot ${original.index+1} needs manual placement: ${constraint.reason}`,{kind:'start',id:original.index});
 }
 return starts;
}

function sceneryWarnings(geometry,texture,report){
 try{const placements=parsePlacements(texture,parseGFXM(geometry).models).records,animated=placements.filter(p=>p.type===24);if(animated.length)item(report,'warning','scripted-scenery',`${animated.length} scripted scenery object(s) retain their original behavior. Check their timing and approach direction.`,{kind:'model',id:`original-${animated[0].index}`});}
 catch(error){item(report,'warning','scenery-inspection',`Scenery behavior inspection was incomplete: ${error.message}`);}
}

export function createReversedTrackDraft(pair,row,{geometry=pair.LOW.geometry,highGeometry=pair.HIGH.geometry,texture=pair.LOW.texture,reverseArrowArtwork}={}){
 const draft=copy(row),report={version:1,items:[],unresolvedConnections:[],applied:[]};
 if([12,13].includes(row.level)){item(report,'blocker','protected-track',`LEV${row.level} uses executable-hardcoded sector/stage rules. Protected checkpoints and terrain cannot be reversed; no changes were applied.`);return {draft,report};}
 const info=inspectRaceLayout(geometry),routes=reverseRaceRouteTopology(pair.LOW.geometry,row.routeTopology??createRaceRouteTopology(pair.LOW.geometry)),checkpoints=copy(row.checkpointTopology??createCheckpointTopologyDraft(pair.LOW.geometry));
 if(checkpoints.checkpoints.length<2){item(report,'blocker','checkpoint-count','Track reversal requires at least two logical checkpoints.');return {draft,report};}
 const finish=copy(checkpoints.checkpoints[0].planes[0]);checkpoints.checkpoints=[checkpoints.checkpoints[0],...checkpoints.checkpoints.slice(1).reverse()];
 for(const checkpoint of checkpoints.checkpoints)for(const plane of checkpoint.planes)if(plane){const direction=plane.direction.map(n=>n===0?0:-n);if(direction.every(short))plane.direction=direction;else item(report,'blocker','checkpoint-direction-unrepresentable','The reversed plane direction exceeds signed16 storage. Edit its direction manually; the last valid vector is retained only for preview.',{kind:'checkpoint-plane',id:plane.id,candidateDirection:direction,baselineDirection:copy(plane.direction)});}
 draft.routeTopology=routes.topology;draft.checkpointTopology=checkpoints;draft.layout={routes:[],checkpoints:[],starts:reverseGrid(info,row,finish,report)};report.unresolvedConnections=routes.unresolvedConnections;report.applied.push('checkpoint-cycle-and-directions','route-travel-and-branches','reflected-starting-grid');
 for(const pending of report.unresolvedConnections)item(report,'blocker','route-branch-capacity','An inverted junction has more competing branch connections than the two native slots. Choose any competing branch to move or remove.',{kind:'route-connection',id:pending.id,pointId:pending.fromPointId});
 if(reverseArrowArtwork){const result=reverseArrowArtwork(geometry,highGeometry,copy(row.terrain??{heights:[],surfaces:[]}));draft.terrain=result.terrain;for(const warning of result.items??[])item(report,warning.severity??'warning',warning.code??'arrow-artwork',warning.message,warning.target);report.applied.push('recognized-arrow-artwork');}
 else {draft.terrain=copy(row.terrain??{heights:[],surfaces:[]});for(const pattern of draft.terrain.patterns??[])pattern.rotation=(pattern.rotation+2)%4;if(draft.terrain.patterns?.length)report.applied.push('saved-arrow-artwork');item(report,'warning','native-arrow-review','Original speed-pad artwork needs recognition/rotation review. Acceleration materials are preserved.');}
 item(report,'warning','reverse-speeds','AI speed settings are retained as starting values. Tune approaches to corners, slopes and jumps for reverse travel.');
 item(report,'warning','jump-and-drop-review','Inspect jumps, drops, shortcuts and steep sections in reverse. Reversing data cannot guarantee that their geometry is driveable.');
 item(report,'warning','grid-clearance-review','Grid road support is checked, but vehicle/static-object clearance still requires racing and native validation.');
 if([16,17].includes(row.level))item(report,'warning','unverified-racing','This level has no verified AI racing support. Reversal does not enable Racing test.');
 sceneryWarnings(geometry,texture,report);
 return {draft,report:refreshReversalReport(pair,draft,report,{geometry,highGeometry})};
}

export function refreshReversalReport(pair,row,input,{geometry=pair.LOW.geometry,highGeometry=pair.HIGH.geometry}={}){
 const report=copy(input);if(!report||report.version!==1||!Array.isArray(report.items)||!Array.isArray(report.unresolvedConnections))throw Error('Invalid reversal report.');
 for(const record of report.items){if(record.code==='checkpoint-direction-unrepresentable'){const plane=row.checkpointTopology?.checkpoints.flatMap(cp=>cp.planes).find(p=>p?.id===record.target.id);if(plane&&!same(plane.direction,record.target.baselineDirection)&&plane.direction.every(short)){record.severity='info';record.message='Unrepresentable reversed direction was replaced with a manually edited vector.';}}else if(record.code==='grid-position-unrepresentable'){const start=row.layout?.starts.find(p=>p.index===record.target.id);if(start&&!same(start.position,record.target.baselinePosition)&&start.position.every(short)){record.severity='info';record.message='Unrepresentable reflected position was replaced with a manually edited grid slot.';}}}
 const dynamic=new Set(['grid-slot-unsupported','grid-slot-overlap','route-invalid','checkpoint-invalid']);report.items=report.items.filter(i=>!dynamic.has(i.code));
 if([12,13].includes(row.level))return report;
 const info=inspectRaceLayout(geometry),sourceInfo=inspectRaceLayout(pair.LOW.geometry),routes=row.routeTopology??createRaceRouteTopology(pair.LOW.geometry),routeValidation=validateRaceRouteTopology(pair.LOW.geometry,routes,{requireConnected:true,sourceBlockerCountersMayDiffer:true,terrainInfo:info});
 for(const error of routeValidation.errors)item(report,'blocker','route-invalid',error,{kind:'routes'});
 for(const q of ['LOW','HIGH'])try{const base=q==='LOW'?sourceInfo:inspectRaceLayout(pair.HIGH.geometry),live=q==='LOW'?info:inspectRaceLayout(highGeometry);validateCheckpointTopologyDraft(pair[q].geometry,row.checkpointTopology,{level:row.level,info:{...base,scene:live.scene,grid:live.grid,spatial:live.spatial,fallback:live.fallback}});}catch(error){item(report,'blocker','checkpoint-invalid',`${q}: ${error.message}`,{kind:'checkpoints'});}
 const patches=new Map((row.layout?.starts??[]).map(s=>[s.index,s])),starts=sourceInfo.starts.map(s=>patches.get(s.index)??s);
 for(const original of sourceInfo.starts){const next=patches.get(original.index)??original,constraint=raceLayoutMoveConstraint(info,original.position,next.position);if(!constraint.allowed)item(report,'blocker','grid-slot-unsupported',`Starting slot ${original.index+1}: ${constraint.reason}`,{kind:'start',id:original.index});}
 for(let i=0;i<starts.length;i++)for(let j=i+1;j<starts.length;j++)if(Math.hypot(...starts[i].position.map((n,axis)=>n-starts[j].position[axis]))<16)item(report,'blocker','grid-slot-overlap',`Starting slots ${starts[i].index+1} and ${starts[j].index+1} overlap after reflection.`,{kind:'start',id:starts[i].index});
 return report;
}

export function resolveReversalConnection(row,input,id,{fromPointId,slot,discard=false}={}){
 const draft=copy(row),report=copy(input),index=report.unresolvedConnections.findIndex(c=>c.id===id);if(index<0)throw Error('Reversed branch conflict is missing.');const connection=report.unresolvedConnections[index],points=pointMap(draft.routeTopology),from=points.get(fromPointId??connection.fromPointId),to=points.get(connection.toPointId);
 if(!discard){if(!from||!to||![0,1].includes(slot))throw Error('Choose a usable branch owner and outgoing slot.');const target={groupId:to.group.id,pointId:to.point.id};if(from.point.links[slot]!==null&&!same(from.point.links[slot],target))throw Error('The selected outgoing slot is occupied.');from.point.links[slot]=target;}
 report.unresolvedConnections.splice(index,1);for(const item of report.items)if(item.target?.kind==='route-connection'&&item.target.id===id){item.severity='info';item.code='route-connection-resolved';item.message=discard?'Reversed branch explicitly removed.':`Reversed branch retained on ${from.point.id}, slot ${slot+1}.`;}
 return {draft,report};
}

// The two provisional native slots are implementation storage, not a user
// decision to keep those branches. Offer them together with every overflow.
export function reversalJunctionBranches(topology,report,fromPointId){
 const source=pointMap(topology).get(fromPointId)?.point;if(!source)return [];
 const stored=source.links.flatMap((link,slot)=>link?[{id:`stored:${fromPointId}:${slot}:${link.pointId}`,fromPointId,toPointId:link.pointId,slot,pendingId:null}]:[]);
 const pending=report.unresolvedConnections.filter(c=>c.fromPointId===fromPointId).map(c=>({...c,slot:null,pendingId:c.id}));
 return [...stored,...pending];
}

export function resolveReversalJunctionBranch(row,input,junctionPointId,branchId,{fromPointId,slot,discard=false}={}){
 const branch=reversalJunctionBranches(row.routeTopology,input,junctionPointId).find(c=>c.id===branchId);
 if(!branch||!input.unresolvedConnections.some(c=>c.fromPointId===junctionPointId))throw Error('This junction or selected branch no longer needs repair.');
 if(branch.pendingId)return resolveReversalConnection(row,input,branch.pendingId,{fromPointId,slot,discard});
 const draft=copy(row),report=copy(input),points=pointMap(draft.routeTopology),source=points.get(junctionPointId),target=points.get(branch.toPointId),owner=points.get(fromPointId);
 if(!source||!target)throw Error('The selected branch endpoint is missing.');
 if(!discard){
  if(!owner||![0,1].includes(slot))throw Error('Choose a usable branch owner and outgoing slot.');
  if(fromPointId===junctionPointId)throw Error('Choose a different point to move the competing branch.');
  if(owner.point.links[slot]!==null)throw Error('The selected outgoing slot is occupied.');
  owner.point.links[slot]={groupId:target.group.id,pointId:target.point.id};
 }
 source.point.links[branch.slot]=null;
 const pending=report.unresolvedConnections.find(c=>c.fromPointId===junctionPointId),replacement=points.get(pending.toPointId);
 if(!replacement)throw Error('The waiting branch endpoint is missing.');
 // Freeing a provisional slot retains the other competing branches, including
 // one that previously could not fit. No unrelated pending link is discarded.
 const result=resolveReversalConnection(draft,report,pending.id,{fromPointId:junctionPointId,slot:branch.slot});
 const record=result.report.items.find(i=>i.target?.kind==='route-connection'&&i.target.id===pending.id);
 if(record)record.message=`Branch ${junctionPointId} → ${branch.toPointId} ${discard?'removed':`moved to ${fromPointId}, slot ${slot+1}`}; waiting branch ${pending.toPointId} retained in the freed junction slot.`;
 return result;
}
